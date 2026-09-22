import fs from 'fs';
import path from 'path';
import pg from 'pg';
const { Client } = pg;

async function run() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    console.error("No DATABASE_URL found in .env.local");
    process.exit(1);
  }

  const client = new Client({
    connectionString,
    ssl: { rejectUnauthorized: false }
  });

  try {
    await client.connect();
    console.log("Connected to Supabase.");

    const schemaSql = fs.readFileSync(path.join('src', 'server', 'database', 'schema.sql'), 'utf-8');
    console.log("Executing schema.sql...");
    await client.query(schemaSql);
    console.log("schema.sql executed successfully.");

    const rlsSql = fs.readFileSync(path.join('src', 'server', 'database', 'rls.sql'), 'utf-8');
    console.log("Executing rls.sql...");
    await client.query(rlsSql);
    console.log("rls.sql executed successfully.");

  } catch (err) {
    console.error("Error executing SQL:", err);
  } finally {
    await client.end();
  }
}

run();
