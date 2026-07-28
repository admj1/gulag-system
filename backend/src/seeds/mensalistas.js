require('dotenv').config();
const bcrypt = require('bcryptjs');
const pool = require('../config/db');

// Lista atual da pelada, na numeracao usada na ata em papel.
// O script casa com quem ja esta cadastrado (por apelido ou nome) para nao duplicar.
const MENSALISTAS = [
  [1, 'Gabriel', 'Maciel'],
  [2, 'Ademario', 'Junior'],
  [3, 'Mateta', ''],
  [4, 'Wasley', ''],
  [5, 'Félix', ''],
  [6, 'George', ''],
  [7, 'André', 'Lucas'],
  [8, 'Dennys', ''],
  [9, 'Adriano', ''],
  [10, 'Soneca', ''],
  [11, 'Nelson', ''],
  [12, 'Lucas', ''],
  [13, 'Igor', 'Cordeiro'],
  [14, 'Juninho', ''],
  [15, 'Caio', 'Solano'],
  [16, 'Guilherme', ''],
  [17, 'Anderson', ''],
  [18, 'Wandinho', ''],
  [19, 'Bruno', ''],
  [20, 'Nicolas', 'Teofilo'],
];

const normalize = (value) =>
  (value || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .trim()
    .toLowerCase();

function matches(player, firstName, lastName) {
  const first = normalize(firstName);
  const last = normalize(lastName);
  const pFirst = normalize(player.first_name);
  const pLast = normalize(player.last_name);
  const pNick = normalize(player.nickname);

  if (pNick && pNick === first) return true;
  if (last) return pFirst === first && pLast === last;
  // Entrada de nome unico: casa com o primeiro nome ou com o apelido
  return pFirst === first;
}

async function run() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { rows: players } = await client.query(
      'SELECT id, first_name, last_name, nickname FROM players'
    );

    const used = new Set();
    for (const [number, firstName, lastName] of MENSALISTAS) {
      const label = `${String(number).padStart(2)} - ${`${firstName} ${lastName}`.trim()}`;
      const existing = players.find((p) => !used.has(p.id) && matches(p, firstName, lastName));

      // A numeracao e exclusiva: libera a vaga antes de atribuir
      await client.query('UPDATE players SET mensalista_number = NULL WHERE mensalista_number = $1', [number]);

      if (existing) {
        used.add(existing.id);
        await client.query(
          `UPDATE players SET player_type = 'mensalista', mensalista_number = $1 WHERE id = $2`,
          [number, existing.id]
        );
        console.log(`vinculado  ${label}`);
        continue;
      }

      const passwordHash = await bcrypt.hash(Math.random().toString(36).slice(2), 10);
      const { rows } = await client.query(
        `INSERT INTO players (first_name, last_name, password_hash, player_type, mensalista_number)
         VALUES ($1, $2, $3, 'mensalista', $4) RETURNING id`,
        [firstName, lastName, passwordHash, number]
      );
      used.add(rows[0].id);
      console.log(`criado     ${label}`);
    }

    await client.query('COMMIT');
    console.log('\nMensalistas com a numeração 1-20 aplicada.');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
    await pool.end();
  }
}

run().catch((err) => {
  console.error('Falha ao cadastrar mensalistas:', err.message);
  process.exit(1);
});
