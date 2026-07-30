import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import api from '../api/client';
import { inputClass, Avatar, Card, EmptyState } from '../components/ui';

// Comparacao 1x1. Os dois jogadores ficam na URL (?a=&b=) para o confronto
// poder ser mandado no grupo do zap.
const n = (value) => Number(value) || 0;
const perMatch = (value, matches) => (matches > 0 ? n(value) / n(matches) : 0);

const one = (v) => v.toFixed(1);
const two = (v) => v.toFixed(2);

// better: 'high' = quem tem mais leva; 'low' = quem tem menos leva
const ROWS = [
  { label: 'Peladas jogadas', get: (s) => n(s.totals.peladas_jogadas), better: 'high' },
  { label: 'Gols', get: (s) => n(s.totals.goals), better: 'high' },
  {
    label: 'Gols por pelada',
    get: (s) => perMatch(s.totals.goals, s.totals.peladas_jogadas),
    format: two,
    better: 'high',
  },
  { label: 'Assistências', get: (s) => n(s.totals.assists), better: 'high' },
  {
    label: 'Assist. por pelada',
    get: (s) => perMatch(s.totals.assists, s.totals.peladas_jogadas),
    format: two,
    better: 'high',
  },
  { label: 'Vitórias do time', get: (s) => n(s.collective.wins), better: 'high' },
  { label: 'Empates do time', get: (s) => n(s.collective.draws) },
  { label: 'Derrotas do time', get: (s) => n(s.collective.losses), better: 'low' },
  {
    label: 'Aproveitamento',
    get: (s) => {
      const { wins, draws, losses } = s.collective;
      const jogos = n(wins) + n(draws) + n(losses);
      return jogos > 0 ? ((n(wins) * 3 + n(draws)) / (jogos * 3)) * 100 : 0;
    },
    format: (v) => `${Math.round(v)}%`,
    better: 'high',
  },
  { label: 'Melhor time do dia', get: (s) => n(s.collective.bestTeamCount), better: 'high' },
  { label: 'Amarelos', get: (s) => n(s.totals.yellow_cards), better: 'low' },
  { label: 'Azuis', get: (s) => n(s.totals.blue_cards), better: 'low' },
  { label: 'Vermelhos', get: (s) => n(s.totals.red_cards), better: 'low' },
  { label: 'Ausências', get: (s) => n(s.totals.absences), better: 'low' },
];

const GK_ROWS = [
  { label: 'Vitórias', get: (s) => n(s.goalkeeperTotals.wins), better: 'high' },
  { label: 'Empates', get: (s) => n(s.goalkeeperTotals.draws) },
  { label: 'Derrotas', get: (s) => n(s.goalkeeperTotals.losses), better: 'low' },
  { label: 'Pênaltis defendidos', get: (s) => n(s.goalkeeperTotals.penalties_saved), better: 'high' },
  { label: 'Assistências', get: (s) => n(s.goalkeeperTotals.assists), better: 'high' },
  { label: 'Gols', get: (s) => n(s.goalkeeperTotals.goals), better: 'high' },
];

export default function ComparePlayersPage() {
  const [players, setPlayers] = useState([]);
  const [params, setParams] = useSearchParams();
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);

  const a = params.get('a') || '';
  const b = params.get('b') || '';

  useEffect(() => {
    api.get('/players').then(({ data }) => setPlayers(data));
  }, []);

  useEffect(() => {
    if (!a || !b || a === b) {
      setResult(null);
      return;
    }
    setLoading(true);
    api.get('/stats/compare', { params: { a, b } })
      .then(({ data }) => setResult(data))
      .catch((err) => {
        setResult(null);
        toast.error(err.response?.data?.error || 'Erro ao comparar jogadores');
      })
      .finally(() => setLoading(false));
  }, [a, b]);

  function pick(side, value) {
    const next = new URLSearchParams(params);
    if (value) next.set(side, value);
    else next.delete(side);
    setParams(next, { replace: true });
  }

  function swap() {
    const next = new URLSearchParams(params);
    next.set('a', b);
    next.set('b', a);
    setParams(next, { replace: true });
  }

  const bothGoalkeepers = result
    && result.a.player.player_type === 'goleiro'
    && result.b.player.player_type === 'goleiro';

  return (
    <div className="flex flex-col gap-4">
      <Link to="/players" className="text-sm text-gulag-cyan underline">← voltar</Link>
      <h1 className="text-2xl font-bold text-gray-100">Comparar jogadores</h1>

      <Card>
        <div className="grid gap-2 sm:grid-cols-[1fr_auto_1fr] items-end">
          <PlayerSelect label="Jogador 1" players={players} value={a} exclude={b} onChange={(v) => pick('a', v)} />
          <button
            onClick={swap}
            disabled={!a || !b}
            title="Inverter os lados"
            className="self-center text-gulag-cyan text-lg px-2 py-2 disabled:opacity-40"
          >
            ⇄
          </button>
          <PlayerSelect label="Jogador 2" players={players} value={b} exclude={a} onChange={(v) => pick('b', v)} />
        </div>
      </Card>

      {!a || !b ? (
        <Card><EmptyState>Escolha dois jogadores para ver o comparativo.</EmptyState></Card>
      ) : loading || !result ? (
        <p className="text-gray-400">Carregando...</p>
      ) : (
        <>
          <Card>
            <div className="grid grid-cols-3 items-center gap-2">
              <PlayerHead player={result.a.player} align="items-start" />
              <span className="text-center text-xs text-gray-600">x</span>
              <PlayerHead player={result.b.player} align="items-end" />
            </div>
          </Card>

          <Card title="Números acumulados">
            <ul className="flex flex-col">
              {ROWS.map((row) => (
                <CompareRow key={row.label} row={row} a={result.a} b={result.b} />
              ))}
            </ul>
          </Card>

          {bothGoalkeepers && (
            <Card title="Como goleiros">
              <ul className="flex flex-col">
                {GK_ROWS.map((row) => (
                  <CompareRow key={row.label} row={row} a={result.a} b={result.b} />
                ))}
              </ul>
            </Card>
          )}

          <HeadToHead
            data={result.headToHead}
            nameA={result.a.player.name}
            nameB={result.b.player.name}
          />
        </>
      )}
    </div>
  );
}

function PlayerSelect({ label, players, value, exclude, onChange }) {
  return (
    <label className="flex flex-col gap-1 text-sm text-gray-400 min-w-0">
      {label}
      <select value={value} onChange={(e) => onChange(e.target.value)} className={inputClass}>
        <option value="">Selecione...</option>
        {players
          .filter((p) => String(p.id) !== String(exclude))
          .map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}{p.player_type === 'goleiro' ? ' (goleiro)' : ''}
            </option>
          ))}
      </select>
    </label>
  );
}

function PlayerHead({ player, align }) {
  return (
    <Link to={`/players/${player.id}`} className={`flex flex-col ${align} gap-1 min-w-0`}>
      <Avatar src={player.photo_url} name={player.name} />
      <span className="text-sm font-medium text-gray-100 truncate max-w-full">{player.name}</span>
      <span className="text-[11px] text-gray-500">
        {[player.position, `${player.stars}★`].filter(Boolean).join(' · ')}
      </span>
    </Link>
  );
}

function CompareRow({ row, a, b }) {
  const valueA = row.get(a);
  const valueB = row.get(b);
  const format = row.format || ((v) => (Number.isInteger(v) ? String(v) : one(v)));

  let winner = null;
  if (row.better && valueA !== valueB) {
    const aWins = row.better === 'high' ? valueA > valueB : valueA < valueB;
    winner = aWins ? 'a' : 'b';
  }

  const cell = (isWinner) => `text-lg tabular-nums ${
    isWinner ? 'text-emerald-400 font-bold' : 'text-gray-200'
  }`;

  return (
    <li className="grid grid-cols-3 items-center gap-2 py-2 border-b border-gulag-border last:border-0">
      <span className={`text-right ${cell(winner === 'a')}`}>{format(valueA)}</span>
      <span className="text-center text-[11px] uppercase tracking-wide text-gray-500 leading-tight">
        {row.label}
      </span>
      <span className={`text-left ${cell(winner === 'b')}`}>{format(valueB)}</span>
    </li>
  );
}

// Nos dias em lados opostos, o que dá para afirmar é qual dos dois times terminou
// o dia melhor — confronto direto partida a partida a ata não guarda.
function HeadToHead({ data, nameA, nameB }) {
  if (!data || (data.peladas_juntos === 0 && data.peladas_adversarios === 0)) {
    return (
      <Card title="Quando se cruzaram">
        <EmptyState>Os dois ainda não jogaram na mesma pelada.</EmptyState>
      </Card>
    );
  }

  return (
    <Card title="Quando se cruzaram">
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="border border-gulag-border rounded p-3 bg-gulag-surface-2">
          <p className="text-xs text-gray-400 mb-1">No mesmo time</p>
          <p className="text-2xl font-bold text-gulag-cyan">{data.peladas_juntos}</p>
          <p className="text-xs text-gray-500">
            peladas · {data.juntos_wins}V {data.juntos_draws}E {data.juntos_losses}D
          </p>
        </div>

        <div className="border border-gulag-border rounded p-3 bg-gulag-surface-2">
          <p className="text-xs text-gray-400 mb-1">Em times adversários</p>
          <p className="text-2xl font-bold text-gulag-cyan">{data.peladas_adversarios}</p>
          <p className="text-xs text-gray-500">
            peladas · terminou o dia melhor: {nameA} {data.a_dias_melhores}x · {nameB}{' '}
            {data.b_dias_melhores}x
            {data.dias_iguais > 0 && ` · ${data.dias_iguais} empatado(s)`}
          </p>
        </div>
      </div>
      <p className="text-xs text-gray-500 mt-2">
        A ata guarda quantas vitórias cada time fez no dia inteiro, não partida a partida. Então
        aqui não dá para saber quem ganhou o confronto entre os dois: o que se compara é qual dos
        times terminou o dia melhor (mais vitórias e, no empate, menos derrotas).
      </p>
    </Card>
  );
}
