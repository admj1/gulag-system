const pool = require('./db');

// Nome exibido em listas/estatisticas: apelido quando houver, senao nome + sobrenome
const DISPLAY_NAME_SQL = `TRIM(COALESCE(NULLIF(nickname, ''), first_name || ' ' || last_name))`;

function displayNameSql(alias = '') {
  const prefix = alias ? `${alias}.` : '';
  return `TRIM(COALESCE(NULLIF(${prefix}nickname, ''), ${prefix}first_name || ' ' || ${prefix}last_name))`;
}

async function getSettings() {
  const { rows } = await pool.query('SELECT * FROM settings WHERE id = 1');
  return rows[0];
}

module.exports = { DISPLAY_NAME_SQL, displayNameSql, getSettings };
