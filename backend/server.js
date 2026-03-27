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
 
// Prevent crash on unhandled errors
process.on('uncaughtException', (err) => {
  console.error('🔥 CRITICAL ERROR (Uncaught Exception):', err);
});
process.on('unhandledRejection', (reason, promise) => {
  console.error('🔥 CRITICAL ERROR (Unhandled Rejection):', reason);
});

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

const isRender = !!process.env.RENDER || !!process.env.DATABASE_URL;
const poolConfig = process.env.DATABASE_URL 
  ? { 
      connectionString: process.env.DATABASE_URL,
      ssl: { rejectUnauthorized: false } 
    }
  : {
      user: process.env.DB_USER || 'postgres',
      password: process.env.DB_PASSWORD || 'bncmotors',
      host: process.env.DB_HOST || 'localhost',
      port: parseInt(process.env.DB_PORT || '5432'),
      database: process.env.DB_NAME || 'ems_db',
      ssl: process.env.DB_HOST && process.env.DB_HOST !== 'localhost' ? { rejectUnauthorized: false } : false,
      connectionTimeoutMillis: 5000,
    };

const pool = new Pool(poolConfig);

// Test connection and auto-switch to Simulation Mode on failure
pool.query('SELECT NOW()', async (err, res) => {
  if (err) {
    DB_MODE = 'simulation';
    console.log('\n⚠️  PostgreSQL connection failed. Switching to [SIMULATION MODE] (In-Memory).');
    console.log('   Error:', err.message);
    console.log('   DATABASE_URL set:', !!process.env.DATABASE_URL);
    console.log('   DB_HOST:', process.env.DB_HOST || 'not set');
    console.log('   (Your changes will only persist until the server restarts)\n');
  } else {
    console.log('✅ PostgreSQL connected successfully!');
    try {
      await pool.query(`
          CREATE TABLE IF NOT EXISTS employees (
            id SERIAL PRIMARY KEY,
            name VARCHAR(255) NOT NULL,
            role VARCHAR(255) DEFAULT 'Employee',
            email VARCHAR(255) UNIQUE NOT NULL
          );
          
          -- Ensure missing columns are added if table existed before update
          ALTER TABLE employees ADD COLUMN IF NOT EXISTS role VARCHAR(255) DEFAULT 'Employee';
          ALTER TABLE employees ADD COLUMN IF NOT EXISTS email VARCHAR(255);
          
          -- Fix existing data to make email unique
          UPDATE employees SET email = 'employee_' || id || '@ems.com' WHERE email IS NULL;
          
          -- Then set NOT NULL and UNIQUE if not already
          ALTER TABLE employees ALTER COLUMN email SET NOT NULL;
          DO $$ 
          BEGIN 
            IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'employees_email_unique') THEN
              ALTER TABLE employees ADD CONSTRAINT employees_email_unique UNIQUE (email);
            END IF;
          END $$;

          CREATE TABLE IF NOT EXISTS attendance (
            id SERIAL PRIMARY KEY,
            employee_id INTEGER REFERENCES employees(id) ON DELETE CASCADE,
            status VARCHAR(50) NOT NULL,
            date DATE DEFAULT CURRENT_DATE,
            UNIQUE(employee_id, date)
          );

          CREATE TABLE IF NOT EXISTS leaves (
            id SERIAL PRIMARY KEY,
            employee_id INTEGER REFERENCES employees(id) ON DELETE CASCADE,
            leave_type VARCHAR(50) NOT NULL DEFAULT 'Casual',
            start_date DATE NOT NULL,
            end_date DATE NOT NULL,
            reason TEXT,
            status VARCHAR(20) NOT NULL DEFAULT 'Pending',
            applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
          );
        `);
        console.log('✅ Auto-migration completed: Tables exist.');
      } catch (e) {
        console.error('⚠️ DB Auto-migration failed:', e);
      }
  }
});

// --- API ROUTES ---

// --- JS-BASED AGENT LOGIC (fallback when Python is unavailable) ---
function parseAgentTask(prompt) {
  const lp = prompt.toLowerCase().trim();
  let taskType = 'unknown';
  let queries = [];

  // Apply leave: "apply leave for Surya for 3 days", "apply 5 days sick leave for Arun"
  if (lp.includes('leave') && /(?:apply|request|grant|give|mark|submit)/.test(lp)) {
    const nameMatch = lp.match(/(?:for|to)\s+([a-zA-Z]+)/);
    const daysMatch = lp.match(/(\d+)\s*(?:day|days)/);
    const typeMatch = lp.match(/(sick|casual|earned|maternity|paternity|unpaid)\s*(?:leave)?/);
    let empName = nameMatch ? nameMatch[1].charAt(0).toUpperCase() + nameMatch[1].slice(1) : 'Employee';
    const skipWords = ['sick','casual','earned','maternity','paternity','unpaid','leave','days','day'];
    if (skipWords.includes(empName.toLowerCase())) {
      const allFors = [...lp.matchAll(/(?:for|to)\s+([a-zA-Z]+)/g)];
      empName = allFors.map(m => m[1]).find(n => !skipWords.includes(n.toLowerCase()));
      empName = empName ? empName.charAt(0).toUpperCase() + empName.slice(1) : 'Employee';
    }
    const numDays = daysMatch ? parseInt(daysMatch[1]) : 1;
    const leaveType = typeMatch ? typeMatch[1].charAt(0).toUpperCase() + typeMatch[1].slice(1) : 'Casual';
    return { taskType: 'apply_leave', queries: [`INSERT INTO leaves (employee_id, leave_type, start_date, end_date, reason) SELECT id, '${leaveType}', CURRENT_DATE, CURRENT_DATE + INTERVAL '${numDays - 1} days', 'Applied via AI Agent' FROM employees WHERE name ILIKE '%${empName}%' LIMIT 1;`] };
  }

  // Show leaves: "show leaves", "pending leaves", "list all leaves"
  if (lp.includes('leave') && /(?:show|list|view|display|get|fetch|pending|all|approved|rejected)/.test(lp)) {
    const statusMatch = lp.match(/(pending|approved|rejected)/);
    const filter = statusMatch ? ` WHERE l.status = '${statusMatch[1].charAt(0).toUpperCase() + statusMatch[1].slice(1)}'` : '';
    return { taskType: 'query_leaves', queries: [`SELECT l.*, e.name as employee_name FROM leaves l JOIN employees e ON l.employee_id = e.id${filter} ORDER BY l.applied_at DESC;`] };
  }

  // Approve/Reject leave: "approve leave for Surya", "reject Arun leave"
  if (lp.includes('leave') && /(?:approve|reject|cancel)/.test(lp)) {
    const action = lp.includes('approve') ? 'Approved' : lp.includes('reject') ? 'Rejected' : 'Cancelled';
    let empMatch = lp.match(/(?:for|of)\s+([a-zA-Z]+)/);
    if (!empMatch) empMatch = lp.match(/(?:approve|reject|cancel)\s+([a-zA-Z]+)/);
    const empName = empMatch && !['leave','the','all'].includes(empMatch[1].toLowerCase()) ? empMatch[1] : null;
    const whereClause = empName ? ` AND employee_id IN (SELECT id FROM employees WHERE name ILIKE '%${empName}%')` : '';
    return { taskType: 'update_leave', queries: [`UPDATE leaves SET status = '${action}' WHERE status = 'Pending'${whereClause};`] };
  }

  // Add column: "add field salary", "new column phone"
  let match = lp.match(/(?:add|new|create)\s+(?:field|column)\s+(\w+)/);
  if (match) {
    const col = match[1].toLowerCase().replace(/\s+/g, '_');
    taskType = 'add_column';
    queries.push(`ALTER TABLE employees ADD COLUMN IF NOT EXISTS "${col}" TEXT;`);
    return { taskType, queries };
  }

  // Delete column: "delete field salary", "remove column dob"
  match = lp.match(/(?:delete|remove|drop)\s+(?:field|column)\s+(\w+)/);
  if (match) {
    const col = match[1].toLowerCase();
    taskType = 'delete_column';
    queries.push(`ALTER TABLE employees DROP COLUMN IF EXISTS "${col}";`);
    return { taskType, queries };
  }

  // Show/List all employees
  if (/(?:show|list|display|get|fetch|view)\s*(?:all)?\s*(?:employee|user|worker|staff|people|record|data|table)?s?/i.test(lp)) {
    return { taskType: 'query_data', queries: ['SELECT * FROM employees ORDER BY id DESC;'] };
  }

  // Count employees
  match = lp.match(/(?:how many|count|total)\s*(?:of\s+)?(.+)?/);
  if (match) {
    const filter = (match[1] || '').trim();
    if (filter && !['employees','employee','people','users','all',''].includes(filter)) {
      return { taskType: 'query_data', queries: [`SELECT COUNT(*) as count FROM employees WHERE role ILIKE '%${filter}%';`] };
    }
    return { taskType: 'query_data', queries: ['SELECT COUNT(*) as count FROM employees;'] };
  }

  // Search employees
  match = lp.match(/(?:search|find|look\s*up|who is|where is)\s+(.+)/);
  if (match) {
    const term = match[1].trim();
    return { taskType: 'query_data', queries: [`SELECT * FROM employees WHERE name ILIKE '%${term}%' OR email ILIKE '%${term}%' OR role ILIKE '%${term}%' ORDER BY id;`] };
  }

  // Delete employee: "delete surya", "remove employee arun"
  match = lp.match(/(?:delete|remove)\s+(?:employee|user|worker)?\s*(.+)/);
  if (match) {
    const val = match[1].trim();
    taskType = 'delete_employee';
    queries.push(`DELETE FROM employees WHERE name ILIKE '%${val}%' OR email ILIKE '%${val}%';`);
    return { taskType, queries };
  }

  // Add employee: "add surya kumar", "create user rohan"
  match = lp.match(/(?:add|create|new)\s+(?:employee|user|worker)?\s*(.+)/);
  if (match) {
    const name = match[1].trim().replace(/\b\w/g, c => c.toUpperCase());
    const email = name.toLowerCase().replace(/\s+/g, '_') + '@ems.com';
    taskType = 'insert_employee';
    queries.push(`INSERT INTO employees ("name", "role", "email") VALUES ('${name}', 'Employee', '${email}');`);
    return { taskType, queries };
  }

  // Update employee: "update dhanesh dob-02/02/2003"
  match = lp.match(/(?:update|modify|change)\s+(?:employee|user)?\s*(\w+)\s*(\w+)[\s:-]+(.+)/);
  if (match) {
    const name = match[1].trim();
    const field = match[2].trim().toLowerCase();
    const val = match[3].trim();
    taskType = 'update_employee';
    queries.push(`UPDATE employees SET "${field}" = '${val}' WHERE name ILIKE '%${name}%' OR email ILIKE '%${name}%';`);
    return { taskType, queries };
  }

  return { taskType, queries };
}

// JS Fallback: parse prompt and run SQL directly
async function runJsFallback(prompt, res) {
  try {
    const { taskType, queries } = parseAgentTask(prompt);
    if (taskType === 'unknown' || queries.length === 0) {
      return res.status(400).json({ error: 'Could not understand the command. Try: add employee Name, delete Name, update Name field-value, add field fieldname' });
    }
    let queryRows = [];
    if (DB_MODE !== 'simulation') {
      for (let q of queries) {
        console.log('⚡ Running DB Action via JS Agent:', q);
        const result = await pool.query(q);
        if (q.trim().toUpperCase().startsWith('SELECT')) {
          queryRows = result.rows;
        }
      }
    }
    return res.json({
      status: 'success',
      task: taskType,
      queries: queries,
      message: `AI Agent executed: ${taskType}`,
      query_rows: queryRows
    });
  } catch (fallbackErr) {
    console.error('🤖 JS Agent fallback error:', fallbackErr);
    return res.status(500).json({ error: 'Agent execution failed', details: fallbackErr.message });
  }
}

// AI AGENT INTEGRATION (React <-> Python Swarm)
app.post('/api/agent', async (req, res) => {
  const { prompt } = req.body;
  if (!prompt) return res.status(400).json({ error: 'No prompt provided' });

  const pythonCommand = os.platform() === 'win32' ? 'python' : 'python3';
  const scriptPath = path.join(__dirname, '..', 'agents', 'system.py');

  // Try Python agent first
  try {
    const { stdout, stderr } = await new Promise((resolve, reject) => {
      execFile(pythonCommand, [scriptPath, prompt, process.env.GEMINI_API_KEY || ''],
        { env: { ...process.env, PYTHONIOENCODING: 'utf-8', CLAUDE_API_KEY: process.env.CLAUDE_API_KEY || '', OPENAI_API_KEY: process.env.OPENAI_API_KEY || '' }, timeout: 30000 },
        (error, stdout, stderr) => {
          if (stderr) console.error('🤖 Agent Telemetry (Stderr):\n', stderr);
          if (error) return reject(error);
          resolve({ stdout, stderr });
        }
      );
    });

    console.log('🤖 Agent Raw Output:', stdout);

    const startTag = '===AGENT_B64_START===';
    const endTag = '===AGENT_B64_END===';
    const startIndex = stdout.indexOf(startTag);
    const endIndex = stdout.indexOf(endTag);

    if (startIndex !== -1 && endIndex !== -1) {
      const b64Data = stdout.substring(startIndex + startTag.length, endIndex).trim();
      const jsonStr = Buffer.from(b64Data, 'base64').toString('utf8');
      const payload = JSON.parse(jsonStr);
      console.log('⚡ AI Swarm Success (Decoded):', payload.task);
      const queries = payload.queries || [];

      let queryRows = [];
      if (DB_MODE !== 'simulation') {
        for (let q of queries) {
          console.log('⚡ Running DB Action via Agent:', q);
          const result = await pool.query(q);
          if (q.trim().toUpperCase().startsWith('SELECT')) {
            queryRows = result.rows;
          }
        }
      }
      payload.query_rows = queryRows.length > 0 ? queryRows : (payload.query_rows || []);
      return res.json(payload);
    } else {
      // Python ran but no valid output — use JS fallback
      console.error('⚠️ Python agent returned no markers, using JS fallback');
      return await runJsFallback(prompt, res);
    }
  } catch (err) {
    // Python failed entirely — use JS fallback
    console.error('🤖 Python Agent failed, using JS fallback. Error:', err.message);
    return await runJsFallback(prompt, res);
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

// ========== LEAVE MANAGEMENT API ==========

// 7. GET ALL LEAVES (with employee names)
app.get('/api/leaves', async (req, res) => {
  if (DB_MODE === 'simulation') {
    return res.json([]);
  }
  try {
    const result = await pool.query(`
      SELECT l.*, e.name as employee_name, e.role as employee_role
      FROM leaves l
      JOIN employees e ON l.employee_id = e.id
      ORDER BY l.applied_at DESC
    `);
    res.json(result.rows);
  } catch (err) {
    console.error('Fetch leaves error:', err);
    res.status(500).json({ error: 'DB Error' });
  }
});

// 8. APPLY FOR LEAVE
app.post('/api/leaves', async (req, res) => {
  const { employee_id, leave_type, start_date, end_date, reason } = req.body;
  if (!employee_id || !start_date || !end_date) {
    return res.status(400).json({ error: 'employee_id, start_date, end_date required' });
  }
  if (DB_MODE === 'simulation') {
    return res.status(201).json({ id: 1, ...req.body, status: 'Pending' });
  }
  try {
    const result = await pool.query(
      'INSERT INTO leaves (employee_id, leave_type, start_date, end_date, reason) VALUES ($1, $2, $3, $4, $5) RETURNING *',
      [employee_id, leave_type || 'Casual', start_date, end_date, reason || '']
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error('Apply leave error:', err);
    res.status(500).json({ error: 'DB Error' });
  }
});

// 9. UPDATE LEAVE STATUS (Approve/Reject)
app.put('/api/leaves/:id', async (req, res) => {
  const { id } = req.params;
  const { status } = req.body;
  if (!status) return res.status(400).json({ error: 'status required' });
  if (DB_MODE === 'simulation') {
    return res.json({ id, status });
  }
  try {
    const result = await pool.query(
      'UPDATE leaves SET status = $1 WHERE id = $2 RETURNING *',
      [status, id]
    );
    if (result.rowCount === 0) return res.status(404).json({ error: 'Leave not found' });
    res.json(result.rows[0]);
  } catch (err) {
    console.error('Update leave error:', err);
    res.status(500).json({ error: 'DB Error' });
  }
});

// 10. DELETE LEAVE
app.delete('/api/leaves/:id', async (req, res) => {
  const { id } = req.params;
  if (DB_MODE === 'simulation') {
    return res.json({ success: true });
  }
  try {
    const result = await pool.query('DELETE FROM leaves WHERE id = $1 RETURNING *', [id]);
    if (result.rowCount === 0) return res.status(404).json({ error: 'Leave not found' });
    res.json({ success: true, deleted: result.rows[0] });
  } catch (err) {
    console.error('Delete leave error:', err);
    res.status(500).json({ error: 'DB Error' });
  }
});

app.listen(port, () => {
  console.log(`🚀 EMS Server running on http://localhost:${port}`);
});
