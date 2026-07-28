import { useEffect, useMemo, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import toast from 'react-hot-toast';
import api from '../../api/client';
import { inputClass, Button, Card, Field, ScrollArea, EmptyState } from '../../components/ui';

const numberInput = 'w-14 bg-gulag-surface-2 border border-gulag-border text-gray-100 rounded px-2 py-1 text-sm text-center';
const selectInput = 'bg-gulag-surface-2 border border-gulag-border text-gray-100 rounded px-1 py-1 text-xs';

export default function AdminMatchdayDetailPage() {
  const { id } = useParams();
  const [matchday, setMatchday] = useState(null);
  const [confirmations, setConfirmations] = useState([]);
  const [teams, setTeams] = useState([]);
  const [numberOfTeams, setNumberOfTeams] = useState(2);
  const [playerStats, setPlayerStats] = useState({});
  const [goalkeeperStats, setGoalkeeperStats] = useState({});
  const [teamResults, setTeamResults] = useState({});
  const [saving, setSaving] = useState(false);

  function load() {
    api.get(`/matchdays/${id}`).then(({ data }) => setMatchday(data));
    api.get(`/matchdays/${id}/confirmations`).then(({ data }) => setConfirmations(data));
    api.get(`/matchdays/${id}/teams`).then(({ data }) => setTeams(data));
    api.get(`/matchdays/${id}/summary`).then(({ data }) => {
      setPlayerStats(Object.fromEntries(data.playerStats.map((s) => [s.player_id, s])));
      setGoalkeeperStats(Object.fromEntries(data.goalkeeperStats.map((s) => [s.player_id, s])));
    });
  }

  useEffect(load, [id]);

  const playerTeamId = useMemo(() => {
    const map = {};
    for (const t of teams) {
      for (const p of t.players) map[p.id] = t.id;
    }
    return map;
  }, [teams]);

  const confirmed = confirmations.filter((c) => c.status === 'confirmed');
  const linePlayers = confirmed.filter((c) => c.player_type !== 'goleiro');
  const goalkeepers = confirmed.filter((c) => c.player_type === 'goleiro');

  async function drawTeams() {
    try {
      await api.post(`/matchdays/${id}/draw-teams`, { numberOfTeams: Number(numberOfTeams) });
      toast.success('Times sorteados');
      load();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Erro ao sortear times');
    }
  }

  async function movePlayer(playerId, teamId) {
    try {
      await api.patch(`/matchdays/${id}/teams/assign`, { player_id: playerId, team_id: Number(teamId) });
      load();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Erro ao mover jogador');
    }
  }

  function setPlayerField(playerId, field, value) {
    setPlayerStats((prev) => ({ ...prev, [playerId]: { ...prev[playerId], [field]: value } }));
  }

  function setGoalkeeperField(playerId, field, value) {
    setGoalkeeperStats((prev) => ({ ...prev, [playerId]: { ...prev[playerId], [field]: value } }));
  }

  async function submitSummary() {
    setSaving(true);
    try {
      const payload = {
        playerStats: linePlayers.map((c) => {
          const s = playerStats[c.player_id] || {};
          return {
            player_id: c.player_id,
            team_id: playerTeamId[c.player_id] || null,
            goals: Number(s.goals) || 0,
            assists: Number(s.assists) || 0,
            yellow_cards: Number(s.yellow_cards) || 0,
            blue_cards: Number(s.blue_cards) || 0,
            red_cards: Number(s.red_cards) || 0,
            absent: !!s.absent,
          };
        }),
        goalkeeperStats: goalkeepers.map((c) => {
          const s = goalkeeperStats[c.player_id] || {};
          return {
            player_id: c.player_id,
            opponent_team_id: s.opponent_team_id ? Number(s.opponent_team_id) : null,
            result: s.result || null,
            penalties_saved: Number(s.penalties_saved) || 0,
            assists: Number(s.assists) || 0,
            goals: Number(s.goals) || 0,
          };
        }),
        teamResults: teams.map((t) => ({ team_id: t.id, result: teamResults[t.id] ?? t.result })),
      };
      await api.post(`/matchdays/${id}/summary`, payload);
      toast.success('Súmula salva. Diárias e multas lançadas automaticamente.');
      load();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Erro ao lançar súmula');
    } finally {
      setSaving(false);
    }
  }

  if (!matchday) return <p className="text-gray-400">Carregando...</p>;

  return (
    <div className="flex flex-col gap-4">
      <Link to="/admin/matchdays" className="text-sm text-gulag-cyan underline">← voltar</Link>

      <Card>
        <p className="font-medium text-gray-100">
          {new Date(`${matchday.match_date}T12:00:00`).toLocaleDateString('pt-BR', {
            weekday: 'long', day: '2-digit', month: '2-digit', year: 'numeric',
          })}
        </p>
        <p className="text-xs text-gray-500">{confirmed.length} relacionados</p>
      </Card>

      <Card
        title="Sorteio de times"
        action={
          <div className="flex gap-2 items-center">
            <input
              type="number" min="2" value={numberOfTeams}
              onChange={(e) => setNumberOfTeams(e.target.value)}
              className={numberInput}
            />
            <Button variant="secondary" onClick={drawTeams}>Sortear</Button>
          </div>
        }
      >
        {teams.length === 0 ? (
          <EmptyState>Times ainda não sorteados.</EmptyState>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            {teams.map((t) => (
              <div key={t.id} className="border border-gulag-border rounded p-2">
                <p className="font-medium text-gray-100 mb-2">
                  {t.name}{' '}
                  <span className="text-xs text-gray-500">
                    ({t.players.reduce((s, p) => s + Number(p.stars), 0)}★)
                  </span>
                </p>
                <ul className="flex flex-col gap-1">
                  {t.players.map((p) => (
                    <li key={p.id} className="flex items-center justify-between gap-2 text-sm text-gray-300">
                      <span className="truncate">{p.name}</span>
                      <select value={t.id} onChange={(e) => movePlayer(p.id, e.target.value)} className={selectInput}>
                        {teams.map((opt) => <option key={opt.id} value={opt.id}>{opt.name}</option>)}
                      </select>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        )}
      </Card>

      <Card title="Súmula">
        {teams.length > 0 && (
          <div className="flex gap-3 flex-wrap mb-4">
            {teams.map((t) => (
              <Field key={t.id} label={t.name}>
                <select
                  value={teamResults[t.id] ?? t.result ?? ''}
                  onChange={(e) => setTeamResults((prev) => ({ ...prev, [t.id]: e.target.value }))}
                  className={inputClass}
                >
                  <option value="">-</option>
                  <option value="win">Vitória</option>
                  <option value="draw">Empate</option>
                  <option value="loss">Derrota</option>
                </select>
              </Field>
            ))}
          </div>
        )}

        <ScrollArea>
          <table className="w-full text-sm min-w-[560px]">
            <thead className="text-gray-400 text-left">
              <tr>
                <th className="pb-2">Jogador</th><th>Gols</th><th>Assist.</th>
                <th>Amar.</th><th>Azul</th><th>Verm.</th><th>Faltou</th>
              </tr>
            </thead>
            <tbody>
              {linePlayers.map((c) => {
                const s = playerStats[c.player_id] || {};
                return (
                  <tr key={c.player_id} className="text-gray-200 border-t border-gulag-border">
                    <td className="py-1 pr-2 whitespace-nowrap">{c.name}</td>
                    {['goals', 'assists', 'yellow_cards', 'blue_cards', 'red_cards'].map((field) => (
                      <td key={field} className="py-1">
                        <input
                          type="number" min="0" inputMode="numeric" className={numberInput}
                          value={s[field] ?? ''}
                          onChange={(e) => setPlayerField(c.player_id, field, e.target.value)}
                        />
                      </td>
                    ))}
                    <td>
                      <input
                        type="checkbox" className="w-5 h-5"
                        checked={!!s.absent}
                        onChange={(e) => setPlayerField(c.player_id, 'absent', e.target.checked)}
                      />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </ScrollArea>

        {goalkeepers.length > 0 && (
          <ScrollArea className="mt-4">
            <table className="w-full text-sm min-w-[560px]">
              <thead className="text-gray-400 text-left">
                <tr>
                  <th className="pb-2">Goleiro</th><th>Contra</th><th>Resultado</th>
                  <th>Pên. def.</th><th>Assist.</th><th>Gols</th>
                </tr>
              </thead>
              <tbody>
                {goalkeepers.map((c) => {
                  const s = goalkeeperStats[c.player_id] || {};
                  return (
                    <tr key={c.player_id} className="text-gray-200 border-t border-gulag-border">
                      <td className="py-1 pr-2 whitespace-nowrap">{c.name}</td>
                      <td>
                        <select
                          className={selectInput} value={s.opponent_team_id ?? ''}
                          onChange={(e) => setGoalkeeperField(c.player_id, 'opponent_team_id', e.target.value)}
                        >
                          <option value="">-</option>
                          {teams.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                        </select>
                      </td>
                      <td>
                        <select
                          className={selectInput} value={s.result ?? ''}
                          onChange={(e) => setGoalkeeperField(c.player_id, 'result', e.target.value)}
                        >
                          <option value="">-</option>
                          <option value="win">Vitória</option>
                          <option value="draw">Empate</option>
                          <option value="loss">Derrota</option>
                        </select>
                      </td>
                      {['penalties_saved', 'assists', 'goals'].map((field) => (
                        <td key={field} className="py-1">
                          <input
                            type="number" min="0" inputMode="numeric" className={numberInput}
                            value={s[field] ?? ''}
                            onChange={(e) => setGoalkeeperField(c.player_id, field, e.target.value)}
                          />
                        </td>
                      ))}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </ScrollArea>
        )}

        <div className="mt-4">
          <Button onClick={submitSummary} disabled={saving}>
            {saving ? 'Salvando...' : 'Salvar súmula'}
          </Button>
        </div>
      </Card>
    </div>
  );
}
