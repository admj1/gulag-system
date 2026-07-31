import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import api from '../../api/client';
import { newClientId, useLiveQueue } from '../../components/liveQueue';
import { Button, Card, EmptyState, bestTeam, matchDateLabel } from '../../components/ui';

// Lancamento em campo, pelo celular: um toque no cartao do jogador = gol,
// segurar = assistencia, e os botoes cobrem o resto da ata. O placar do rodizio
// (V/E/D de cada time e dos goleiros) fica no quadro de cima.
// Nada de formulario: cada toque vira um evento que sobe sozinho.
const HOLD_MS = 450;

const LINE_ACTIONS = [
  { stat: 'assists', icon: '👟', short: 'Ass', label: 'Assistência' },
  { stat: 'yellow_cards', icon: '🟨', label: 'Amarelo' },
  { stat: 'blue_cards', icon: '🟦', label: 'Azul' },
  { stat: 'red_cards', icon: '🟥', label: 'Vermelho' },
];

const GK_ACTIONS = [
  { stat: 'penalties_saved', icon: '🧤', short: 'Pên', label: 'Pênalti defendido' },
  { stat: 'assists', icon: '👟', short: 'Ass', label: 'Assistência' },
  { stat: 'yellow_cards', icon: '🟨', label: 'Amarelo' },
  { stat: 'red_cards', icon: '🟥', label: 'Vermelho' },
];

// Resultado de cada partida do rodizio, lancado no time e no goleiro
const RESULT_ACTIONS = [
  { stat: 'wins', short: 'V', label: 'Vitória', color: 'text-emerald-300' },
  { stat: 'draws', short: 'E', label: 'Empate', color: 'text-amber-300' },
  { stat: 'losses', short: 'D', label: 'Derrota', color: 'text-red-300' },
];

const STAT_LABELS = {
  goals: 'Gol',
  assists: 'Assistência',
  yellow_cards: 'Amarelo',
  blue_cards: 'Azul',
  red_cards: 'Vermelho',
  penalties_saved: 'Pênalti defendido',
  wins: 'Vitória',
  draws: 'Empate',
  losses: 'Derrota',
};

function toStatsMap({ playerStats = [], goalkeeperStats = [] }) {
  const map = {};
  for (const s of [...playerStats, ...goalkeeperStats]) map[s.player_id] = s;
  return map;
}

function toTeamResults(teams = []) {
  return Object.fromEntries(teams.map((t) => [t.id, t]));
}

// Chave usada para somar o que ainda esta na fila do aparelho
function deltaKey(event) {
  return event.team_id != null
    ? `team:${event.team_id}:${event.stat}`
    : `player:${event.player_id}:${event.stat}`;
}

export default function AdminLiveSummaryPage() {
  const { id } = useParams();
  const [data, setData] = useState(null);
  const [serverStats, setServerStats] = useState({});
  const [serverTeams, setServerTeams] = useState({});
  const [history, setHistory] = useState([]);
  const [group, setGroup] = useState('all');
  const [flash, setFlash] = useState('');
  const flashTimer = useRef(null);

  const onSynced = useCallback((payload) => {
    setServerStats(toStatsMap(payload));
    if (payload.teams) setServerTeams(toTeamResults(payload.teams));
  }, []);
  const { pending, sending, offline, push, flush } = useLiveQueue(id, onSynced);

  useEffect(() => {
    api.get(`/matchdays/${id}/live`)
      .then(({ data: live }) => {
        setData(live);
        setServerStats(toStatsMap(live));
        setServerTeams(toTeamResults(live.teams));
      })
      .catch((err) => toast.error(err.response?.data?.error || 'Erro ao abrir a súmula ao vivo'));
  }, [id]);

  useEffect(() => () => clearTimeout(flashTimer.current), []);

  // O que aparece na tela = total do servidor + o que ainda esta na fila do aparelho
  const pendingDeltas = useMemo(() => {
    const deltas = {};
    for (const e of pending) {
      const key = deltaKey(e);
      deltas[key] = (deltas[key] || 0) + e.delta;
    }
    return deltas;
  }, [pending]);

  const total = useCallback((target, stat) => {
    const saved = target.type === 'team'
      ? serverTeams[target.id]?.[stat]
      : serverStats[target.id]?.[stat];
    const pendingDelta = pendingDeltas[`${target.type}:${target.id}:${stat}`] || 0;
    return Math.max(0, (Number(saved) || 0) + pendingDelta);
  }, [serverStats, serverTeams, pendingDeltas]);

  function register(target, stat) {
    push({
      client_id: newClientId(),
      ...(target.type === 'team' ? { team_id: target.id } : { player_id: target.id }),
      stat,
      delta: 1,
    });
    setHistory((h) => [...h, { target, stat }]);
    navigator.vibrate?.(15);

    clearTimeout(flashTimer.current);
    setFlash(`${target.type}:${target.id}:${stat}`);
    flashTimer.current = setTimeout(() => setFlash(''), 400);
  }

  function undo() {
    const last = history[history.length - 1];
    if (!last) return;
    push({
      client_id: newClientId(),
      ...(last.target.type === 'team' ? { team_id: last.target.id } : { player_id: last.target.id }),
      stat: last.stat,
      delta: -1,
    });
    setHistory((h) => h.slice(0, -1));
    navigator.vibrate?.(30);
    toast.success(`${STAT_LABELS[last.stat]} de ${last.target.name} desfeito`);
  }

  if (!data) return <p className="text-gray-400">Carregando...</p>;

  const groups = [
    ...data.teams.map((t) => ({ key: String(t.id), name: t.name, players: t.players, gk: false })),
    ...(data.goalkeepers.length > 0
      ? [{ key: 'gk', name: 'Goleiros', players: data.goalkeepers, gk: true }]
      : []),
  ];
  const visible = group === 'all' ? groups : groups.filter((g) => g.key === group);
  const last = history[history.length - 1];

  // Considera a fila pendente, para o troféu acompanhar o que esta na tela
  const champion = bestTeam(data.teams.map((t) => ({
    id: t.id,
    wins: total({ type: 'team', id: t.id }, 'wins'),
    draws: total({ type: 'team', id: t.id }, 'draws'),
    losses: total({ type: 'team', id: t.id }, 'losses'),
  })));

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-2">
        <Link to={`/admin/matchdays/${id}`} className="text-sm text-gulag-cyan underline">
          ← súmula completa
        </Link>
        <span className="text-xs text-gray-500">
          {matchDateLabel(data.matchday.match_date)}
        </span>
      </div>

      <SyncStatus pending={pending.length} sending={sending} offline={offline} onRetry={flush} />

      {groups.length === 0 ? (
        <Card>
          <EmptyState>
            Monte os times na tela de gerenciamento para lançar o placar ao vivo.
          </EmptyState>
        </Card>
      ) : (
        <>
          <Card title="Resultado das partidas">
            <p className="text-xs text-gray-500 mb-2">
              Ao fim de cada partida do rodízio, marque V, E ou D dos dois times.
              {data.goalkeepers.length > 0 && ' O V/E/D de cada goleiro fica no card dele, abaixo.'}
            </p>
            <ul className="flex flex-col">
              {data.teams.map((t) => (
                <ResultRow
                  key={t.id}
                  target={{ type: 'team', id: t.id, name: t.name }}
                  badge={champion?.id === t.id ? '🏆' : null}
                  total={total}
                  flash={flash}
                  onRegister={register}
                />
              ))}
            </ul>
          </Card>

          {groups.length > 1 && (
            <div className="flex gap-2 overflow-x-auto -mx-4 px-4 pb-1">
              <Chip active={group === 'all'} onClick={() => setGroup('all')}>Todos</Chip>
              {groups.map((g) => (
                <Chip key={g.key} active={group === g.key} onClick={() => setGroup(g.key)}>
                  {g.name}
                </Chip>
              ))}
            </div>
          )}

          <p className="text-xs text-gray-500">
            Toque no jogador = <strong className="text-gray-300">gol</strong> · segure ={' '}
            <strong className="text-gray-300">assistência</strong> · use os botões para cartões.
          </p>

          {visible.map((g) => (
            <section key={g.key} className="flex flex-col gap-2">
              <h2 className="font-semibold text-gulag-cyan text-sm uppercase tracking-wide">
                {g.name}
              </h2>
              {g.players.length === 0 ? (
                <Card><EmptyState>Nenhum jogador neste time.</EmptyState></Card>
              ) : (
                <div className="grid gap-2 sm:grid-cols-2">
                  {g.players.map((p) => (
                    <PlayerTile
                      key={p.id}
                      player={p}
                      actions={g.gk ? GK_ACTIONS : LINE_ACTIONS}
                      showResults={g.gk}
                      total={total}
                      flash={flash}
                      onRegister={register}
                    />
                  ))}
                </div>
              )}
            </section>
          ))}
        </>
      )}

      <div className="sticky bottom-0 -mx-4 px-4 py-3 bg-gulag-bg/95 border-t border-gulag-border flex items-center gap-3">
        <Button variant="secondary" onClick={undo} disabled={!last} className="shrink-0">
          ↩ Desfazer
        </Button>
        <span className="text-xs text-gray-500 min-w-0 truncate">
          {last
            ? `último: ${STAT_LABELS[last.stat]} de ${last.target.name}`
            : 'nenhum lançamento nesta sessão'}
        </span>
      </div>
    </div>
  );
}

function Chip({ active, children, ...props }) {
  return (
    <button
      {...props}
      className={`shrink-0 rounded-full px-3 py-1.5 text-sm border ${
        active
          ? 'bg-gulag-cyan text-black border-gulag-cyan font-semibold'
          : 'bg-gulag-surface-2 text-gray-300 border-gulag-border'
      }`}
    >
      {children}
    </button>
  );
}

// Verde = tudo no servidor. Amarelo = subindo. Vermelho = sem conexao, guardado no aparelho.
function SyncStatus({ pending, sending, offline, onRetry }) {
  const state = offline
    ? {
      color: 'border-red-800 bg-red-900/30 text-red-200',
      text: pending > 0
        ? `Sem conexão · ${pending} lançamento(s) salvos no aparelho`
        : 'Sem conexão · pode lançar, sobe quando a internet voltar',
    }
    : pending > 0
      ? {
        color: 'border-amber-700/60 bg-amber-500/10 text-amber-200',
        text: sending ? `Enviando ${pending} lançamento(s)...` : `${pending} lançamento(s) na fila`,
      }
      : {
        color: 'border-emerald-800 bg-emerald-900/20 text-emerald-200',
        text: 'Tudo salvo no servidor',
      };

  return (
    <div className={`rounded border px-3 py-2 flex items-center justify-between gap-2 ${state.color}`}>
      <span className="text-xs">{state.text}</span>
      {pending > 0 && (
        <button onClick={onRetry} className="text-xs underline shrink-0">tentar agora</button>
      )}
    </div>
  );
}

// Linha de V/E/D usada tanto pelos times quanto pelos goleiros
function ResultRow({ target, badge, total, flash, onRegister }) {
  const hit = flash.startsWith(`${target.type}:${target.id}:`);

  return (
    <li className="flex items-center gap-2 py-2 border-b border-gulag-border last:border-0">
      <span className={`min-w-0 flex-1 truncate text-sm ${hit ? 'text-gulag-cyan' : 'text-gray-100'}`}>
        {badge && <span className="mr-1">{badge}</span>}
        {target.name}
      </span>
      <div className="flex gap-1 shrink-0">
        {RESULT_ACTIONS.map((a) => (
          <button
            key={a.stat}
            onClick={() => onRegister(target, a.stat)}
            aria-label={`${a.label} de ${target.name}`}
            className="min-w-[54px] rounded border border-gulag-border bg-gulag-surface-2 py-2 text-sm flex items-center justify-center gap-1 active:bg-gulag-cyan/15"
            style={{ touchAction: 'manipulation' }}
          >
            <span className={`font-semibold ${a.color}`}>{a.short}</span>
            <span className="tabular-nums text-xs text-gray-400">{total(target, a.stat)}</span>
          </button>
        ))}
      </div>
    </li>
  );
}

// Goleiro usa o mesmo card, com a linha de V/E/D da propria partida por cima
function PlayerTile({ player, actions, showResults = false, total, flash, onRegister }) {
  const target = { type: 'player', id: player.id, name: player.name };
  const hold = useHold(
    () => onRegister(target, 'goals'),
    () => onRegister(target, 'assists')
  );
  const hit = flash.startsWith(`player:${player.id}:`);

  return (
    <div
      className={`rounded-lg border bg-gulag-surface overflow-hidden transition-colors ${
        hit ? 'border-gulag-cyan' : 'border-gulag-border'
      }`}
    >
      <button
        {...hold}
        className="w-full px-4 py-4 text-left select-none active:bg-gulag-cyan/15"
        style={{ touchAction: 'manipulation' }}
      >
        <span className="flex items-center justify-between gap-2">
          <span className="text-lg font-semibold text-gray-100 truncate">{player.name}</span>
          <span className="text-3xl font-bold text-gulag-cyan tabular-nums leading-none">
            {total(target, 'goals')}
          </span>
        </span>
        <span className="block text-[11px] text-gray-500 mt-1">gols · toque para somar</span>
      </button>

      {showResults && (
        <div className="flex border-t border-gulag-border divide-x divide-gulag-border">
          {RESULT_ACTIONS.map((a) => (
            <button
              key={a.stat}
              onClick={() => onRegister(target, a.stat)}
              title={a.label}
              aria-label={`${a.label} de ${player.name}`}
              className="flex-1 py-3 text-sm active:bg-gulag-cyan/15 flex items-center justify-center gap-1"
              style={{ touchAction: 'manipulation' }}
            >
              <span className={`font-semibold ${a.color}`}>{a.short}</span>
              <span className="tabular-nums text-xs text-gray-400">{total(target, a.stat)}</span>
            </button>
          ))}
        </div>
      )}

      <div className="flex border-t border-gulag-border divide-x divide-gulag-border">
        {actions.map((a) => {
          const count = total(target, a.stat);
          return (
            <button
              key={a.stat}
              onClick={() => onRegister(target, a.stat)}
              title={a.label}
              aria-label={`${a.label} de ${player.name}`}
              className="flex-1 py-3 text-sm text-gray-300 active:bg-gulag-cyan/15 flex items-center justify-center gap-1"
              style={{ touchAction: 'manipulation' }}
            >
              <span aria-hidden="true">{a.icon}</span>
              {a.short && <span className="text-xs text-gray-400">{a.short}</span>}
              <span className="tabular-nums text-xs text-gray-400">{count || ''}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

// Toque curto e toque longo no mesmo cartao. Usa eventos de ponteiro para
// responder na hora, sem esperar o clique do navegador.
function useHold(onTap, onHold) {
  const timer = useRef(null);
  const held = useRef(false);

  useEffect(() => () => clearTimeout(timer.current), []);

  return {
    onPointerDown: () => {
      held.current = false;
      clearTimeout(timer.current);
      timer.current = setTimeout(() => {
        held.current = true;
        onHold();
      }, HOLD_MS);
    },
    onPointerUp: () => {
      clearTimeout(timer.current);
      if (held.current) return; // ja contou como assistencia
      onTap();
    },
    onPointerLeave: () => {
      clearTimeout(timer.current);
      held.current = false;
    },
    onPointerCancel: () => {
      clearTimeout(timer.current);
      held.current = false;
    },
    // Clique de teclado (Enter/Espaco) nao passa por onPointerUp
    onClick: (e) => { if (e.detail === 0) onTap(); },
    onContextMenu: (e) => e.preventDefault(),
  };
}
