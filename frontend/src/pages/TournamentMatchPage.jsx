import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import api from '../api/client';
import { useAuth } from '../context/AuthContext';
import { newClientId, useLiveQueue } from '../components/liveQueue';
import { inputClass, Button, Card, EmptyState } from '../components/ui';
import { rotuloPartida } from '../components/tournament';

// Sumula ao vivo da partida do torneio. Toque no nome = gol; os botoes ao lado
// lancam assistencia e cartoes. Cada toque fica salvo no aparelho e sobe
// sozinho (mesma fila da sumula da pelada) — perder o sinal nao perde nada.
const ACOES = [
  { stat: 'assists', icon: '👟', label: 'Assistência' },
  { stat: 'yellow_cards', icon: '🟨', label: 'Amarelo' },
  { stat: 'blue_cards', icon: '🟦', label: 'Azul' },
  { stat: 'red_cards', icon: '🟥', label: 'Vermelho' },
];
const NOMES = { goals: 'Gol', assists: 'Assistência', yellow_cards: 'Amarelo', blue_cards: 'Azul', red_cards: 'Vermelho' };

export default function TournamentMatchPage() {
  const { matchId } = useParams();
  const { isAdmin } = useAuth();
  const [d, setD] = useState(null);
  const [corrigir, setCorrigir] = useState(false);
  const [penaltis, setPenaltis] = useState({ home: '', away: '' });
  const ultimos = useRef([]); // toques desta sessao, para "desfazer"

  const load = useCallback(() => {
    api.get(`/tournaments/matches/${matchId}`).then(({ data }) => setD(data))
      .catch((err) => toast.error(err.response?.data?.error || 'Erro ao carregar a partida'));
  }, [matchId]);
  useEffect(() => { load(); }, [load]);

  const onSynced = useCallback((data) => {
    // O servidor marca a partida como em andamento no primeiro toque
    setD((atual) => (atual ? {
      ...atual,
      stats: data.stats,
      match: atual.match.status === 'pendente' && data.applied > 0
        ? { ...atual.match, status: 'em_andamento' } : atual.match,
    } : atual));
  }, []);
  const { pending, offline, push, flush } = useLiveQueue(
    `torneio-${matchId}`, onSynced, `/tournaments/matches/${matchId}/events`
  );

  // Quem so acompanha ve o placar andando sem recarregar
  useEffect(() => {
    if (isAdmin || d?.match.status !== 'em_andamento') return undefined;
    const t = setInterval(load, 10000);
    return () => clearInterval(t);
  }, [isAdmin, d?.match.status, load]);

  // Numeros na tela = o que o servidor ja tem + o que ainda esta na fila
  const valores = useMemo(() => {
    const mapa = {};
    for (const s of d?.stats || []) mapa[s.player_id] = { ...s };
    for (const e of pending) {
      mapa[e.player_id] ||= {};
      mapa[e.player_id][e.stat] = Math.max(0, (mapa[e.player_id][e.stat] || 0) + e.delta);
    }
    return mapa;
  }, [d?.stats, pending]);

  if (!d) return <EmptyState>Carregando...</EmptyState>;
  const { match: m, teams } = d;
  const casa = teams.find((x) => x.id === m.home_team_id);
  const fora = teams.find((x) => x.id === m.away_team_id);
  const golsDe = (time) => (time?.players || []).reduce((s, p) => s + (valores[p.player_id]?.goals || 0), 0);
  const placarCasa = golsDe(casa);
  const placarFora = golsDe(fora);
  const editavel = isAdmin && m.status !== 'encerrada';
  const mataMataEmpatado = m.stage !== 'grupo' && placarCasa === placarFora;

  function lanca(player, stat) {
    const delta = corrigir ? -1 : 1;
    if (delta < 0 && !(valores[player.player_id]?.[stat] > 0)) return;
    const evento = { client_id: newClientId(), player_id: player.player_id, stat, delta };
    push(evento);
    ultimos.current.push({ ...evento, name: player.name });
    toast.success(`${delta > 0 ? '+' : '−'} ${NOMES[stat]} · ${player.name}`, { duration: 1200 });
  }

  function desfazer() {
    const ultimo = ultimos.current.pop();
    if (!ultimo) return;
    push({ client_id: newClientId(), player_id: ultimo.player_id, stat: ultimo.stat, delta: -ultimo.delta });
    toast(`Desfeito: ${NOMES[ultimo.stat]} · ${ultimo.name}`, { duration: 1500 });
  }

  async function encerrar() {
    if (pending.length > 0) {
      toast.error('Ainda há lançamentos subindo — espere a fila zerar');
      flush();
      return;
    }
    const body = mataMataEmpatado
      ? { home_penalties: Number(penaltis.home), away_penalties: Number(penaltis.away) }
      : {};
    if (!window.confirm(`Encerrar a partida com ${placarCasa} x ${placarFora}${mataMataEmpatado ? ` (pênaltis ${penaltis.home} x ${penaltis.away})` : ''}?`)) return;
    try {
      await api.post(`/tournaments/matches/${m.id}/finish`, body);
      toast.success('Partida encerrada');
      load();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Erro ao encerrar');
    }
  }

  async function reabrir() {
    if (!window.confirm('Reabrir a partida para corrigir a súmula?')) return;
    try {
      await api.post(`/tournaments/matches/${m.id}/reopen`);
      toast.success('Partida reaberta');
      load();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Erro ao reabrir');
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <Link to={`/torneios/${d.tournament.id}`} className="text-sm text-gulag-cyan underline">← {d.tournament.name}</Link>

      <Card>
        <p className="text-xs text-gray-500 text-center">{rotuloPartida(m)}</p>
        <div className="flex items-center justify-center gap-3 my-2">
          <span className="flex-1 text-right font-semibold text-gray-100 truncate">{casa?.name || 'A definir'}</span>
          <span className="text-4xl font-bold text-gulag-cyan tabular-nums">{placarCasa} x {placarFora}</span>
          <span className="flex-1 font-semibold text-gray-100 truncate">{fora?.name || 'A definir'}</span>
        </div>
        {m.home_penalties != null && (
          <p className="text-center text-sm text-gray-400">Pênaltis: {m.home_penalties} x {m.away_penalties}</p>
        )}
        <p className="text-center text-xs mt-1">
          {m.status === 'encerrada' ? <span className="text-gray-500">Encerrada</span>
            : m.status === 'em_andamento' ? <span className="text-amber-400">● Ao vivo</span>
              : <span className="text-gray-500">Não começou</span>}
          {pending.length > 0 && (
            <span className={offline ? 'text-red-400' : 'text-gray-500'}>
              {' · '}{pending.length} lançamento(s) {offline ? 'esperando sinal' : 'subindo...'}
            </span>
          )}
        </p>
      </Card>

      {editavel && (
        <div className="flex gap-2 flex-wrap">
          <Button variant={corrigir ? 'danger' : 'secondary'} onClick={() => setCorrigir((v) => !v)}>
            {corrigir ? 'Modo correção (−1) ligado' : 'Corrigir (−1)'}
          </Button>
          <Button variant="secondary" onClick={desfazer}>↶ Desfazer último toque</Button>
        </div>
      )}

      <div className="grid gap-3 sm:grid-cols-2">
        {[casa, fora].filter(Boolean).map((time) => (
          <Card key={time.id} title={time.name}>
            {editavel && (
              <p className="text-[11px] text-gray-500 mb-2">
                Toque no nome = {corrigir ? 'tira um gol' : 'gol'}. Botões: assistência e cartões.
              </p>
            )}
            <ul className="flex flex-col gap-1">
              {time.players.map((p) => {
                const v = valores[p.player_id] || {};
                return (
                  <li key={p.player_id} className="flex items-center gap-1">
                    <button
                      disabled={!editavel}
                      onClick={() => lanca(p, 'goals')}
                      className="flex-1 min-w-0 text-left px-2 py-2 rounded border border-gulag-border enabled:hover:border-gulag-cyan disabled:cursor-default"
                    >
                      <span className="block truncate text-sm text-gray-100">
                        {p.is_goalkeeper ? '🧤 ' : ''}{p.name}{p.is_captain ? ' (C)' : ''}
                        {v.goals > 0 && <span className="text-gulag-cyan font-bold"> ⚽{v.goals}</span>}
                        {v.assists > 0 && <span className="text-gray-300"> 👟{v.assists}</span>}
                        {v.yellow_cards > 0 && <span> 🟨{v.yellow_cards > 1 ? v.yellow_cards : ''}</span>}
                        {v.blue_cards > 0 && <span> 🟦{v.blue_cards > 1 ? v.blue_cards : ''}</span>}
                        {v.red_cards > 0 && <span> 🟥</span>}
                      </span>
                      {(p.suspenso || p.taxa_pendente) && (
                        <span className="block text-[11px]">
                          {p.suspenso && <span className="text-red-400">suspenso (vermelho no jogo anterior) </span>}
                          {p.taxa_pendente && <span className="text-amber-400">taxa pendente</span>}
                        </span>
                      )}
                    </button>
                    {editavel && ACOES.map((a) => (
                      <button
                        key={a.stat}
                        onClick={() => lanca(p, a.stat)}
                        title={a.label}
                        className="w-9 h-9 shrink-0 rounded border border-gulag-border hover:border-gulag-cyan"
                      >
                        {a.icon}
                      </button>
                    ))}
                  </li>
                );
              })}
            </ul>
          </Card>
        ))}
      </div>

      {isAdmin && casa && fora && (
        <Card>
          {m.status === 'encerrada' ? (
            <Button variant="secondary" onClick={reabrir}>Reabrir para corrigir</Button>
          ) : (
            <div className="flex flex-col gap-3">
              {mataMataEmpatado && (
                <div>
                  <p className="text-sm text-amber-300 mb-2">Empate no mata-mata: placar dos pênaltis</p>
                  <div className="flex items-center gap-2">
                    <input type="number" min="0" value={penaltis.home} onChange={(e) => setPenaltis((x) => ({ ...x, home: e.target.value }))} className={`${inputClass} w-20`} aria-label={`Pênaltis ${casa.name}`} />
                    <span className="text-gray-400">x</span>
                    <input type="number" min="0" value={penaltis.away} onChange={(e) => setPenaltis((x) => ({ ...x, away: e.target.value }))} className={`${inputClass} w-20`} aria-label={`Pênaltis ${fora.name}`} />
                  </div>
                </div>
              )}
              <Button onClick={encerrar}>Encerrar partida</Button>
            </div>
          )}
        </Card>
      )}
    </div>
  );
}
