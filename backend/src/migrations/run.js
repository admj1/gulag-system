require('dotenv').config();
const fs = require('fs');
const path = require('path');
const pool = require('../config/db');

async function run() {
  const dir = __dirname;
  const files = fs.readdirSync(dir).filter((f) => f.endsWith('.sql')).sort();

  for (const file of files) {
    const sql = fs.readFileSync(path.join(dir, file), 'utf8');
    console.log(`Aplicando migration: ${file}`);
    await pool.query(sql);
  }

  console.log('Migrations concluídas.');
  await pool.end();
}

run().catch((err) => {
  console.error('Falha ao rodar migrations:', err);
  process.exit(1);
});
