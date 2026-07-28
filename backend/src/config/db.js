const { Pool, types } = require('pg');

// Colunas DATE viram string 'YYYY-MM-DD' em vez de Date, evitando deslocamento de fuso
types.setTypeParser(types.builtins.DATE, (value) => value);

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
});

module.exports = pool;
