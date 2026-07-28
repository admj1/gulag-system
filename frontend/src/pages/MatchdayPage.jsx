import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import toast from 'react-hot-toast';
import api from '../api/client';
import { useAuth } from '../context/AuthContext';
import AtaList from '../components/AtaList';
import { Button, Card, ScrollArea } from '../components/ui';

const STATUS_LABELS = { open: 'Lista aberta', closed: 'Lista fechada', played: 'Realizada' };

export default function MatchdayPage() {
  const { id } = useParams();
  const { player } = useAuth();
  const [matchday, setMatchday] = useState(null);
  const [confirmations, setConfirmations] = useState([]);
  const [teams, setTeams] = useState([]);
  const [summary, setSummary] = useState({ playerStats: [], goalkeeperStats: [] });

  function load() {
    api.get(`/matchdays/${id}`).then(({ data }) => setMatchday(data));
    api.get(`/matchdays/${id}/confirmations`).then(({ data }) => setConfirmations(data));
    api.get(`/matchdays/${id}/teams`).then(({ data }) => setTeams(data));
    api.get(`/matchdays/${id}/summary`).then(({ data }) => setSummary(data));
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

  if (!matchday) return <p className="text-gray-400">Carregando...</p>;

  const mine = confirmations.find((c) => c.player_id === player?.id);
  const nameById = Object.fromEntries(confirmations.map((c) => [c.player_id, c.name]));

  return (
    <div className="flex flex-col gap-4">
      <Link to="/" className="text-sm text-gulag-cyan underline">← voltar</Link>

      <Card>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="font-medium text-gray-100">
              {new Date(`${matchday.match_date}T12:00:00`).toLocaleDateString('pt-BR', {
                weekday: 'long', day: '2-digit', month: '2-digit', year: 'numeric',
              })}
            </p>
            <p className="text-xs text-gray-500">{STATUS_LABELS[matchday.status] || matchday.status}</p>
          </div>
          {matchday.status === 'open' && mine?.status !== 'confirmed' && (
            <Button onClick={confirmPresence}>Confirmar presença</Button>
          )}
          {mine?.status === 'confirmed' && (
            <span className="text-sm text-emerald-400">Presença confirmada ✓</span>
          )}
        </div>
      </Card>

      <AtaList confirmations={confirmations} />

      {teams.length > 0 && (
        <div className="grid gap-3 sm:grid-cols-2">
          {teams.map((t) => (
            <Card key={t.id} title={t.name}>
              <ul className="text-sm text-gray-300 flex flex-col gap-1">
                {t.players.map((p) => <li key={p.id}>{p.name}</li>)}
              </ul>
            </Card>
          ))}
        </div>
      )}

      {summary.playerStats.length > 0 && (
        <Card title="Súmula">
          <ScrollArea>
            <table className="w-full text-sm min-w-[420px]">
              <thead className="text-gray-400 text-left">
                <tr><th>Jogador</th><th>Gols</th><th>Assist.</th><th>Cartões</th><th>Faltou</th></tr>
              </thead>
              <tbody>
                {summary.playerStats.map((s) => (
                  <tr key={s.id} className="text-gray-200 border-t border-gulag-border">
                    <td className="py-1">{nameById[s.player_id] || `#${s.player_id}`}</td>
                    <td>{s.goals}</td>
                    <td>{s.assists}</td>
                    <td>{s.yellow_cards + s.blue_cards + s.red_cards}</td>
                    <td>{s.absent ? 'sim' : '-'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </ScrollArea>
        </Card>
      )}
    </div>
  );
}
