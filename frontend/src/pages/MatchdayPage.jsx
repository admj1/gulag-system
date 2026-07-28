import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import api from '../api/client';
import { Card, ScrollArea, EmptyState } from '../components/ui';

export default function MatchdayPage() {
  const { id } = useParams();
  const [matchday, setMatchday] = useState(null);
  const [confirmations, setConfirmations] = useState([]);
  const [teams, setTeams] = useState([]);
  const [summary, setSummary] = useState({ playerStats: [], goalkeeperStats: [] });

  useEffect(() => {
    api.get(`/matchdays/${id}`).then(({ data }) => setMatchday(data));
    api.get(`/matchdays/${id}/confirmations`).then(({ data }) => setConfirmations(data));
    api.get(`/matchdays/${id}/teams`).then(({ data }) => setTeams(data));
    api.get(`/matchdays/${id}/summary`).then(({ data }) => setSummary(data));
  }, [id]);

  if (!matchday) return <p className="text-gray-400">Carregando...</p>;

  const nameById = Object.fromEntries(confirmations.map((c) => [c.player_id, c.name]));
  const confirmed = confirmations.filter((c) => c.status === 'confirmed');

  return (
    <div className="flex flex-col gap-4">
      <Link to="/" className="text-sm text-gulag-cyan underline">← voltar</Link>
      <h1 className="text-2xl font-bold text-gray-100">
        {new Date(`${matchday.match_date}T12:00:00`).toLocaleDateString('pt-BR', {
          weekday: 'long', day: '2-digit', month: '2-digit', year: 'numeric',
        })}
      </h1>

      <Card title={`Relacionados (${confirmed.length})`}>
        {confirmed.length === 0 ? (
          <EmptyState>Ninguém confirmado ainda.</EmptyState>
        ) : (
          <ul className="grid gap-1 sm:grid-cols-2 text-sm">
            {confirmed.map((c) => (
              <li key={c.id} className="text-gray-300">
                {c.name} <span className="text-gray-500">({c.player_type})</span>
              </li>
            ))}
          </ul>
        )}
      </Card>

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
