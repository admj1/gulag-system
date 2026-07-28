import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import api from '../api/client';
import { inputClass, Card, Avatar, EmptyState } from '../components/ui';

const GROUPS = [
  { key: 'mensalista', label: 'Mensalistas' },
  { key: 'goleiro', label: 'Goleiros' },
  { key: 'diarista', label: 'Diaristas' },
];

export default function PlayersPage() {
  const [players, setPlayers] = useState([]);
  const [search, setSearch] = useState('');

  useEffect(() => {
    api.get('/players').then(({ data }) => setPlayers(data));
  }, []);

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return players;
    return players.filter((p) => p.name.toLowerCase().includes(term));
  }, [players, search]);

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-2xl font-bold text-gray-100">Jogadores</h1>

      <input
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="Pesquisar jogador..."
        className={inputClass}
      />

      {GROUPS.map(({ key, label }) => {
        const group = filtered.filter((p) => p.player_type === key);
        return (
          <Card key={key} title={`${label} (${group.length})`}>
            {group.length === 0 ? (
              <EmptyState>Nenhum jogador encontrado.</EmptyState>
            ) : (
              <ul className="grid gap-2 sm:grid-cols-2">
                {group.map((p) => (
                  <li key={p.id}>
                    <Link
                      to={`/players/${p.id}`}
                      className="flex items-center gap-3 border border-gulag-border rounded p-2 hover:border-gulag-cyan"
                    >
                      {p.mensalista_number && (
                        <span className="text-gray-500 text-sm w-5 text-right shrink-0">{p.mensalista_number}</span>
                      )}
                      <Avatar src={p.photo_url} name={p.name} size="sm" />
                      <div className="min-w-0">
                        <p className="text-gray-100 truncate">{p.name}</p>
                        <p className="text-xs text-gray-500">{p.stars}★ {p.position || ''}</p>
                      </div>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        );
      })}
    </div>
  );
}
