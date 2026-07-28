import { useEffect, useMemo, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import toast from 'react-hot-toast';
import api from '../../api/client';

const inputClass = 'bg-gulag-surface-2 border border-gulag-border text-gray-100 rounded px-2 py-1 text-sm w-16 focus:outline-none focus:border-gulag-cyan';

export default function AdminMatchdayDetailPage() {
  const { id } = useParams();
  const [matchday, setMatchday] = useState(null);
  const [confirmations, setConfirmations] = useState([]);
  const [teams, setTeams] = useState([]);
  const [numberOfTeams, setNumberOfTeams] = useState(2);
  const [playerStats, setPlayerStats] = useState({});
  const [goalkeeperStats, setGoalkeeperStats] = useState({});
  const [teamResults, setTeamResults] = useState({});

  function load() {
    api.get(`/matchdays/${id}`).then(({ data }) => setMatchday(data));
    api.get(`/matchdays/${id}/confirmations`).then(({ data }) => setConfirmations(data));
    api.get(`/matchdays/${id}/teams`).then(({ data }) => setTeams(data));
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

  async function closeList() {
    try {
      const { data } = await api.post(`/matchdays/${id}/close`);
      toast.success(`Lista fechada: ${data.mensalistas} mensalistas, ${data.diaristasConfirmados} diaristas, ${data.goleiros} goleiros`);
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
        teamResults: teams.map((t) => ({ team_id: t.id, result: teamResults[t.id] || t.result })),
      };
      await api.post(`/matchdays/${id}/summary`, payload);
      toast.success('Súmula lançada com sucesso');
      load();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Erro ao lançar súmula');
    }
  }

  if (!matchday) return <p className="text-gray-400">Carregando...</p>;

  return (
    <div className="flex flex-col gap-6">
      <Link to="/admin/matchdays" className="text-sm text-gulag-cyan underline">← voltar</Link>

      <div className="border border-gulag-border rounded p-4 bg-gulag-surface flex items-center justify-between">
        <div>
          <p className="font-medium text-gray-100">{new Date(matchday.match_date).toLocaleDateString('pt-BR')}</p>
          <p className="text-xs text-gray-400">status: {matchday.status}</p>
        </div>
        {matchday.status === 'open' && (
          <button onClick={closeList} className="bg-gulag-cyan text-black font-semibold rounded px-3 py-1 text-sm">
            Fechar lista
          </button>
        )}
      </div>

      <div className="border border-gulag-border rounded p-4 bg-gulag-surface">
        <h2 className="font-semibold text-gulag-cyan mb-3">Confirmações</h2>
        <ul className="grid grid-cols-2 gap-1 text-sm">
          {confirmations.map((c) => (
            <li key={c.id} className="text-gray-300">
              {c.name} <span className="text-gray-500">({c.player_type}) — {c.status}</span>
            </li>
          ))}
        </ul>
      </div>

      <div className="border border-gulag-border rounded p-4 bg-gulag-surface">
        <div className="flex items-center gap-2 mb-3">
          <h2 className="font-semibold text-gulag-cyan">Sorteio de times</h2>
          <input type="number" min="2" value={numberOfTeams} onChange={(e) => setNumberOfTeams(e.target.value)} className={inputClass} />
          <button onClick={drawTeams} className="bg-gulag-cyan text-black font-semibold rounded px-3 py-1 text-sm">
            Sortear
          </button>
        </div>
        <div className="grid grid-cols-2 gap-4">
          {teams.map((t) => (
            <div key={t.id} className="border border-gulag-border rounded p-2">
              <p className="font-medium text-gray-100 mb-2">{t.name} <span className="text-xs text-gray-500">({t.totalStars ?? t.players.reduce((s, p) => s + Number(p.stars), 0)}★)</span></p>
              <ul className="flex flex-col gap-1">
                {t.players.map((p) => (
                  <li key={p.id} className="flex items-center justify-between text-sm text-gray-300">
                    {p.name}
                    <select
                      value={t.id}
                      onChange={(e) => movePlayer(p.id, e.target.value)}
                      className="bg-gulag-surface-2 border border-gulag-border text-xs rounded"
                    >
                      {teams.map((opt) => <option key={opt.id} value={opt.id}>{opt.name}</option>)}
                    </select>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </div>

      <div className="border border-gulag-border rounded p-4 bg-gulag-surface">
        <h2 className="font-semibold text-gulag-cyan mb-3">Súmula</h2>

        {teams.length > 0 && (
          <div className="mb-4 flex gap-4">
            {teams.map((t) => (
              <label key={t.id} className="text-sm text-gray-300 flex items-center gap-2">
                {t.name}
                <select
                  defaultValue={t.result || ''}
                  onChange={(e) => setTeamResults((prev) => ({ ...prev, [t.id]: e.target.value }))}
                  className="bg-gulag-surface-2 border border-gulag-border rounded text-sm"
                >
                  <option value="">-</option>
                  <option value="win">Vitória</option>
                  <option value="draw">Empate</option>
                  <option value="loss">Derrota</option>
                </select>
              </label>
            ))}
          </div>
        )}

        <table className="w-full text-sm mb-4">
          <thead className="text-gray-400 text-left">
            <tr>
              <th>Jogador</th><th>Gols</th><th>Assist.</th><th>Amarelo</th><th>Azul</th><th>Vermelho</th><th>Faltou</th>
            </tr>
          </thead>
          <tbody>
            {linePlayers.map((c) => (
              <tr key={c.player_id} className="text-gray-200">
                <td>{c.name}</td>
                <td><input type="number" min="0" className={inputClass} onChange={(e) => setPlayerField(c.player_id, 'goals', e.target.value)} /></td>
                <td><input type="number" min="0" className={inputClass} onChange={(e) => setPlayerField(c.player_id, 'assists', e.target.value)} /></td>
                <td><input type="number" min="0" className={inputClass} onChange={(e) => setPlayerField(c.player_id, 'yellow_cards', e.target.value)} /></td>
                <td><input type="number" min="0" className={inputClass} onChange={(e) => setPlayerField(c.player_id, 'blue_cards', e.target.value)} /></td>
                <td><input type="number" min="0" className={inputClass} onChange={(e) => setPlayerField(c.player_id, 'red_cards', e.target.value)} /></td>
                <td><input type="checkbox" onChange={(e) => setPlayerField(c.player_id, 'absent', e.target.checked)} /></td>
              </tr>
            ))}
          </tbody>
        </table>

        {goalkeepers.length > 0 && (
          <table className="w-full text-sm mb-4">
            <thead className="text-gray-400 text-left">
              <tr>
                <th>Goleiro</th><th>Contra o time</th><th>Resultado</th><th>Pênaltis def.</th><th>Assist.</th><th>Gols</th>
              </tr>
            </thead>
            <tbody>
              {goalkeepers.map((c) => (
                <tr key={c.player_id} className="text-gray-200">
                  <td>{c.name}</td>
                  <td>
                    <select className="bg-gulag-surface-2 border border-gulag-border rounded text-xs" onChange={(e) => setGoalkeeperField(c.player_id, 'opponent_team_id', e.target.value)}>
                      <option value="">-</option>
                      {teams.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                    </select>
                  </td>
                  <td>
                    <select className="bg-gulag-surface-2 border border-gulag-border rounded text-xs" onChange={(e) => setGoalkeeperField(c.player_id, 'result', e.target.value)}>
                      <option value="">-</option>
                      <option value="win">Vitória</option>
                      <option value="draw">Empate</option>
                      <option value="loss">Derrota</option>
                    </select>
                  </td>
                  <td><input type="number" min="0" className={inputClass} onChange={(e) => setGoalkeeperField(c.player_id, 'penalties_saved', e.target.value)} /></td>
                  <td><input type="number" min="0" className={inputClass} onChange={(e) => setGoalkeeperField(c.player_id, 'assists', e.target.value)} /></td>
                  <td><input type="number" min="0" className={inputClass} onChange={(e) => setGoalkeeperField(c.player_id, 'goals', e.target.value)} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        <button onClick={submitSummary} className="bg-gulag-cyan text-black font-semibold rounded px-4 py-2 text-sm">
          Lançar súmula
        </button>
      </div>
    </div>
  );
}
