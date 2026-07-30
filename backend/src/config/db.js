const { Pool, types } = require('pg');

// Colunas DATE viram string 'YYYY-MM-DD' em vez de Date, evitando deslocamento de fuso
types.setTypeParser(types.builtins.DATE, (value) => value);

// SSL so quando pedido: na rede interna do Railway o Postgres nao usa SSL,
// e exigir SSL de quem nao oferece derruba a conexao.
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_SSL === 'true' ? { rejectUnauthorized: false } : false,
});

module.exports = pool;
