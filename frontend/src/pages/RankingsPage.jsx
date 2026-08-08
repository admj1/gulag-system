import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import api from '../api/client';
import { inputClass, Card, Field, EmptyState, matchDateLabel } from '../components/ui';

const MONTHS = [
  'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro',
];

export default function RankingsPage() {
  const [rankings, setRankings] = useState({ topScorers: [], topAssists: [], topGoalkeepers: [] });
  const [seasons, setSeasons] = useState([]);
  const [periods, setPeriods] = useState([]);
  const [curiosities, setCuriosities] = useState(null);
  const [filters, setFilters] = useState({ month: '', year: '', seasonId: '' });

  useEffect(() => {
    api.get('/seasons').then(({ data }) => setSeasons(data));
    // Só os meses/anos que têm súmula lançada entram nos seletores
    api.get('/stats/rankings/periods').then(({ data }) => setPeriods(data));
    api.get('/stats/curiosities').then(({ data }) => setCuriosities(data));
  }, []);

  useEffect(() => {
    const params = {};
    if (filters.month) params.month = filters.month;
    if (filters.year) params.year = filters.year;
    if (filters.seasonId) params.seasonId = filters.seasonId;
    api.get('/stats/rankings', { params }).then(({ data }) => setRankings(data));
  }, [filters]);

  const years = useMemo(
    () => [...new Set(periods.map((p) => p.year))],
    [periods]
  );

  // Escolhido um ano, o seletor de mês mostra só os meses daquele ano
  const months = useMemo(() => {
    const doAno = filters.year
      ? periods.filter((p) => String(p.year) === String(filters.year))
      : periods;
    return [...new Set(doAno.map((p) => p.month))].sort((a, b) => a - b);
  }, [periods, filters.year]);

  function setFilter(key, value) {
    setFilters((prev) => {
      const next = { ...prev, [key]: value };
      // Trocar de ano pode deixar um mês selecionado que não existe nele
      if (key === 'year' && prev.month) {
        const disponivel = periods.some(
          (p) => String(p.month) === String(prev.month) && (!value || String(p.year) === String(value))
        );
        if (!disponivel) next.month = '';
      }
      return next;
    });
  }

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-2xl font-bold text-gray-100">Rankings</h1>

      <Card title="Período">
        <div className="grid gap-3 sm:grid-cols-3">
          <Field label="Mês">
            <select
              value={filters.month}
              onChange={(e) => setFilter('month', e.target.value)}
              className={inputClass}
              disabled={months.length === 0}
            >
              <option value="">Todos</option>
              {months.map((m) => <option key={m} value={m}>{MONTHS[m - 1]}</option>)}
            </select>
          </Field>
          <Field label="Ano">
            <select
              value={filters.year}
              onChange={(e) => setFilter('year', e.target.value)}
              className={inputClass}
              disabled={years.length === 0}
            >
              <option value="">Todos</option>
              {years.map((y) => <option key={y} value={y}>{y}</option>)}
            </select>
          </Field>
          <Field label="Temporada">
            <select value={filters.seasonId} onChange={(e) => setFilter('seasonId', e.target.value)} className={inputClass}>
              <option value="">Todas</option>
              {seasons.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </Field>
        </div>
      </Card>

      <div className="grid gap-4 sm:grid-cols-3">
        <RankingList title="Artilheiros" items={rankings.topScorers} render={(i) => `${i.goals} gols`} />
        <RankingList title="Garçons" items={rankings.topAssists} render={(i) => `${i.assists} assist.`} />
        <RankingList
          title="Goleiros"
          items={rankings.topGoalkeepers}
          render={(i) => `${i.wins}V · ${i.penalties_saved} pên.`}
        />
      </div>

      {curiosities && <Curiosities data={curiosities} />}
    </div>
  );
}

// Recordes de todo o periodo, sem o filtro de mes/ano do quadro de cima
function Curiosities({ data }) {
  const itens = [
    { label: 'Recorde de gols num dia', item: data.topScorerDay, unidade: 'gols', comData: true },
    { label: 'Recorde de assistências num dia', item: data.topAssistDay, unidade: 'assist.', comData: true },
    { label: 'Mais cartões num dia', item: data.topCardsDay, unidade: 'cartões', comData: true },
    { label: 'Mais vezes no time da pelada', item: data.bestTeamTitles, unidade: 'vezes' },
    { label: 'Mais vezes artilheiro do dia', item: data.topScorerTitles, unidade: 'vezes' },
    { label: 'Mais vezes garçom do dia', item: data.topAssistTitles, unidade: 'vezes' },
    { label: 'Maior presença', item: data.mostPresent, unidade: 'peladas' },
  ];

  return (
    <Card title="Curiosidades">
      <p className="text-xs text-gray-500 mb-3">
        De todo o período registrado, sem o filtro acima. Empate entra todo mundo.
      </p>
      <ul className="grid gap-3 sm:grid-cols-2">
        {itens.map(({ label, item, unidade, comData }) => (
          <li key={label} className="border border-gulag-border rounded p-3 bg-gulag-surface-2">
            <p className="text-xs text-gray-400 mb-1">{label}</p>
            {!item ? (
              <p className="text-sm text-gray-600">Sem dados ainda</p>
            ) : (
              <>
                <p className="text-2xl font-bold text-gulag-cyan leading-none">
                  {item.value} <span className="text-xs font-normal text-gray-400">{unidade}</span>
                </p>
                <p className="text-sm text-gray-200 mt-1">
                  {item.entries.map((e, i) => (
                    <span key={`${e.id}-${e.match_date || i}`}>
                      {i > 0 && ', '}
                      <Link to={`/players/${e.id}`} className="text-gulag-cyan underline">
                        {e.name}
                      </Link>
                      {comData && e.match_date && (
                        <span className="text-gray-500"> ({matchDateLabel(e.match_date)})</span>
                      )}
                    </span>
                  ))}
                </p>
              </>
            )}
          </li>
        ))}
      </ul>
    </Card>
  );
}

function RankingList({ title, items, render }) {
  return (
    <Card title={title}>
      {items.length === 0 ? (
        <EmptyState>Sem dados no período.</EmptyState>
      ) : (
        <ol className="flex flex-col gap-2">
          {items.map((item, i) => (
            <li key={item.id} className="flex justify-between items-center gap-2 text-sm">
              <span className="text-gray-300 truncate">
                {i + 1}. <Link to={`/players/${item.id}`} className="text-gulag-cyan underline">{item.name}</Link>
              </span>
              <span className="font-bold text-gray-100 shrink-0">{render(item)}</span>
            </li>
          ))}
        </ol>
      )}
    </Card>
  );
}
