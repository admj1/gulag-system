import { useEffect, useMemo, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import toast from 'react-hot-toast';
import api from '../../api/client';
import AtaList from '../../components/AtaList';
import TeamDraw from '../../components/TeamDraw';
import { useAuth } from '../../context/AuthContext';
import { inputClass, Button, Card, ScrollArea, EmptyState } from '../../components/ui';

const STATUS_LABELS = { open: 'Lista aberta', closed: 'Lista fechada', played: 'Realizada' };
const numberInput = 'w-14 bg-gulag-surface-2 border border-gulag-border text-gray-100 rounded px-2 py-1 text-sm text-center';

export default function AdminMatchdayDetailPage() {
  const { id } = useParams();
  const { player } = useAuth();
  const [matchday, setMatchday] = useState(null);
  const [confirmations, setConfirmations] = useState([]);
  const [teams, setTeams] = useState([]);
  const [numberOfTeams, setNumberOfTeams] = useState(4);
  const [playerStats, setPlayerStats] = useState({});
  const [goalkeeperStats, setGoalkeeperStats] = useState({});
  const [teamResults, setTeamResults] = useState({});
  const [saving, setSaving] = useState(false);
  const [allDiaristas, setAllDiaristas] = useState([]);
  const [diaristaToAdd, setDiaristaToAdd] = useState('');

  function load() {
    api.get(`/matchdays/${id}`).then(({ data }) => setMatchday(data));
    api.get(`/matchdays/${id}/confirmations`).then(({ data }) => setConfirmations(data));
    api.get(`/matchdays/${id}/teams`).then(({ data }) => setTeams(data));
    api.get('/players', { params: { type: 'diarista' } }).then(({ data }) => setAllDiaristas(data));
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
  const inAta = new Set(confirmations.map((c) => c.player_id));
  const availableDiaristas = allDiaristas.filter((p) => !inAta.has(p.id));
  // O admin tambem joga: precisa confirmar a propria presenca como qualquer mensalista
  const mine = confirmations.find((c) => c.player_id === player?.id);

  async function toggleConfirmation(entry) {
    const status = entry.status === 'confirmed' ? 'pending' : 'confirmed';
    try {
      await api.patch(`/matchdays/${id}/confirmations/${entry.player_id}`, { status });
      load();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Erro ao alterar presença');
    }
  }

  async function addDiarista() {
    try {
      await api.patch(`/matchdays/${id}/confirmations/${diaristaToAdd}`, { status: 'confirmed' });
      setDiaristaToAdd('');
      toast.success('Diarista incluído na ata');
      load();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Erro ao incluir diarista');
    }
  }

  async function closeList() {
    try {
      const { data } = await api.post(`/matchdays/${id}/close`);
      toast.success(
        `Lista fechada: ${data.mensalistas} mensalistas, ${data.diaristasConfirmados} diaristas` +
        (data.fila ? ` · ${data.fila} na espera` : '')
      );
      load();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Erro ao fechar lista');
    }
  }

  async function drawTeams() {
    try {
      await api.post(`/matchdays/${id}/draw-teams`, { numberOfTeams: Number(numberOfTeams) });
      toast.success('Times sorteados');
      load();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Erro ao sortear times');
    }
  }

  // Move na tela na hora e so depois confirma no servidor, para o arrasto nao piscar
  async function movePlayer(playerId, teamId) {
    const previous = teams;
    let moved = null;
    const optimistic = teams.map((t) => {
      const found = t.players.find((p) => p.id === playerId);
      if (found) moved = found;
      return { ...t, players: t.players.filter((p) => p.id !== playerId) };
    });
    if (!moved) return;
    setTeams(optimistic.map((t) => (
      t.id === teamId ? { ...t, players: [...t.players, moved] } : t
    )));

    try {
      await api.patch(`/matchdays/${id}/teams/assign`, { player_id: playerId, team_id: Number(teamId) });
    } catch (err) {
      setTeams(previous);
      toast.error(err.response?.data?.error || 'Erro ao mover jogador');
    }
  }

  function setPlayerField(playerId, field, value) {
    setPlayerStats((prev) => ({ ...prev, [playerId]: { ...prev[playerId], [field]: value } }));
  }

  function setGoalkeeperField(playerId, field, value) {
    setGoalkeeperStats((prev) => ({ ...prev, [playerId]: { ...prev[playerId], [field]: value } }));
  }

  function setTeamResult(teamId, field, value) {
    setTeamResults((prev) => ({ ...prev, [teamId]: { ...prev[teamId], [field]: value } }));
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
            wins: Number(s.wins) || 0,
            draws: Number(s.draws) || 0,
            losses: Number(s.losses) || 0,
            penalties_saved: Number(s.penalties_saved) || 0,
            assists: Number(s.assists) || 0,
            goals: Number(s.goals) || 0,
            yellow_cards: Number(s.yellow_cards) || 0,
            red_cards: Number(s.red_cards) || 0,
          };
        }),
        teamResults: teams.map((t) => {
          const r = teamResults[t.id] || {};
          return {
            team_id: t.id,
            wins: Number(r.wins ?? t.wins) || 0,
            draws: Number(r.draws ?? t.draws) || 0,
            losses: Number(r.losses ?? t.losses) || 0,
          };
        }),
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
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="font-medium text-gray-100">
              {new Date(`${matchday.match_date}T12:00:00`).toLocaleDateString('pt-BR', {
                weekday: 'long', day: '2-digit', month: '2-digit', year: 'numeric',
              })}
            </p>
            <p className="text-xs text-gray-500">
              {confirmed.length} confirmados · {STATUS_LABELS[matchday.status] || matchday.status}
            </p>
          </div>
          <div className="flex gap-2 flex-wrap">
            {mine && (
              <Button
                variant={mine.status === 'confirmed' ? 'secondary' : 'primary'}
                onClick={() => toggleConfirmation(mine)}
              >
                {mine.status === 'confirmed' ? 'Cancelar minha presença' : 'Confirmar minha presença'}
              </Button>
            )}
            {matchday.status === 'open' && (
              <Button variant="secondary" onClick={closeList}>Fechar lista</Button>
            )}
          </div>
        </div>
      </Card>

      <p className="text-xs text-gray-500 -mb-2">
        Toque em um nome para marcar ou desmarcar a presença.
      </p>
      <AtaList
        confirmations={confirmations}
        onToggle={toggleConfirmation}
        canEdit
        currentPlayerId={player?.id}
      />

      <Card
        title="Incluir diarista"
      >
        <div className="flex gap-2 flex-wrap">
          <select
            value={diaristaToAdd}
            onChange={(e) => setDiaristaToAdd(e.target.value)}
            className={`${inputClass} flex-1 min-w-[160px]`}
          >
            <option value="">Selecione um diarista...</option>
            {availableDiaristas.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
          <Button variant="secondary" onClick={addDiarista} disabled={!diaristaToAdd}>Incluir</Button>
        </div>
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
        <TeamDraw teams={teams} onMovePlayer={movePlayer} />
      </Card>

      <h2 className="text-lg font-semibold text-gray-100 mt-2">Súmula</h2>

      {teams.length === 0 ? (
        <Card><EmptyState>Sorteie os times para lançar a súmula.</EmptyState></Card>
      ) : (
        teams.map((team) => {
          const results = teamResults[team.id] || {};
          const teamPlayers = linePlayers.filter((c) => playerTeamId[c.player_id] === team.id);

          return (
            <Card key={team.id} title={team.name}>
              <div className="flex gap-2 mb-3">
                {[['wins', 'Vitórias'], ['draws', 'Empates'], ['losses', 'Derrotas']].map(([field, label]) => (
                  <label key={field} className="flex-1 text-center">
                    <span className="block text-[11px] uppercase text-gray-500 mb-1">{label}</span>
                    <input
                      type="number" min="0" inputMode="numeric"
                      className={`${numberInput} w-full`}
                      value={results[field] ?? team[field] ?? ''}
                      onChange={(e) => setTeamResult(team.id, field, e.target.value)}
                    />
                  </label>
                ))}
              </div>

              <ScrollArea>
                <table className="w-full text-sm min-w-[520px]">
                  <thead className="text-gray-400 text-left">
                    <tr>
                      <th className="pb-2">Nome</th><th>Gols</th><th>Ass.</th>
                      <th>Amarelo</th><th>Azul</th><th>Vermelho</th><th>Faltou</th>
                    </tr>
                  </thead>
                  <tbody>
                    {teamPlayers.map((c) => {
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
              {teamPlayers.length === 0 && <EmptyState>Nenhum jogador neste time.</EmptyState>}
            </Card>
          );
        })
      )}

      {goalkeepers.length > 0 && (
        <Card title="Goleiros">
          <ScrollArea>
            <table className="w-full text-sm min-w-[620px]">
              <thead className="text-gray-400 text-left">
                <tr>
                  <th className="pb-2">Nome</th><th>Vit.</th><th>Der.</th><th>Emp.</th>
                  <th>Gols</th><th>Ass.</th><th>Pên. def.</th><th>Amarelo</th><th>Vermelho</th>
                </tr>
              </thead>
              <tbody>
                {goalkeepers.map((c) => {
                  const s = goalkeeperStats[c.player_id] || {};
                  return (
                    <tr key={c.player_id} className="text-gray-200 border-t border-gulag-border">
                      <td className="py-1 pr-2 whitespace-nowrap">{c.name}</td>
                      {['wins', 'losses', 'draws', 'goals', 'assists', 'penalties_saved', 'yellow_cards', 'red_cards'].map((field) => (
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
        </Card>
      )}

      {teams.length > 0 && (
        <Button onClick={submitSummary} disabled={saving} className="w-full py-3 text-base">
          {saving ? 'Salvando...' : 'Salvar súmula'}
        </Button>
      )}
    </div>
  );
}
