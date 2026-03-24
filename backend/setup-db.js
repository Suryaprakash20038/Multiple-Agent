import pg from 'pg';
import fs from 'fs';
import dotenv from 'dotenv';
dotenv.config();

const { Client } = pg;

async function setupDatabase() {
  const dbConfig = {
    user: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD || 'bncmotors',
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '5432'),
  };

  try {
    const client = new Client({ ...dbConfig, database: 'postgres' });
    await client.connect();
    
    // Create DB
    try {
      await client.query('CREATE DATABASE ems_db');
      console.log('Database ems_db created.');
    } catch (e) {
      if (e.code === '42P04') {
        console.log('Database ems_db already exists.');
      } else {
        throw e;
      }
    }
    await client.end();

    // Create Tables
    const emsClient = new Client({ ...dbConfig, database: 'ems_db' });
    await emsClient.connect();
    const schema = fs.readFileSync('./database/schema.sql', 'utf8');
    await emsClient.query(schema);
    console.log('Schema executed successfully.');
    await emsClient.end();

  } catch (err) {
    console.error('Setup failed:', err);
  }
}

setupDatabase();
