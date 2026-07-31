import { useMemo, useState } from 'react';

// Com o tempo a lista de peladas fica enorme e a rolagem vira um problema:
// aqui elas ficam agrupadas por ano e mes, com so o mes mais recente aberto.
// A data vem como 'AAAA-MM-DD' e e lida como texto de proposito — converter para
// Date traria fuso e jogaria a pelada do dia 1o para o mes anterior.
function groupByYearMonth(matchdays) {
  const years = [];
  for (const matchday of matchdays) {
    const [year, month] = matchday.match_date.split('-');
    let yearGroup = years.find((y) => y.year === year);
    if (!yearGroup) {
      yearGroup = { year, months: [], total: 0 };
      years.push(yearGroup);
    }
    let monthGroup = yearGroup.months.find((m) => m.month === month);
    if (!monthGroup) {
      monthGroup = { month, key: `${year}-${month}`, items: [] };
      yearGroup.months.push(monthGroup);
    }
    monthGroup.items.push(matchday);
    yearGroup.total += 1;
  }
  return years;
}

const monthLabel = (year, month) =>
  new Date(`${year}-${month}-01T12:00:00`).toLocaleDateString('pt-BR', { month: 'long' });

export default function MatchdayAccordion({ matchdays, renderItem }) {
  const [expanded, setExpanded] = useState({});
  const groups = useMemo(() => groupByYearMonth(matchdays), [matchdays]);

  // Ano e mes mais recentes ja vem abertos; o resto fica recolhido
  const openByDefault = useMemo(() => {
    const first = groups[0];
    if (!first) return new Set();
    return new Set([first.year, first.months[0]?.key].filter(Boolean));
  }, [groups]);

  const isExpanded = (key) => (key in expanded ? expanded[key] : openByDefault.has(key));
  const toggle = (key) => setExpanded((current) => ({ ...current, [key]: !isExpanded(key) }));

  return (
    <div className="flex flex-col gap-2">
      {groups.map((yearGroup) => (
        <div key={yearGroup.year} className="border border-gulag-border rounded-lg bg-gulag-surface">
          <button
            onClick={() => toggle(yearGroup.year)}
            aria-expanded={isExpanded(yearGroup.year)}
            className="w-full flex items-center justify-between gap-2 p-3 text-left"
          >
            <span className="font-semibold text-gray-100">{yearGroup.year}</span>
            <span className="text-xs text-gray-500">
              {yearGroup.total} pelada{yearGroup.total > 1 ? 's' : ''}
              <span className="text-gulag-cyan ml-2">{isExpanded(yearGroup.year) ? '▾' : '▸'}</span>
            </span>
          </button>

          {isExpanded(yearGroup.year) && (
            <div className="border-t border-gulag-border p-2 flex flex-col gap-1">
              {yearGroup.months.map((monthGroup) => (
                <div key={monthGroup.key}>
                  <button
                    onClick={() => toggle(monthGroup.key)}
                    aria-expanded={isExpanded(monthGroup.key)}
                    className="w-full flex items-center justify-between gap-2 px-2 py-2 text-left"
                  >
                    <span className="text-sm text-gulag-cyan capitalize">
                      {monthLabel(yearGroup.year, monthGroup.month)}
                    </span>
                    <span className="text-xs text-gray-500">
                      {monthGroup.items.length}
                      <span className="ml-2">{isExpanded(monthGroup.key) ? '▾' : '▸'}</span>
                    </span>
                  </button>

                  {isExpanded(monthGroup.key) && (
                    <ul className="flex flex-col">
                      {monthGroup.items.map((matchday) => (
                        <li key={matchday.id}>{renderItem(matchday)}</li>
                      ))}
                    </ul>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
