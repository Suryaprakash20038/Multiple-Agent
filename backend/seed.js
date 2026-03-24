import pg from 'pg';
import dotenv from 'dotenv';
dotenv.config();

const { Client } = pg;

async function seed() {
  const client = new Client({
    user: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD || 'bncmotors',
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '5432'),
    database: process.env.DB_NAME || 'ems_db'
  });

  try {
    await client.connect();
    console.log('Connected to ems_db for seeding.');

    const employees = [
      { name: 'Arun Kumar', role: 'Frontend Developer', email: 'arun@ems.com' }
     
    ];

    for (const emp of employees) {
      // Use ON CONFLICT to avoid duplicate errors if run multiple times
      await client.query(
        'INSERT INTO employees (name, role, email) VALUES ($1, $2, $3) ON CONFLICT (email) DO NOTHING',
        [emp.name, emp.role, emp.email]
      );
    }
    console.log('Successfully seeded 6 employees!');
  } catch (err) {
    console.error('Seeding failed:', err);
  } finally {
    await client.end();
  }
}

seed();
