import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import api from '../api/client';
import { inputClass, Card, Field, EmptyState, Avatar, ScrollArea, matchDateLabel } from '../components/ui';

// Cada visao e so uma coluna diferente para ordenar a mesma lista — os dados
// vem todos numa unica chamada (GET /stats/ranking-geral), sem round-trip
// por filtro. "geral" usa a posicao oficial (com desempate); os demais so
// reordenam pelo proprio numero, do maior para o menor.
const VIEWS = [
  { key: 'geral', label: 'Ranking Geral', column: 'PTS', punitivo: false },
  { key: 'goals', label: 'Gols', column: 'GOLS', punitivo: false },
  { key: 'assists', label: 'Assistências', column: 'ASSIST.', punitivo: false },
  { key: 'tp_count', label: 'Time da Pelada', column: 'TP', punitivo: false },
  { key: 'artilheiro_count', label: 'Artilheiro do Dia', column: 'ART.', punitivo: false },
  { key: 'garcom_count', label: 'Garçom do Dia', column: 'GAR.', punitivo: false },
  { key: 'dobradinha_count', label: 'Dobradinhas', column: 'DOB.', punitivo: false },
  { key: 'presencas', label: 'Presenças', column: 'PRES.', punitivo: false },
  { key: 'faltas', label: 'Faltas', column: 'FALTAS', punitivo: true },
  { key: 'yellow_cards', label: 'Cartões amarelos', column: 'AM', punitivo: true },
  { key: 'blue_cards', label: 'Cartões azuis', column: 'AZ', punitivo: true },
  { key: 'red_cards', label: 'Cartões vermelhos', column: 'VM', punitivo: true },
];

const MEDALS = ['🥇', '🥈', '🥉'];

export default function RankingsPage() {
  const [seasons, setSeasons] = useState([]);
  const [seasonId, setSeasonId] = useState('');
  const [data, setData] = useState(null); // { pesos, players }
  const [loading, setLoading] = useState(false);
  const [view, setView] = useState('geral');
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState(null); // jogador aberto no detalhamento

  useEffect(() => {
    api.get('/seasons').then(({ data: list }) => {
      setSeasons(list);
      // Comeca na temporada mais recente — o ranking nao mistura temporadas
      if (list[0]) setSeasonId(String(list[0].id));
    });
  }, []);

  useEffect(() => {
    if (!seasonId) return;
    setLoading(true);
    api.get('/stats/ranking-geral', { params: { seasonId } })
      .then(({ data: result }) => setData(result))
      .finally(() => setLoading(false));
  }, [seasonId]);

  const players = useMemo(() => data?.players || [], [data]);

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    return term ? players.filter((p) => p.name.toLowerCase().includes(term)) : players;
  }, [players, search]);

  // "geral" respeita a posicao oficial (com desempate) ja calculada no
  // backend; os demais so reordenam pelo numero da propria coluna
  const ordered = useMemo(() => {
    if (view === 'geral') return filtered;
    return [...filtered].sort((a, b) => b[view] - a[view] || b.points - a.points);
  }, [filtered, view]);

  const currentView = VIEWS.find((v) => v.key === view);
  const currentSeason = seasons.find((s) => String(s.id) === seasonId);

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-2xl font-bold text-gray-100">
        Ranking Geral{currentSeason && <span className="text-gray-500"> — {currentSeason.name}</span>}
      </h1>

      <Card>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Temporada">
            <select value={seasonId} onChange={(e) => setSeasonId(e.target.value)} className={inputClass}>
              {seasons.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </Field>
          <Field label="Buscar jogador">
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Nome ou apelido..."
              className={inputClass}
            />
          </Field>
        </div>

        <div className="flex flex-wrap gap-1 mt-3">
          {VIEWS.map((v) => (
            <button
              key={v.key}
              onClick={() => setView(v.key)}
              className={`px-3 py-1.5 rounded text-xs font-medium border ${
                view === v.key
                  ? 'bg-gulag-cyan text-black border-gulag-cyan'
                  : 'border-gulag-border text-gray-300 hover:border-gulag-cyan'
              }`}
            >
              {v.label}
            </button>
          ))}
        </div>
        {currentView?.punitivo && (
          <p className="text-xs text-amber-400 mt-2">
            Critério punitivo: aparece em ordem decrescente de ocorrências (quem mais tem no topo).
          </p>
        )}
      </Card>

      {loading && !data ? (
        <EmptyState>Carregando...</EmptyState>
      ) : ordered.length === 0 ? (
        <EmptyState>Nenhum mensalista com dados nesta temporada.</EmptyState>
      ) : (
        <Card>
          <ScrollArea>
            <table className="w-full text-sm min-w-[760px]">
              <thead className="text-gray-400 text-left">
                <tr className="border-b border-gulag-border">
                  <th className="pb-2 pr-2 w-10">POS</th>
                  <th className="pb-2 pr-2">JOGADOR</th>
                  <th className="pb-2 px-2 text-right text-gulag-cyan">PTS</th>
                  {currentView.key !== 'geral' && (
                    <th className="pb-2 px-2 text-right font-bold text-gray-100">{currentView.column}</th>
                  )}
                  <th className="pb-2 px-2 text-right">GOLS</th>
                  <th className="pb-2 px-2 text-right">ASSIST.</th>
                  <th className="pb-2 px-2 text-right">TP</th>
                  <th className="pb-2 px-2 text-right">ART.</th>
                  <th className="pb-2 px-2 text-right">GAR.</th>
                  <th className="pb-2 px-2 text-right">DOB.</th>
                  <th className="pb-2 px-2 text-right">PRES.</th>
                  <th className="pb-2 px-2 text-right">FALTAS</th>
                  <th className="pb-2 px-2 text-right">AM</th>
                  <th className="pb-2 px-2 text-right">AZ</th>
                  <th className="pb-2 pl-2 text-right">VM</th>
                </tr>
              </thead>
              <tbody>
                {ordered.map((p, i) => (
                  <tr
                    key={p.id}
                    onClick={() => setSelected(p)}
                    className="border-b border-gulag-border last:border-0 text-gray-300 hover:bg-gulag-surface-2 cursor-pointer"
                  >
                    <td className="py-2 pr-2 text-gray-500">
                      {(() => {
                        const pos = view === 'geral' ? p.position : i + 1;
                        return MEDALS[pos - 1] || pos;
                      })()}
                    </td>
                    <td className="py-2 pr-2 text-gray-100 truncate max-w-[160px]">{p.name}</td>
                    <td className="py-2 px-2 text-right font-bold text-gulag-cyan text-base">{p.points}</td>
                    {currentView.key !== 'geral' && (
                      <td className="py-2 px-2 text-right font-bold text-gray-100">{p[currentView.key]}</td>
                    )}
                    <td className="py-2 px-2 text-right">{p.goals}</td>
                    <td className="py-2 px-2 text-right">{p.assists}</td>
                    <td className="py-2 px-2 text-right">{p.tp_count}</td>
                    <td className="py-2 px-2 text-right">{p.artilheiro_count}</td>
                    <td className="py-2 px-2 text-right">{p.garcom_count}</td>
                    <td className="py-2 px-2 text-right">{p.dobradinha_count}</td>
                    <td className="py-2 px-2 text-right">{p.presencas}</td>
                    <td className="py-2 px-2 text-right text-amber-400">{p.faltas}</td>
                    <td className="py-2 px-2 text-right text-amber-400">{p.yellow_cards}</td>
                    <td className="py-2 px-2 text-right text-blue-400">{p.blue_cards}</td>
                    <td className="py-2 pl-2 text-right text-red-400">{p.red_cards}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </ScrollArea>
          <p className="text-xs text-gray-500 mt-3">
            Só entram jogadores mensalistas. Toque numa linha para ver o detalhamento e a memória do cálculo.
          </p>
        </Card>
      )}

      {selected && data && (
        <PlayerBreakdown player={selected} pesos={data.pesos} onClose={() => setSelected(null)} />
      )}

      <Curiosities />
    </div>
  );
}

// Memoria do calculo: so mostra as linhas que realmente contribuiram, na
// mesma ordem da formula da especificacao — o objetivo e o jogador conseguir
// conferir a propria pontuacao a mao.
function PlayerBreakdown({ player: p, pesos, onClose }) {
  const linhas = [
    [p.goals, 'gol(s)', pesos.gol],
    [p.assists, 'assistência(s)', pesos.assistencia],
    [p.tp_count, 'Time(s) da Pelada', pesos.timeDaPelada],
    [p.artilheiro_count, 'artilharia(s) do dia', pesos.artilheiroDoDia],
    [p.garcom_count, 'garçom(ns) do dia', pesos.garcomDoDia],
    [p.dobradinha_count, 'dobradinha(s)', pesos.dobradinha],
    [p.presencas, 'presença(s)', pesos.presenca],
    [p.faltas, 'falta(s) após confirmação', pesos.faltaAposConfirmar],
    [p.yellow_cards, 'cartão(ões) amarelo(s)', pesos.amarelo],
    [p.blue_cards, 'cartão(ões) azul(is)', pesos.azul],
    [p.red_cards, 'cartão(ões) vermelho(s)', pesos.vermelho],
  ].filter(([qtd]) => qtd > 0);

  return (
    <Card
      title={`${p.name} — ${p.points} PTS`}
      action={<button onClick={onClose} className="text-gray-400 text-xl leading-none px-2">×</button>}
    >
      <div className="flex items-center gap-3 mb-3">
        <Avatar src={p.photo_url} name={p.name} />
        <Link to={`/players/${p.id}`} className="text-sm text-gulag-cyan underline">Ver perfil completo</Link>
      </div>
      {linhas.length === 0 ? (
        <p className="text-sm text-gray-500">Sem lançamentos nesta temporada ainda.</p>
      ) : (
        <ul className="text-sm text-gray-300 font-mono flex flex-col gap-0.5">
          {linhas.map(([qtd, label, peso]) => {
            const subtotal = qtd * peso;
            return (
              <li key={label} className="flex justify-between gap-2">
                <span>{qtd} {label}</span>
                <span className={subtotal < 0 ? 'text-red-400' : 'text-emerald-400'}>
                  {subtotal > 0 ? '+' : ''}{subtotal}
                </span>
              </li>
            );
          })}
          <li className="flex justify-between gap-2 border-t border-gulag-border mt-1 pt-1 font-bold text-gulag-cyan">
            <span>TOTAL</span>
            <span>{p.points}</span>
          </li>
        </ul>
      )}
    </Card>
  );
}

// Recordes de todo o periodo (nao entra na pontuacao, e so curiosidade)
function Curiosities() {
  const [data, setData] = useState(null);

  useEffect(() => { api.get('/stats/curiosities').then(({ data: result }) => setData(result)); }, []);

  if (!data) return null;

  const itens = [
    { label: 'Recorde de gols num dia', item: data.topScorerDay, unidade: 'gols', comData: true },
    { label: 'Recorde de assistências num dia', item: data.topAssistDay, unidade: 'assist.', comData: true },
    { label: 'Mais cartões num dia', item: data.topCardsDay, unidade: 'cartões', comData: true },
    { label: 'Mais vezes no time da pelada', item: data.bestTeamTitles, unidade: 'vezes' },
    { label: 'Maior presença', item: data.mostPresent, unidade: 'peladas' },
  ];

  return (
    <Card title="Curiosidades">
      <p className="text-xs text-gray-500 mb-3">
        Recordes de todo o período registrado (todas as temporadas), sem entrar na pontuação do
        Ranking Geral. Empate entra todo mundo.
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
                      <Link to={`/players/${e.id}`} className="text-gulag-cyan underline">{e.name}</Link>
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
