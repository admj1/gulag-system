import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import toast from 'react-hot-toast';
import api from '../api/client';
import { useAuth } from '../context/AuthContext';
import AtaList from '../components/AtaList';
import InvitePlayer from '../components/InvitePlayer';
import { Button, Card, ScrollArea, Section, bestTeam, matchDateLabel } from '../components/ui';

const STATUS_LABELS = { open: 'Lista aberta', closed: 'Lista fechada', played: 'Realizada' };

export default function MatchdayPage() {
  const { id } = useParams();
  const { player } = useAuth();
  const [matchday, setMatchday] = useState(null);
  const [confirmations, setConfirmations] = useState([]);
  const [teams, setTeams] = useState([]);
  const [summary, setSummary] = useState({ playerStats: [], goalkeeperStats: [] });
  const [allPlayers, setAllPlayers] = useState([]);

  function load() {
    api.get(`/matchdays/${id}`).then(({ data }) => setMatchday(data));
    api.get(`/matchdays/${id}/confirmations`).then(({ data }) => setConfirmations(data));
    api.get(`/matchdays/${id}/teams`).then(({ data }) => setTeams(data));
    api.get(`/matchdays/${id}/summary`).then(({ data }) => setSummary(data));
    api.get('/players').then(({ data }) => setAllPlayers(data));
  }

  useEffect(load, [id]);

  async function confirmPresence() {
    try {
      await api.post(`/matchdays/${id}/confirmations`, {});
      toast.success('Presença confirmada!');
      load();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Erro ao confirmar presença');
    }
  }

  async function declinePresence() {
    try {
      await api.post(`/matchdays/${id}/decline`);
      toast.success('Avisado que você não vai');
      load();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Erro ao avisar ausência');
    }
  }

  async function removeFromAta(entry) {
    if (!window.confirm(`Retirar ${entry.name} da lista?`)) return;
    try {
      await api.delete(`/matchdays/${id}/confirmations/${entry.player_id}`);
      toast.success(`${entry.name} saiu da lista`);
      load();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Erro ao retirar da lista');
    }
  }

  if (!matchday) return <p className="text-gray-400">Carregando...</p>;

  const mine = confirmations.find((c) => c.player_id === player?.id);
  const nameById = Object.fromEntries(confirmations.map((c) => [c.player_id, c.name]));
  const inAta = new Set(confirmations.map((c) => c.player_id));
  const candidates = allPlayers.filter((p) => p.player_type !== 'mensalista' && !inAta.has(p.id));
  const champion = bestTeam(teams);
  // A ata vale ate a pelada acontecer; depois quem manda e a sumula
  const played = matchday.status === 'played';
  const confirmedCount = confirmations.filter((c) => c.status === 'confirmed').length;

  return (
    <div className="flex flex-col gap-4">
      <Link to="/" className="text-sm text-gulag-cyan underline">← voltar</Link>

      <Card>
        <p className="font-medium text-gray-100">
          {matchDateLabel(matchday.match_date)}
        </p>
        <p className="text-xs text-gray-500 mb-3">{STATUS_LABELS[matchday.status] || matchday.status}</p>

        {matchday.status === 'open' ? (
          mine?.status === 'confirmed' ? (
            <div className="rounded bg-emerald-500/10 border border-emerald-600/40 p-3 text-center">
              <p className="text-emerald-400 font-medium">Sua presença está confirmada ✓</p>
              <button onClick={declinePresence} className="text-xs text-gray-400 underline mt-1">
                mudei de ideia, não vou
              </button>
            </div>
          ) : mine?.status === 'declined' ? (
            <div className="rounded bg-red-500/10 border border-red-700/50 p-3 text-center">
              <p className="text-red-400 font-medium">Você avisou que não vai ❌</p>
              <button onClick={confirmPresence} className="text-xs text-gray-400 underline mt-1">
                mudei de ideia, vou jogar
              </button>
            </div>
          ) : (
            <div className="flex gap-2">
              <Button onClick={confirmPresence} className="flex-1 text-base py-3">
                Confirmar presença
              </Button>
              <Button variant="danger" onClick={declinePresence} className="text-base py-3">
                Não vou
              </Button>
            </div>
          )
        ) : (
          mine?.status === 'confirmed' && (
            <p className="text-sm text-emerald-400">Você estava confirmado nesta pelada ✓</p>
          )
        )}
      </Card>

      <Section
        title="Ata"
        hint={`${confirmedCount} confirmado${confirmedCount === 1 ? '' : 's'}`}
        defaultOpen={!played}
      >
        <AtaList
          confirmations={confirmations}
          currentPlayerId={player?.id}
          isAdmin={player?.role === 'admin'}
          onRemove={matchday.status === 'open' ? removeFromAta : undefined}
        />

        {matchday.status === 'open' && (
          <InvitePlayer matchdayId={id} candidates={candidates} onInvited={load} />
        )}
      </Section>

      {teams.length > 0 && (
        <SummarySection
          teams={teams}
          summary={summary}
          nameById={nameById}
          champion={champion}
        />
      )}
    </div>
  );
}

// Quem fez mais gols (ou mais assistencias) no dia. Empate premia todos os
// empatados, como o "melhor time do dia" faz com o time inteiro.
function destaquesDoDia(playerStats, campo) {
  const melhor = playerStats.reduce((maior, s) => Math.max(maior, s[campo]), 0);
  if (melhor === 0) return new Set();
  return new Set(playerStats.filter((s) => s[campo] === melhor).map((s) => s.player_id));
}

// Depois da pelada realizada e a sumula que interessa, entao ela nasce aberta.
function SummarySection({ teams, summary, nameById, champion }) {
  const artilheiros = destaquesDoDia(summary.playerStats, 'goals');
  const garcons = destaquesDoDia(summary.playerStats, 'assists');

  return (
    <Section
      title="Súmula"
      hint={champion ? `🏆 ${champion.name}` : `${teams.length} times`}
      defaultOpen
    >
      {teams.map((team) => {
        const stats = summary.playerStats.filter((s) => s.team_id === team.id);
        const isBest = champion?.id === team.id;
        return (
          <Card
            key={team.id}
            className={isBest ? 'border-gulag-cyan' : ''}
            title={
              <span className="flex items-center gap-2">
                {team.name}
                {isBest && (
                  <span className="text-[10px] uppercase tracking-wide bg-gulag-cyan text-black rounded px-1.5 py-0.5">
                    🏆 melhor time do dia
                  </span>
                )}
              </span>
            }
            action={
              <span className="text-xs text-gray-400">
                {team.wins}V · {team.draws}E · {team.losses}D
              </span>
            }
          >
            {stats.length === 0 ? (
              <ul className="text-sm text-gray-300 flex flex-col gap-1">
                {team.players.map((p) => <li key={p.id}>{p.name}</li>)}
              </ul>
            ) : (
              <ScrollArea>
                {/* Largura fixa das colunas para os times ficarem alinhados entre si:
                    no automatico, cada tabela se ajusta ao nome mais longo dela */}
                <table className="w-full table-fixed text-sm min-w-[420px]">
                  <thead className="text-gray-400 text-left">
                    <tr>
                      <th>Nome</th>
                      <th className="w-16">Gols</th>
                      <th className="w-16">Ass.</th>
                      <th className="w-20">Cartões</th>
                      <th className="w-16">Faltou</th>
                    </tr>
                  </thead>
                  <tbody>
                    {stats.map((s) => (
                      <tr key={s.id} className="text-gray-200 border-t border-gulag-border">
                        <td className="py-1 pr-2 truncate">
                          {nameById[s.player_id] || `#${s.player_id}`}
                          {artilheiros.has(s.player_id) && (
                            <span title="artilheiro do dia"> ⚽</span>
                          )}
                          {garcons.has(s.player_id) && (
                            <span title="garçom do dia"> 🎩</span>
                          )}
                        </td>
                        <td className="tabular-nums">{s.goals}</td>
                        <td className="tabular-nums">{s.assists}</td>
                        <td className="tabular-nums">{s.yellow_cards + s.blue_cards + s.red_cards}</td>
                        <td>{s.absent ? 'sim' : '-'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </ScrollArea>
            )}
          </Card>
        );
      })}

      {/* Goleiros aparecem depois dos times, como na ata em papel */}
      {summary.goalkeeperStats.length > 0 && (
        <Card title="Goleiros">
          <ScrollArea>
            <table className="w-full table-fixed text-sm min-w-[460px]">
              <thead className="text-gray-400 text-left">
                <tr>
                  <th>Nome</th>
                  <th className="w-12">V</th>
                  <th className="w-12">D</th>
                  <th className="w-12">E</th>
                  <th className="w-16">Gols</th>
                  <th className="w-16">Ass.</th>
                  <th className="w-24">Pên. def.</th>
                </tr>
              </thead>
              <tbody>
                {summary.goalkeeperStats.map((s) => (
                  <tr key={s.id} className="text-gray-200 border-t border-gulag-border">
                    <td className="py-1 pr-2 truncate">{nameById[s.player_id] || `#${s.player_id}`}</td>
                    <td className="tabular-nums">{s.wins}</td>
                    <td className="tabular-nums">{s.losses}</td>
                    <td className="tabular-nums">{s.draws}</td>
                    <td className="tabular-nums">{s.goals}</td>
                    <td className="tabular-nums">{s.assists}</td>
                    <td className="tabular-nums">{s.penalties_saved}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </ScrollArea>
        </Card>
      )}
    </Section>
  );
}
