import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import api from '../api/client';

export default function RankingsPage() {
  const [rankings, setRankings] = useState({ topScorers: [], topAssists: [] });

  useEffect(() => {
    api.get('/stats/rankings').then(({ data }) => setRankings(data));
  }, []);

  return (
    <div className="grid grid-cols-2 gap-6">
      <RankingList title="Artilheiros" items={rankings.topScorers} valueKey="goals" />
      <RankingList title="Garçons" items={rankings.topAssists} valueKey="assists" />
    </div>
  );
}

function RankingList({ title, items, valueKey }) {
  return (
    <div>
      <h2 className="font-semibold mb-2">{title}</h2>
      <ol className="flex flex-col gap-2">
        {items.map((item, i) => (
          <li key={item.id} className="border rounded p-2 bg-white flex justify-between">
            <span>{i + 1}. <Link to={`/players/${item.id}`} className="underline">{item.name}</Link></span>
            <span className="font-bold">{item[valueKey]}</span>
          </li>
        ))}
      </ol>
    </div>
  );
}
