import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import api from '../api/client';
import { useAuth } from '../context/AuthContext';
import { inputClass, Button, Card, Field, EmptyState, ScrollArea, matchDateLabel } from '../components/ui';
import { TOURNAMENT_STATUS, reais, rotuloPartida } from '../components/tournament';

const erroDe = (err, padrao) => err.response?.data?.error || padrao;

export default function TournamentPage() {
  const { id } = useParams();
  const { player, isAdmin } = useAuth();
  const [d, setD] = useState(null);

  const load = useCallback(() => {
    api.get(`/tournaments/${id}`).then(({ data }) => setD(data))
      .catch((err) => toast.error(erroDe(err, 'Erro ao carregar o torneio')));
  }, [id]);
  useEffect(() => { load(); }, [load]);

  // Durante o draft quem esta so acompanhando pelo celular ve as escolhas
  // chegando sem precisar recarregar
  useEffect(() => {
    if (d?.tournament.status !== 'draft' || isAdmin) return undefined;
    const t = setInterval(load, 4000);
    return () => clearInterval(t);
  }, [d?.tournament.status, isAdmin, load]);

  if (!d) return <EmptyState>Carregando...</EmptyState>;
  const t = d.tournament;
  const depoisDoDraft = ['grupos', 'mata_mata', 'encerrado'].includes(t.status);

  async function acao(fn, sucesso) {
    try {
      await fn();
      if (sucesso) toast.success(sucesso);
      load();
    } catch (err) {
      toast.error(erroDe(err, 'Não foi possível concluir'));
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <Link to="/torneios" className="text-sm text-gulag-cyan underline">← torneios</Link>
      <Header d={d} isAdmin={isAdmin} acao={acao} />

      {t.status === 'encerrado' && <Premiacao d={d} isAdmin={isAdmin} acao={acao} />}

      {t.status === 'draft' && <Draft d={d} isAdmin={isAdmin} acao={acao} />}

      {depoisDoDraft && (
        <>
          <JogosEClassificacao d={d} />
          <Times d={d} isAdmin={isAdmin} />
          <Estatisticas d={d} />
          {isAdmin && Number(t.fee) > 0 && <Taxas d={d} acao={acao} />}
          {isAdmin && t.status !== 'encerrado' && <Premiacao d={d} isAdmin acao={acao} />}
        </>
      )}

      {['inscricoes', 'draft'].includes(t.status) && (
        <Inscritos d={d} me={player} isAdmin={isAdmin} acao={acao} />
      )}
    </div>
  );
}

function Header({ d, isAdmin, acao }) {
  const t = d.tournament;
  const navigate = useNavigate();

  async function excluir() {
    const ok = window.prompt(`Excluir o torneio "${t.name}" com tudo (inscrições, times, jogos)? Digite EXCLUIR para confirmar.`);
    if (ok !== 'EXCLUIR') return;
    try {
      await api.delete(`/tournaments/${t.id}`);
      toast.success('Torneio excluído');
      navigate('/torneios');
    } catch (err) {
      toast.error(erroDe(err, 'Erro ao excluir'));
    }
  }

  return (
    <Card>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h1 className="text-2xl font-bold text-gray-100">{t.name}</h1>
          <p className="text-sm text-gray-400">
            {matchDateLabel(t.event_date)} · {t.num_teams} times de {t.line_per_team} + {t.gk_per_team} goleiro(s)
            {Number(t.fee) > 0 && ` · taxa ${reais(t.fee)} (goleiro isento)`}
          </p>
          <p className="text-sm text-gulag-cyan mt-1">{TOURNAMENT_STATUS[t.status]}</p>
        </div>
        {isAdmin && (
          <div className="flex gap-2 flex-wrap">
            {t.status === 'inscricoes' && (
              <Button onClick={() => {
                if (window.confirm('Encerrar as inscrições e começar o draft? Depois disso só um admin inscreve alguém.')) {
                  acao(() => api.post(`/tournaments/${t.id}/start-draft`), 'Inscrições encerradas — hora do draft');
                }
              }}
              >
                Encerrar inscrições e ir para o draft
              </Button>
            )}
            <Button variant="danger" onClick={excluir}>Excluir torneio</Button>
          </div>
        )}
      </div>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Inscricoes
// ---------------------------------------------------------------------------

function Inscritos({ d, me, isAdmin, acao }) {
  const t = d.tournament;
  const [todos, setTodos] = useState([]);
  const [incluir, setIncluir] = useState('');
  const souInscrito = d.registrations.some((r) => r.player_id === me?.id);
  const linha = d.registrations.filter((r) => r.player_type !== 'goleiro');
  const goleiros = d.registrations.filter((r) => r.player_type === 'goleiro');
  const noTime = new Set(d.teams.flatMap((tm) => tm.players.map((p) => p.player_id)));

  useEffect(() => {
    if (isAdmin) api.get('/players').then(({ data }) => setTodos(data));
  }, [isAdmin]);
  const inscritos = new Set(d.registrations.map((r) => r.player_id));
  const disponiveis = todos.filter((p) => !inscritos.has(p.id));

  const lista = (itens) => (
    <ul className="flex flex-col">
      {itens.map((r, i) => (
        <li key={r.player_id} className="flex items-center gap-2 py-1.5 border-b border-gulag-border last:border-0 text-sm">
          <span className="text-gray-600 w-6 text-right">{i + 1}</span>
          <span className={`flex-1 truncate ${noTime.has(r.player_id) ? 'text-gulag-cyan' : 'text-gray-200'}`}>
            {r.name}
          </span>
          <span className="text-xs text-gray-500">{r.player_type}</span>
          {isAdmin && !noTime.has(r.player_id) && (
            <button
              onClick={() => acao(() => api.delete(`/tournaments/${t.id}/registrations/${r.player_id}`), 'Inscrição removida')}
              className="text-red-400 px-2 text-lg leading-none"
              aria-label={`Tirar ${r.name}`}
            >
              ×
            </button>
          )}
        </li>
      ))}
    </ul>
  );

  return (
    <Card title={`Inscritos (${d.registrations.length})`}>
      {t.status === 'inscricoes' && (
        <div className="mb-3">
          {souInscrito ? (
            <div className="rounded bg-emerald-500/10 border border-emerald-600/40 p-3 flex flex-wrap items-center justify-between gap-2">
              <p className="text-emerald-400 text-sm">Você está inscrito ✓</p>
              <Button variant="secondary" onClick={() => acao(() => api.delete(`/tournaments/${t.id}/registrations/me`), 'Inscrição cancelada')}>
                Desistir
              </Button>
            </div>
          ) : (
            <Button className="w-full text-base py-3" onClick={() => acao(() => api.post(`/tournaments/${t.id}/registrations`), 'Inscrição feita!')}>
              Quero participar
            </Button>
          )}
          <p className="text-xs text-gray-500 mt-2">
            Quem não for convocado no draft fica de fora. A taxa ({reais(t.fee)}) só é cobrada de quem for convocado;
            goleiro é isento.
          </p>
        </div>
      )}

      {isAdmin && (
        <div className="flex gap-2 mb-3">
          <select value={incluir} onChange={(e) => setIncluir(e.target.value)} className={`${inputClass} flex-1`}>
            <option value="">Inscrever alguém...</option>
            {disponiveis.map((p) => <option key={p.id} value={p.id}>{p.name} ({p.player_type})</option>)}
          </select>
          <Button
            variant="secondary"
            disabled={!incluir}
            onClick={() => acao(async () => {
              await api.post(`/tournaments/${t.id}/registrations`, { player_id: Number(incluir) });
              setIncluir('');
            }, 'Inscrito')}
          >
            Inscrever
          </Button>
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <p className="text-xs text-gray-400 mb-1">Linha ({linha.length})</p>
          {linha.length ? lista(linha) : <EmptyState>Ninguém ainda.</EmptyState>}
        </div>
        <div>
          <p className="text-xs text-gray-400 mb-1">Goleiros ({goleiros.length})</p>
          {goleiros.length ? lista(goleiros) : <EmptyState>Ninguém ainda.</EmptyState>}
        </div>
      </div>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Draft
// ---------------------------------------------------------------------------

function Draft({ d, isAdmin, acao }) {
  const t = d.tournament;
  const temEscolhas = d.teams.some((tm) => tm.players.some((p) => p.pick_number != null));
  const capitaesDefinidos = d.teams.length === t.num_teams;

  return (
    <>
      {isAdmin && !temEscolhas && <Capitaes d={d} acao={acao} />}
      {capitaesDefinidos && <OrdemEEscolhas d={d} isAdmin={isAdmin} acao={acao} temEscolhas={temEscolhas} />}
      {!capitaesDefinidos && !isAdmin && (
        <Card><p className="text-sm text-gray-400">Aguardando a organização definir os capitães.</p></Card>
      )}
    </>
  );
}

function Capitaes({ d, acao }) {
  const t = d.tournament;
  const atuais = d.teams.map((tm) => tm.captain_id);
  const [marcados, setMarcados] = useState(atuais);
  const candidatos = d.registrations.filter((r) => r.player_type !== 'goleiro');

  function alterna(pid) {
    setMarcados((m) => (m.includes(pid) ? m.filter((x) => x !== pid) : [...m, pid]));
  }

  return (
    <Card title={`1. Capitães (${marcados.length}/${t.num_teams})`}>
      <p className="text-xs text-gray-500 mb-2">
        Marque {t.num_teams} capitães entre os inscritos. Cada time leva o nome do capitão (ex.: Time Adema).
      </p>
      <div className="flex flex-wrap gap-1 mb-3">
        {candidatos.map((r) => (
          <button
            key={r.player_id}
            onClick={() => alterna(r.player_id)}
            className={`px-3 py-1.5 rounded text-sm border ${
              marcados.includes(r.player_id)
                ? 'bg-gulag-cyan text-black border-gulag-cyan font-semibold'
                : 'border-gulag-border text-gray-300 hover:border-gulag-cyan'
            }`}
          >
            {r.name}
          </button>
        ))}
      </div>
      <Button
        disabled={marcados.length !== t.num_teams}
        onClick={() => acao(() => api.post(`/tournaments/${t.id}/captains`, { player_ids: marcados }), 'Capitães definidos')}
      >
        Salvar capitães
      </Button>
    </Card>
  );
}

function OrdemEEscolhas({ d, isAdmin, acao, temEscolhas }) {
  const t = d.tournament;
  const { draft } = d;
  const porId = Object.fromEntries(d.teams.map((tm) => [tm.id, tm]));
  const ordem = draft.ordem.map((idTime) => porId[idTime]);
  const noTime = new Set(d.teams.flatMap((tm) => tm.players.map((p) => p.player_id)));
  const livres = d.registrations.filter((r) => !noTime.has(r.player_id)
    && (r.player_type === 'goleiro') === (draft.fase === 'goleiro'));
  const daVez = draft.teamId ? porId[draft.teamId] : null;

  function move(i, delta) {
    const nova = [...draft.ordem];
    [nova[i], nova[i + delta]] = [nova[i + delta], nova[i]];
    acao(() => api.post(`/tournaments/${t.id}/draft-order`, { team_ids: nova }));
  }

  return (
    <>
      <Card title="2. Ordem do draft">
        <p className="text-xs text-gray-500 mb-2">
          Cobrinha: na 1ª rodada escolhe do 1º ao último; na 2ª, do último ao 1º, e assim por diante.
          Depois dos jogadores de linha vem o draft só dos goleiros, na mesma lógica.
        </p>
        <ol className="flex flex-col gap-1 mb-3">
          {ordem.map((tm, i) => (
            <li key={tm.id} className="flex items-center gap-2 text-sm">
              <span className="w-6 text-right text-gulag-cyan font-bold">{i + 1}º</span>
              <span className="flex-1 text-gray-100">{tm.name}</span>
              {isAdmin && !temEscolhas && (
                <>
                  <button disabled={i === 0} onClick={() => move(i, -1)} className="px-2 text-gray-400 disabled:opacity-30">▲</button>
                  <button disabled={i === ordem.length - 1} onClick={() => move(i, 1)} className="px-2 text-gray-400 disabled:opacity-30">▼</button>
                </>
              )}
            </li>
          ))}
        </ol>
        {isAdmin && !temEscolhas && (
          <Button variant="secondary" onClick={() => acao(() => api.post(`/tournaments/${t.id}/draft-order`, { random: true }), 'Ordem sorteada')}>
            🎲 Sortear ordem
          </Button>
        )}
      </Card>

      <Card title="3. Escolhas">
        {draft.fase === 'fim' ? (
          <div className="flex flex-col gap-2">
            <p className="text-sm text-emerald-400">Draft completo.</p>
            {isAdmin && (
              <div className="flex gap-2 flex-wrap">
                <Button onClick={() => {
                  if (window.confirm('Fechar o draft e gerar os grupos e os jogos? Depois disso os times não mudam mais.')) {
                    acao(() => api.post(`/tournaments/${t.id}/finish-draft`), 'Tabela gerada!');
                  }
                }}
                >
                  Fechar draft e gerar tabela
                </Button>
                <Button variant="secondary" onClick={() => acao(() => api.delete(`/tournaments/${t.id}/picks/last`))}>
                  ↶ Desfazer última escolha
                </Button>
              </div>
            )}
          </div>
        ) : (
          <>
            <div className="rounded border border-gulag-cyan/50 bg-gulag-cyan/10 p-3 mb-3">
              <p className="text-xs text-gray-400">
                {draft.fase === 'goleiro' ? 'Draft dos goleiros' : 'Jogadores de linha'} · rodada {draft.rodada}/{draft.totalRodadas} · escolha nº {draft.proximaEscolha}
              </p>
              <p className="text-lg font-bold text-gulag-cyan">Vez do {daVez?.name}</p>
            </div>
            {isAdmin ? (
              <>
                <p className="text-xs text-gray-500 mb-2">Toque em quem o capitão convocar:</p>
                <div className="flex flex-wrap gap-1 mb-3">
                  {livres.map((r) => (
                    <button
                      key={r.player_id}
                      onClick={() => acao(() => api.post(`/tournaments/${t.id}/picks`, { player_id: r.player_id }), `${r.name} → ${daVez?.name}`)}
                      className="px-3 py-2 rounded text-sm border border-gulag-border text-gray-200 hover:border-gulag-cyan hover:text-gulag-cyan"
                    >
                      {r.name} <span className="text-xs text-gray-500">{r.player_type === 'goleiro' ? '' : r.player_type}</span>
                    </button>
                  ))}
                </div>
                {temEscolhas && (
                  <Button variant="secondary" onClick={() => acao(() => api.delete(`/tournaments/${t.id}/picks/last`))}>
                    ↶ Desfazer última escolha
                  </Button>
                )}
              </>
            ) : (
              <p className="text-xs text-gray-500">A tela atualiza sozinha a cada escolha.</p>
            )}
          </>
        )}
      </Card>

      <ElencosDoDraft ordem={ordem} />
    </>
  );
}

function ElencosDoDraft({ ordem }) {
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {ordem.map((tm) => (
        <Card key={tm.id} title={tm.name}>
          <ol className="text-sm flex flex-col gap-0.5">
            {tm.players.map((p) => (
              <li key={p.player_id} className="flex justify-between gap-2">
                <span className={p.pick_number == null ? 'text-gulag-cyan font-semibold' : 'text-gray-200'}>
                  {p.is_goalkeeper ? '🧤 ' : ''}{p.name}
                </span>
                <span className="text-xs text-gray-500">{p.pick_number == null ? 'capitão' : `#${p.pick_number}`}</span>
              </li>
            ))}
          </ol>
        </Card>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Depois do draft
// ---------------------------------------------------------------------------

function Placar({ m }) {
  const jogou = m.status !== 'pendente';
  return (
    <span className="font-bold text-gray-100 tabular-nums">
      {jogou ? `${m.home_goals} x ${m.away_goals}` : 'x'}
      {m.home_penalties != null && (
        <span className="text-xs text-gray-400 font-normal"> (pên. {m.home_penalties}x{m.away_penalties})</span>
      )}
    </span>
  );
}

function JogosEClassificacao({ d }) {
  const grupos = Object.keys(d.standings).sort();
  return (
    <>
      <div className={`grid gap-3 ${grupos.length > 1 ? 'sm:grid-cols-2' : ''}`}>
        {grupos.map((g) => (
          <Card key={g} title={`Grupo ${g}`}>
            <ScrollArea>
              <table className="w-full text-sm">
                <thead className="text-gray-400 text-xs">
                  <tr>
                    <th className="text-left pb-1">Time</th>
                    {['P', 'J', 'V', 'E', 'D', 'SG', 'AM'].map((h) => <th key={h} className="text-center pb-1 px-1">{h}</th>)}
                  </tr>
                </thead>
                <tbody>
                  {d.standings[g].map((l, i) => (
                    <tr key={l.team_id} className={`border-t border-gulag-border ${i < 2 ? 'text-gray-100' : 'text-gray-500'}`}>
                      <td className="py-1.5 truncate max-w-[140px]">{i < 2 && <span className="text-emerald-400">● </span>}{l.name}</td>
                      <td className="text-center font-bold text-gulag-cyan">{l.pts}</td>
                      <td className="text-center">{l.j}</td>
                      <td className="text-center">{l.v}</td>
                      <td className="text-center">{l.e}</td>
                      <td className="text-center">{l.d}</td>
                      <td className="text-center">{l.sg}</td>
                      <td className="text-center text-amber-400">{l.amarelos}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </ScrollArea>
            <p className="text-[11px] text-gray-500 mt-1">● passam para o mata-mata. Desempate: saldo, menos amarelos.</p>
          </Card>
        ))}
      </div>

      <Card title="Jogos">
        <ul className="flex flex-col">
          {d.matches.map((m) => (
            <li key={m.id} className="border-b border-gulag-border last:border-0">
              <Link to={`/torneios/partidas/${m.id}`} className="flex items-center gap-2 py-2 hover:bg-gulag-surface-2 -mx-2 px-2 rounded">
                <span className="text-xs text-gray-500 w-28 shrink-0">{rotuloPartida(m)}</span>
                <span className="flex-1 text-right text-sm text-gray-200 truncate">{m.home_name}</span>
                <Placar m={m} />
                <span className="flex-1 text-sm text-gray-200 truncate">{m.away_name}</span>
                <span className={`text-[11px] w-20 text-right ${m.status === 'em_andamento' ? 'text-amber-400' : 'text-gray-500'}`}>
                  {m.status === 'em_andamento' ? '● ao vivo' : m.status === 'encerrada' ? 'encerrada' : ''}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </Card>
    </>
  );
}

function Times({ d, isAdmin }) {
  const t = d.tournament;
  const taxa = Number(t.fee) > 0;
  const pagou = Object.fromEntries(d.registrations.map((r) => [r.player_id, r.fee_paid]));
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {d.teams.map((tm) => (
        <Card key={tm.id} title={`${tm.name}${tm.group_label ? ` · Grupo ${tm.group_label}` : ''}`}>
          <ul className="text-sm flex flex-col gap-0.5">
            {tm.players.map((p) => (
              <li key={p.player_id} className="flex justify-between gap-2">
                <span className={p.player_id === tm.captain_id ? 'text-gulag-cyan font-semibold' : 'text-gray-200'}>
                  {p.is_goalkeeper ? '🧤 ' : ''}{p.name}{p.player_id === tm.captain_id ? ' (C)' : ''}
                </span>
                {isAdmin && taxa && !p.is_goalkeeper && (
                  <span className={`text-xs ${pagou[p.player_id] ? 'text-emerald-400' : 'text-red-400'}`}>
                    {pagou[p.player_id] ? 'pago' : 'taxa pendente'}
                  </span>
                )}
              </li>
            ))}
          </ul>
        </Card>
      ))}
    </div>
  );
}

function Ranking({ titulo, itens, valor, rotulo }) {
  const lista = itens.filter((x) => valor(x) > 0).sort((a, b) => valor(b) - valor(a)).slice(0, 5);
  return (
    <div>
      <p className="text-xs text-gray-400 mb-1">{titulo}</p>
      {lista.length === 0 ? <p className="text-xs text-gray-600">—</p> : (
        <ol className="text-sm flex flex-col gap-0.5">
          {lista.map((x, i) => (
            <li key={`${x.player_id}-${x.team_id}`} className="flex justify-between gap-2">
              <span className="text-gray-200 truncate">{i + 1}. {x.name} <span className="text-xs text-gray-500">{x.team_name}</span></span>
              <span className="font-bold text-gray-100">{valor(x)}{rotulo}</span>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}

function Estatisticas({ d }) {
  const goleiros = d.goleiros.filter((g) => g.jogos > 0).sort((a, b) => a.media - b.media);
  return (
    <Card title="Estatísticas do torneio">
      <p className="text-xs text-gray-500 mb-3">Só deste torneio — não entram nas estatísticas da pelada.</p>
      <div className="grid gap-4 sm:grid-cols-2">
        <Ranking titulo="Artilharia" itens={d.stats} valor={(x) => x.goals} rotulo=" gols" />
        <Ranking titulo="Assistências" itens={d.stats} valor={(x) => x.assists} rotulo="" />
        <Ranking titulo="Cartões (amarelo + azul + vermelho)" itens={d.stats} valor={(x) => x.yellow_cards + x.blue_cards + x.red_cards} rotulo="" />
        <div>
          <p className="text-xs text-gray-400 mb-1">Goleiros (menos gols sofridos por jogo)</p>
          {goleiros.length === 0 ? <p className="text-xs text-gray-600">—</p> : (
            <ol className="text-sm flex flex-col gap-0.5">
              {goleiros.map((g, i) => (
                <li key={g.player_id} className="flex justify-between gap-2">
                  <span className="text-gray-200 truncate">{i + 1}. {g.name} <span className="text-xs text-gray-500">{g.team_name}</span></span>
                  <span className="text-gray-100">{g.sofridos} em {g.jogos} ({g.media.toFixed(1)}/jogo)</span>
                </li>
              ))}
            </ol>
          )}
        </div>
      </div>
    </Card>
  );
}

function Taxas({ d, acao }) {
  const t = d.tournament;
  const convocados = d.teams.flatMap((tm) => tm.players.filter((p) => !p.is_goalkeeper).map((p) => ({ ...p, team_name: tm.name })));
  const reg = Object.fromEntries(d.registrations.map((r) => [r.player_id, r]));
  const pagos = convocados.filter((p) => reg[p.player_id]?.fee_paid);
  const vespera = new Date(`${t.event_date}T12:00:00`);
  vespera.setDate(vespera.getDate() - 1);

  return (
    <Card title={`Taxas (${pagos.length}/${convocados.length} pagas)`}>
      <p className="text-xs text-gray-500 mb-1">
        {reais(t.fee)} por jogador de linha convocado (goleiro isento). Recebido: <strong className="text-emerald-400">{reais(pagos.length * t.fee)}</strong>
        {' · '}Falta: <strong className="text-red-400">{reais((convocados.length - pagos.length) * t.fee)}</strong>
      </p>
      <p className="text-xs text-amber-300 mb-3">
        Quem não pagar até {vespera.toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: '2-digit' })} não joga.
        Controle separado do financeiro da pelada.
      </p>
      <ul className="flex flex-col">
        {convocados.map((p) => {
          const pago = reg[p.player_id]?.fee_paid;
          return (
            <li key={p.player_id} className="flex items-center gap-2 py-1.5 border-b border-gulag-border last:border-0 text-sm">
              <span className="flex-1 text-gray-200 truncate">{p.name} <span className="text-xs text-gray-500">{p.team_name}</span></span>
              <Button
                variant={pago ? 'secondary' : 'primary'}
                onClick={() => acao(() => api.patch(`/tournaments/${t.id}/registrations/${p.player_id}/fee`, { paid: !pago }))}
              >
                {pago ? '✓ Pago (desfazer)' : 'Marcar pago'}
              </Button>
            </li>
          );
        })}
      </ul>
    </Card>
  );
}

function Premiacao({ d, isAdmin, acao }) {
  const t = d.tournament;
  const nomeTime = (id) => d.teams.find((tm) => tm.id === id)?.name;
  const nomeJog = (id) => d.registrations.find((r) => r.player_id === id)?.name;
  const artilheiro = useMemo(() => [...d.stats].sort((a, b) => b.goals - a.goals)[0], [d.stats]);
  const garcom = useMemo(() => [...d.stats].sort((a, b) => b.assists - a.assists)[0], [d.stats]);
  const sugestaoGoleiro = [...d.goleiros].filter((g) => g.jogos > 0).sort((a, b) => a.media - b.media)[0];
  const sugestaoCraque = [...d.stats].sort((a, b) => (b.goals + b.assists) - (a.goals + a.assists))[0];

  const [gk, setGk] = useState(t.best_gk_player_id || '');
  const [mvp, setMvp] = useState(t.mvp_player_id || '');

  const premio = (rotulo, valor) => (
    <div className="rounded border border-gulag-border bg-gulag-surface-2 p-3">
      <p className="text-xs text-gray-400">{rotulo}</p>
      <p className="text-lg font-bold text-gray-100">{valor || '—'}</p>
    </div>
  );

  return (
    <Card title="🏆 Premiação">
      <div className="grid gap-2 sm:grid-cols-3 mb-3">
        {premio('Campeão', nomeTime(t.champion_team_id))}
        {premio('Vice', nomeTime(t.runner_up_team_id))}
        {premio('Artilheiro', artilheiro?.goals ? `${artilheiro.name} (${artilheiro.goals})` : null)}
        {premio('Garçom', garcom?.assists ? `${garcom.name} (${garcom.assists})` : null)}
        {premio('Melhor goleiro', nomeJog(t.best_gk_player_id))}
        {premio('Craque', nomeJog(t.mvp_player_id))}
      </div>

      {isAdmin && (
        <div className="grid gap-3 sm:grid-cols-2 border-t border-gulag-border pt-3">
          <Field label={`Melhor goleiro${sugestaoGoleiro ? ` (sugestão: ${sugestaoGoleiro.name})` : ''}`}>
            <select value={gk} onChange={(e) => setGk(e.target.value)} className={inputClass}>
              <option value="">—</option>
              {d.goleiros.map((g) => <option key={g.player_id} value={g.player_id}>{g.name}</option>)}
            </select>
          </Field>
          <Field label={`Craque${sugestaoCraque ? ` (sugestão: ${sugestaoCraque.name})` : ''}`}>
            <select value={mvp} onChange={(e) => setMvp(e.target.value)} className={inputClass}>
              <option value="">—</option>
              {d.teams.flatMap((tm) => tm.players).filter((p) => !p.is_goalkeeper)
                .map((p) => <option key={p.player_id} value={p.player_id}>{p.name}</option>)}
            </select>
          </Field>
          <div className="sm:col-span-2">
            <Button onClick={() => acao(() => api.put(`/tournaments/${t.id}/awards`, {
              best_gk_player_id: gk || null, mvp_player_id: mvp || null,
            }), 'Premiação salva')}
            >
              Salvar premiação
            </Button>
          </div>
        </div>
      )}
    </Card>
  );
}
