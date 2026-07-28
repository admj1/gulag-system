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
      <h1 className="text-2xl font-bold mb-4">Jogadores</h1>
      <ul className="grid grid-cols-2 gap-3">
        {players.map((p) => (
          <li key={p.id} className="border rounded p-3 bg-white">
            <Link to={`/players/${p.id}`} className="font-medium underline">{p.name}</Link>
            <p className="text-sm text-slate-500">{p.player_type} · {p.stars}★</p>
          </li>
        ))}
      </ul>
    </div>
  );
}
