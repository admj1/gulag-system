import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import api from '../api/client';

export default function PlayersPage() {
  const [players, setPlayers] = useState([]);

  useEffect(() => {
    api.get('/players').then(({ data }) => setPlayers(data));
  }, []);

  return (
    <div>
      <h1 className="text-2xl font-bold mb-4 text-gray-100">Jogadores</h1>
      <ul className="grid grid-cols-2 gap-3">
        {players.map((p) => (
          <li key={p.id} className="border border-gulag-border rounded p-3 bg-gulag-surface">
            <Link to={`/players/${p.id}`} className="font-medium text-gulag-cyan underline">{p.name}</Link>
            <p className="text-sm text-gray-400">{p.player_type} · {p.stars}★</p>
          </li>
        ))}
      </ul>
    </div>
  );
}
