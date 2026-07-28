import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import api from '../api/client';
import { Card, Avatar } from '../components/ui';

export default function PlayerProfilePage() {
  const { id } = useParams();
  const [profile, setProfile] = useState(null);
  const [player, setPlayer] = useState(null);

  useEffect(() => {
    api.get(`/players/${id}`).then(({ data }) => setPlayer(data));
    api.get(`/stats/players/${id}`).then(({ data }) => setProfile(data));
  }, [id]);

  if (!player || !profile) return <p className="text-gray-400">Carregando...</p>;

  const { totals, goalkeeperTotals } = profile;

  return (
    <div className="flex flex-col gap-4">
      <Link to="/players" className="text-sm text-gulag-cyan underline">← voltar</Link>

      <div className="flex items-center gap-4">
        <Avatar src={player.photo_url} name={player.name} size="lg" />
        <div className="min-w-0">
          <h1 className="text-2xl font-bold text-gray-100 truncate">{player.name}</h1>
          <p className="text-gray-400 text-sm">
            {player.first_name} {player.last_name}
          </p>
          <p className="text-gray-400 text-sm">
            {[player.position, player.player_type, `${player.stars}★`].filter(Boolean).join(' · ')}
          </p>
        </div>
      </div>

      <Card title="Estatísticas de linha">
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          <Stat label="Peladas jogadas" value={totals.peladas_jogadas} />
          <Stat label="Gols" value={totals.goals} />
          <Stat label="Assistências" value={totals.assists} />
          <Stat label="Amarelos" value={totals.yellow_cards} />
          <Stat label="Azuis" value={totals.blue_cards} />
          <Stat label="Vermelhos" value={totals.red_cards} />
          <Stat label="Ausências" value={totals.absences} />
        </div>
      </Card>

      {player.player_type === 'goleiro' && (
        <Card title="Estatísticas de goleiro">
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            <Stat label="Vitórias" value={goalkeeperTotals.wins} />
            <Stat label="Empates" value={goalkeeperTotals.draws} />
            <Stat label="Derrotas" value={goalkeeperTotals.losses} />
            <Stat label="Pênaltis defendidos" value={goalkeeperTotals.penalties_saved} />
            <Stat label="Assistências" value={goalkeeperTotals.assists} />
            <Stat label="Gols" value={goalkeeperTotals.goals} />
            <Stat label="Amarelos" value={goalkeeperTotals.yellow_cards} />
            <Stat label="Vermelhos" value={goalkeeperTotals.red_cards} />
          </div>
        </Card>
      )}
    </div>
  );
}

function Stat({ label, value }) {
  return (
    <div className="border border-gulag-border rounded p-3 bg-gulag-surface-2 text-center">
      <p className="text-2xl font-bold text-gulag-cyan">{value}</p>
      <p className="text-xs text-gray-400">{label}</p>
    </div>
  );
}
