import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import api from '../api/client';

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
    <div>
      <h1 className="text-2xl font-bold mb-1 text-gray-100">{player.name}</h1>
      <p className="text-gray-400 mb-6">{player.position} · {player.player_type} · {player.stars}★</p>

      <h2 className="font-semibold mb-2 text-gulag-cyan">Estatísticas de linha</h2>
      <div className="grid grid-cols-3 gap-3 mb-6">
        <Stat label="Peladas jogadas" value={totals.peladas_jogadas} />
        <Stat label="Gols" value={totals.goals} />
        <Stat label="Assistências" value={totals.assists} />
        <Stat label="Cartões amarelos" value={totals.yellow_cards} />
        <Stat label="Cartões azuis" value={totals.blue_cards} />
        <Stat label="Cartões vermelhos" value={totals.red_cards} />
        <Stat label="Ausências" value={totals.absences} />
      </div>

      {player.player_type === 'goleiro' && (
        <>
          <h2 className="font-semibold mb-2 text-gulag-cyan">Estatísticas de goleiro</h2>
          <div className="grid grid-cols-3 gap-3">
            <Stat label="Vitórias" value={goalkeeperTotals.wins} />
            <Stat label="Empates" value={goalkeeperTotals.draws} />
            <Stat label="Derrotas" value={goalkeeperTotals.losses} />
            <Stat label="Pênaltis defendidos" value={goalkeeperTotals.penalties_saved} />
            <Stat label="Assistências" value={goalkeeperTotals.assists} />
            <Stat label="Gols" value={goalkeeperTotals.goals} />
          </div>
        </>
      )}
    </div>
  );
}

function Stat({ label, value }) {
  return (
    <div className="border border-gulag-border rounded p-3 bg-gulag-surface text-center">
      <p className="text-2xl font-bold text-gulag-cyan">{value}</p>
      <p className="text-sm text-gray-400">{label}</p>
    </div>
  );
}
