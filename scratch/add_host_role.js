const pool = require('../src/config/database');

async function run() {
  try {
    const res = await pool.query(`
      INSERT INTO roles (name, description) 
      VALUES ('host', 'Host, hostess, and table reception staff') 
      ON CONFLICT (name) DO UPDATE SET description = EXCLUDED.description
      RETURNING *;
    `);
    console.log('Host role upserted successfully:', res.rows[0]);
    process.exit(0);
  } catch (err) {
    console.error('Error inserting host role:', err);
    process.exit(1);
  }
}

run();
