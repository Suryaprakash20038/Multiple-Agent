import express from 'express';
import pg from 'pg';
import cors from 'cors';
import dotenv from 'dotenv';
import { exec, execFile } from 'child_process';
import os from 'os';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config();

const app = express();
const port = process.env.PORT || 5000;

// Middleware
app.use(cors());
app.use(express.json());

// --- IN-MEMORY FALLBACK (For Simulation if DB fails) ---
let DB_MODE = 'postgresql';
let mockEmployees = [
  { id: 1, name: 'Sample Employee', role: 'System Demo', email: 'demo@ems.com' }
];
let mockAttendance = [];

const { Pool } = pg;

const isRender = !!process.env.RENDER;
const poolConfig = isRender 
  ? { connectionString: 'postgresql://ems_db_057s_user:P7IkoevWTDdp2hOWGnfkZwZ5GxswQKJK@dpg-d72aetc50q8c738m5oq0-a/ems_db_057s' }
  : {
      user: process.env.DB_USER || 'postgres',
      password: process.env.DB_PASSWORD || 'bncmotors',
      host: process.env.DB_HOST || 'localhost',
      port: parseInt(process.env.DB_PORT || '5432'),
      database: process.env.DB_NAME || 'ems_db',
      connectionTimeoutMillis: 2000,
    };

const pool = new Pool(poolConfig);

// Test connection and auto-switch to Simulation Mode on failure
pool.query('SELECT NOW()', async (err, res) => {
  if (err) {
    DB_MODE = 'simulation';
    console.log('\n⚠️  PostgreSQL connection failed. Switching to [SIMULATION MODE] (In-Memory).');
    console.log('   (Your changes will only persist until the server restarts)\n');
  } else {
    console.log('✅ PostgreSQL connected successfully!');
    if (isRender) {
      try {
        await pool.query(`
          CREATE TABLE IF NOT EXISTS employees (
            id SERIAL PRIMARY KEY,
            name VARCHAR(255) NOT NULL,
            role VARCHAR(255) NOT NULL,
            email VARCHAR(255) UNIQUE NOT NULL
          );
          CREATE TABLE IF NOT EXISTS attendance (
            id SERIAL PRIMARY KEY,
            employee_id INTEGER REFERENCES employees(id) ON DELETE CASCADE,
            status VARCHAR(50) NOT NULL,
            date DATE DEFAULT CURRENT_DATE,
            UNIQUE(employee_id, date)
          );
        `);
        console.log('✅ Auto-migration completed: Tables exist.');
      } catch (e) {
        console.error('⚠️ DB Auto-migration failed:', e);
      }
    }
  }
});

// --- API ROUTES ---

// AI AGENT INTEGRATION (React <-> Python Swarm)
app.post('/api/agent', (req, res) => {
  const { prompt } = req.body;
  if (!prompt) return res.status(400).json({ error: 'No prompt provided' });

  console.log('\n🤖 Agent processing prompt:', prompt);
  
  const pythonCommand = os.platform() === 'win32' ? 'python' : 'python3';
  const scriptPath = path.join(__dirname, '..', 'agents', 'system.py');
  
  execFile(pythonCommand, [scriptPath, prompt, process.env.GEMINI_API_KEY || ''], { env: { ...process.env, PYTHONIOENCODING: 'utf-8' } }, async (error, stdout, stderr) => {
    if (error) {
      if (pythonCommand === 'python3' && error.code === 'ENOENT') {
        console.log('⚠️ python3 not found, falling back to python...');
        return execFile('python', [scriptPath, prompt, process.env.GEMINI_API_KEY || ''], { env: { ...process.env, PYTHONIOENCODING: 'utf-8' } }, handleAgentResponse);
      }
      
      console.error('Agent Execution Error:', error);
      console.error('STDERR:', stderr);
      console.error('STDOUT:', stdout);
      return res.status(500).json({ error: 'AI Agent failed to execute', details: stderr || error.message });
    }
    
    handleAgentResponse(error, stdout, stderr);
  });

  async function handleAgentResponse(error, stdout, stderr) {
    if (error) {
      console.error('Agent Fallback Execution Error:', error);
      return res.status(500).json({ error: 'AI Agent fallback failed to execute', details: stderr || error.message });
    }
    
    console.log('Agent Raw Output:', stdout);
    
    try {
      const startTag = '---BEGIN_JSON---';
      const endTag = '---END_JSON---';
      
      const startIndex = stdout.indexOf(startTag);
      const endIndex = stdout.indexOf(endTag);
      
      if (startIndex !== -1 && endIndex !== -1) {
        const jsonStr = stdout.substring(startIndex + startTag.length, endIndex).trim();
        const payload = JSON.parse(jsonStr);
        const queries = payload.queries || [];
        
        if (DB_MODE !== 'simulation') {
           for (let q of queries) {
             console.log('⚡ Running DB Migration/Action via Agent:', q);
             await pool.query(q);
           }
        }
        res.json(payload);
      } else {
        console.error('Missing JSON markers in agent output');
        res.status(500).json({ error: 'Agent failed to emit final JSON. See console.' });
      }
    } catch(err) {
      console.error('Agent parse error:', err);
      res.status(500).json({ error: 'Agent parse failure', details: err.message });
    }
  }
});

// 1. ADD EMPLOYEE
app.post('/api/employees', async (req, res) => {
  const { name, role, email } = req.body;
  
  if (DB_MODE === 'simulation') {
    const newEmp = { id: mockEmployees.length + 1, name, role, email };
    mockEmployees.unshift(newEmp);
    return res.status(201).json(newEmp);
  }

  try {
    const result = await pool.query(
      'INSERT INTO employees (name, role, email) VALUES ($1, $2, $3) RETURNING *',
      [name, role, email]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: 'DB Error' });
  }
});

// 2. GET ALL EMPLOYEES
app.get('/api/employees', async (req, res) => {
  if (DB_MODE === 'simulation') return res.json(mockEmployees);

  try {
    const result = await pool.query('SELECT * FROM employees ORDER BY id DESC');
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: 'DB Error' });
  }
});

// 3. EDIT EMPLOYEE
app.put('/api/employees/:id', async (req, res) => {
  const { id } = req.params;
  const updates = req.body;

  if (DB_MODE === 'simulation') {
    const idx = mockEmployees.findIndex(e => e.id === parseInt(id));
    if (idx === -1) return res.status(404).json({ error: 'Not found' });
    mockEmployees[idx] = { ...mockEmployees[idx], ...updates };
    return res.json(mockEmployees[idx]);
  }

  try {
    const keys = Object.keys(updates);
    if (keys.length === 0) return res.status(400).json({ error: 'No data to update' });
    
    // Build parameterized query dynamically: SET col1 = $1, col2 = $2
    const setClause = keys.map((k, idx) => `"${k}" = $${idx + 1}`).join(', ');
    const values = Object.values(updates);
    
    const result = await pool.query(
      `UPDATE employees SET ${setClause} WHERE id = $${keys.length + 1} RETURNING *`,
      [...values, id]
    );
    res.json(result.rows[0]);
  } catch (err) {
    console.error('Update error:', err);
    res.status(500).json({ error: 'DB Error' });
  }
});

// 4. DELETE EMPLOYEE
app.delete('/api/employees/:id', async (req, res) => {
  const { id } = req.params;

  if (DB_MODE === 'simulation') {
    const idx = mockEmployees.findIndex(e => e.id === parseInt(id));
    if (idx === -1) return res.status(404).json({ error: 'Not found' });
    mockEmployees.splice(idx, 1);
    return res.json({ success: true });
  }

  try {
    const result = await pool.query('DELETE FROM employees WHERE id = $1 RETURNING *', [id]);
    if (result.rowCount === 0) return res.status(404).json({ error: 'Employee not found' });
    res.json({ success: true, deleted: result.rows[0] });
  } catch (err) {
    console.error('Delete error:', err);
    res.status(500).json({ error: 'DB Error' });
  }
});

// 5. GET ATTENDANCE FOR TODAY
app.get('/api/attendance', async (req, res) => {
  if (DB_MODE === 'simulation') {
    // Return mock attendance mapping
    const todayStr = new Date().toDateString();
    const todayRecords = mockAttendance.filter(a => new Date(a.date).toDateString() === todayStr);
    return res.json(todayRecords);
  }

  try {
    const result = await pool.query(`
      SELECT e.id as employee_id, e.name, a.status, a.date 
      FROM employees e 
      LEFT JOIN attendance a ON e.id = a.employee_id AND a.date = CURRENT_DATE
      ORDER BY e.id DESC
    `);
    res.json(result.rows);
  } catch (err) {
    console.error('Fetch attendance error:', err);
    res.status(500).json({ error: 'DB Error' });
  }
});

// 6. MARK ATTENDANCE
app.post('/api/attendance', async (req, res) => {
  const { employee_id, status } = req.body;

  if (DB_MODE === 'simulation') {
    const att = { id: mockAttendance.length + 1, employee_id, status, date: new Date() };
    mockAttendance.push(att);
    return res.status(201).json(att);
  }

  try {
    const result = await pool.query(
      'INSERT INTO attendance (employee_id, status) VALUES ($1, $2) ON CONFLICT (employee_id, date) DO UPDATE SET status = EXCLUDED.status RETURNING *',
      [employee_id, status]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: 'DB Error' });
  }
});

app.listen(port, () => {
  console.log(`🚀 EMS Server running on http://localhost:${port}`);
});
