import { useEffect, useMemo, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import toast from 'react-hot-toast';
import api from '../../api/client';
import AtaList from '../../components/AtaList';
import TeamDraw from '../../components/TeamDraw';
import { setUnsaved, confirmLeave } from '../../components/unsavedGuard';
import { useAuth } from '../../context/AuthContext';
import {
  inputClass, Button, Card, ScrollArea, EmptyState, bestTeam, matchDateLabel,
} from '../../components/ui';

const STATUS_LABELS = { open: 'Lista aberta', closed: 'Lista fechada', played: 'Realizada' };
const numberInput = 'w-14 bg-gulag-surface-2 border border-gulag-border text-gray-100 rounded px-2 py-1 text-sm text-center';

export default function AdminMatchdayDetailPage() {
  const { id } = useParams();
  const { player } = useAuth();
  const [matchday, setMatchday] = useState(null);
  const [confirmations, setConfirmations] = useState([]);
  const [teams, setTeams] = useState([]);
  const [numberOfTeams, setNumberOfTeams] = useState(4);
  const [playerStats, setPlayerStats] = useState({});
  const [goalkeeperStats, setGoalkeeperStats] = useState({});
  const [teamResults, setTeamResults] = useState({});
  const [saving, setSaving] = useState(false);
  const [allPlayers, setAllPlayers] = useState([]);
  const [playerToAdd, setPlayerToAdd] = useState('');
  const [newPlayer, setNewPlayer] = useState({ first_name: '', last_name: '', player_type: 'diarista' });
  const [creating, setCreating] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [notifying, setNotifying] = useState(null); // null | 'test' | 'all'

  // Limpa o aviso ao sair da tela
  useEffect(() => () => setUnsaved(false), []);

  function load() {
    api.get(`/matchdays/${id}`).then(({ data }) => setMatchday(data));
    api.get(`/matchdays/${id}/confirmations`).then(({ data }) => setConfirmations(data));
    api.get(`/matchdays/${id}/teams`).then(({ data }) => setTeams(data));
    api.get('/players').then(({ data }) => setAllPlayers(data));
    api.get(`/matchdays/${id}/summary`).then(({ data }) => {
      setPlayerStats(Object.fromEntries(data.playerStats.map((s) => [s.player_id, s])));
      setGoalkeeperStats(Object.fromEntries(data.goalkeeperStats.map((s) => [s.player_id, s])));
    });
  }

  useEffect(load, [id]);

  const playerTeamId = useMemo(() => {
    const map = {};
    for (const t of teams) {
      for (const p of t.players) map[p.id] = t.id;
    }
    return map;
  }, [teams]);

  const confirmed = confirmations.filter((c) => c.status === 'confirmed');
  const linePlayers = confirmed.filter((c) => c.player_type !== 'goleiro');
  // Goleiros nao costumam confirmar sozinhos: entram na sumula a menos que tenham recusado
  const goalkeepers = confirmations.filter(
    (c) => c.player_type === 'goleiro' && c.status !== 'declined'
  );
  const inAta = new Set(confirmations.map((c) => c.player_id));
  // Qualquer jogador fora da ata pode ser incluido — goleiro que apareceu de
  // ultima hora, diarista, ou mensalista que ficou de fora numa ata retroativa
  const availablePlayers = allPlayers.filter((p) => !inAta.has(p.id));
  // Confirmados que ainda nao estao em nenhum time (usado na ata retroativa)
  const unassigned = linePlayers
    .filter((c) => !playerTeamId[c.player_id])
    .map((c) => ({ id: c.player_id, name: c.name, stars: c.stars }));
  // O admin tambem joga: precisa confirmar a propria presenca como qualquer mensalista
  const mine = confirmations.find((c) => c.player_id === player?.id);
  // Considera o que esta na tela, para o destaque aparecer ja ao digitar
  const champion = bestTeam(teams.map((t) => ({ ...t, ...teamResults[t.id] })));

  async function toggleConfirmation(entry) {
    const status = entry.status === 'confirmed' ? 'pending' : 'confirmed';
    try {
      await api.patch(`/matchdays/${id}/confirmations/${entry.player_id}`, { status });
      load();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Erro ao alterar presença');
    }
  }

  async function removeFromAta(entry) {
    if (!window.confirm(`Retirar ${entry.name} da lista?`)) return;
    try {
      await api.delete(`/matchdays/${id}/confirmations/${entry.player_id}`);
      toast.success(`${entry.name} saiu da lista`);
      load();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Erro ao retirar da lista');
    }
  }

  async function addPlayer() {
    try {
      await api.patch(`/matchdays/${id}/confirmations/${playerToAdd}`, { status: 'confirmed' });
      setPlayerToAdd('');
      toast.success('Jogador incluído na ata');
      load();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Erro ao incluir jogador');
    }
  }

  // Goleiro avulso (ou diarista) que jogou e nunca foi cadastrado: cria o
  // cadastro com o nome e ja marca presenca nesta pelada.
  async function createAndAdd() {
    const firstName = newPlayer.first_name.trim();
    if (firstName.length < 2) return toast.error('Informe o nome de quem jogou');
    setCreating(true);
    try {
      const { data } = await api.post('/players', {
        first_name: firstName,
        last_name: newPlayer.last_name.trim(),
        player_type: newPlayer.player_type,
      });
      await api.patch(`/matchdays/${id}/confirmations/${data.id}`, { status: 'confirmed' });
      setNewPlayer({ first_name: '', last_name: '', player_type: newPlayer.player_type });
      toast.success(`${data.name} cadastrado e incluído na ata`);
      load();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Erro ao cadastrar jogador');
    } finally {
      setCreating(false);
    }
  }

  // Reenvio manual do convite: util quando alguem entrou na lista depois
  // ou quando o servidor de e-mail estava fora no lancamento da ATA.
  // O teste manda so para o proprio admin, para conferir antes do disparo geral.
  async function notifyByEmail(test) {
    if (!test && !window.confirm(
      'Enviar o aviso de confirmação por e-mail para todo o elenco (mensalistas, goleiros e diaristas)?'
    )) return;

    setNotifying(test ? 'test' : 'all');
    try {
      const { data } = await api.post(`/matchdays/${id}/notify`, { test: !!test });
      if (test) {
        // O servidor tenta um a um e nao derruba a requisicao quando falha:
        // sem olhar o "sent", um envio que nao saiu apareceria como sucesso
        if (data.sent > 0) {
          toast.success(`Teste enviado só para você. No envio real iriam ${data.elenco} e-mail(s).`);
        } else {
          toast.error(data.lastError || 'O servidor não conseguiu enviar. Veja o log do Railway.');
        }
      } else if (data.recipients === 0) {
        toast('Ninguém tem e-mail cadastrado.');
      } else {
        toast.success(
          `Aviso enviado para ${data.sent} de ${data.recipients} jogador(es)`
          + (data.failed ? ` · ${data.failed} falha(s)` : '')
        );
      }
    } catch (err) {
      toast.error(err.response?.data?.error || 'Erro ao enviar os avisos');
    } finally {
      setNotifying(null);
    }
  }

  async function closeList() {
    try {
      const { data } = await api.post(`/matchdays/${id}/close`);
      toast.success(
        `Lista fechada: ${data.mensalistas} mensalistas, ${data.diaristasConfirmados} diaristas` +
        (data.fila ? ` · ${data.fila} na espera` : '')
      );
      load();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Erro ao fechar lista');
    }
  }

  async function drawTeams() {
    try {
      await api.post(`/matchdays/${id}/draw-teams`, { numberOfTeams: Number(numberOfTeams) });
      toast.success('Times sorteados');
      load();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Erro ao sortear times');
    }
  }

  // Move na tela na hora e so depois confirma no servidor, para o arrasto nao piscar
  async function movePlayer(playerId, teamId) {
    const previous = teams;
    let moved = null;
    const optimistic = teams.map((t) => {
      const found = t.players.find((p) => p.id === playerId);
      if (found) moved = found;
      return { ...t, players: t.players.filter((p) => p.id !== playerId) };
    });
    // Pode vir do grupo "sem time", que nao esta em nenhum time ainda
    if (!moved) {
      const fromPool = confirmations.find((c) => c.player_id === playerId);
      if (!fromPool) return;
      moved = { id: playerId, name: fromPool.name, stars: fromPool.stars };
    }
    setTeams(optimistic.map((t) => (
      t.id === teamId ? { ...t, players: [...t.players, moved] } : t
    )));

    try {
      await api.patch(`/matchdays/${id}/teams/assign`, { player_id: playerId, team_id: Number(teamId) });
    } catch (err) {
      setTeams(previous);
      toast.error(err.response?.data?.error || 'Erro ao mover jogador');
    }
  }

  // Qualquer edicao da sumula liga o aviso de alteracoes nao salvas
  function markDirty() {
    setDirty(true);
    setUnsaved(true, 'A súmula tem alterações não salvas. Sair agora vai descartar tudo.');
  }

  function setPlayerField(playerId, field, value) {
    markDirty();
    setPlayerStats((prev) => ({ ...prev, [playerId]: { ...prev[playerId], [field]: value } }));
  }

  function setGoalkeeperField(playerId, field, value) {
    markDirty();
    setGoalkeeperStats((prev) => ({ ...prev, [playerId]: { ...prev[playerId], [field]: value } }));
  }

  function setTeamResult(teamId, field, value) {
    markDirty();
    setTeamResults((prev) => ({ ...prev, [teamId]: { ...prev[teamId], [field]: value } }));
  }

  async function submitSummary() {
    setSaving(true);
    try {
      const payload = {
        playerStats: linePlayers.map((c) => {
          const s = playerStats[c.player_id] || {};
          return {
            player_id: c.player_id,
            team_id: playerTeamId[c.player_id] || null,
            goals: Number(s.goals) || 0,
            assists: Number(s.assists) || 0,
            yellow_cards: Number(s.yellow_cards) || 0,
            blue_cards: Number(s.blue_cards) || 0,
            red_cards: Number(s.red_cards) || 0,
            absent: !!s.absent,
          };
        }),
        goalkeeperStats: goalkeepers.map((c) => {
          const s = goalkeeperStats[c.player_id] || {};
          return {
            player_id: c.player_id,
            wins: Number(s.wins) || 0,
            draws: Number(s.draws) || 0,
            losses: Number(s.losses) || 0,
            penalties_saved: Number(s.penalties_saved) || 0,
            assists: Number(s.assists) || 0,
            goals: Number(s.goals) || 0,
            yellow_cards: Number(s.yellow_cards) || 0,
            red_cards: Number(s.red_cards) || 0,
          };
        }),
        teamResults: teams.map((t) => {
          const r = teamResults[t.id] || {};
          return {
            team_id: t.id,
            wins: Number(r.wins ?? t.wins) || 0,
            draws: Number(r.draws ?? t.draws) || 0,
            losses: Number(r.losses ?? t.losses) || 0,
          };
        }),
      };
      await api.post(`/matchdays/${id}/summary`, payload);
      toast.success('Súmula salva. Diárias e multas lançadas automaticamente.');
      setDirty(false);
      setUnsaved(false);
      load();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Erro ao lançar súmula');
    } finally {
      setSaving(false);
    }
  }

  if (!matchday) return <p className="text-gray-400">Carregando...</p>;

  return (
    <div className="flex flex-col gap-4">
      <Link
        to="/admin/matchdays"
        onClick={(e) => { if (!confirmLeave()) e.preventDefault(); }}
        className="text-sm text-gulag-cyan underline"
      >
        ← voltar
      </Link>

      {dirty && (
        <div className="rounded border border-amber-700/60 bg-amber-500/10 p-3">
          <p className="text-sm text-amber-200">
            Você tem alterações não salvas na súmula. Se sair desta página agora, elas serão perdidas.
          </p>
        </div>
      )}

      <Card>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="font-medium text-gray-100">
              {matchDateLabel(matchday.match_date)}
            </p>
            <p className="text-xs text-gray-500">
              {confirmed.length} confirmados · {STATUS_LABELS[matchday.status] || matchday.status}
            </p>
          </div>
          <div className="flex gap-2 flex-wrap">
            {mine && (
              <Button
                variant={mine.status === 'confirmed' ? 'secondary' : 'primary'}
                onClick={() => toggleConfirmation(mine)}
              >
                {mine.status === 'confirmed' ? 'Cancelar minha presença' : 'Confirmar minha presença'}
              </Button>
            )}
            {matchday.status === 'open' && (
              <>
                <Button
                  variant="secondary"
                  onClick={() => notifyByEmail(true)}
                  disabled={!!notifying}
                  title="Manda o convite só para o seu e-mail, para conferir antes"
                >
                  {notifying === 'test' ? 'Enviando...' : '✉ Testar em mim'}
                </Button>
                <Button
                  variant="secondary"
                  onClick={() => notifyByEmail(false)}
                  disabled={!!notifying}
                >
                  {notifying === 'all' ? 'Enviando...' : '✉ Avisar todos'}
                </Button>
                <Button variant="secondary" onClick={closeList}>Fechar lista</Button>
              </>
            )}
            {teams.length > 0 && (
              <Link
                to={`/admin/matchdays/${id}/ao-vivo`}
                onClick={(e) => { if (!confirmLeave()) e.preventDefault(); }}
              >
                <Button>⚡ Súmula ao vivo</Button>
              </Link>
            )}
          </div>
        </div>
      </Card>

      <p className="text-xs text-gray-500 -mb-2">
        Toque em um nome para marcar ou desmarcar a presença.
      </p>
      <AtaList
        confirmations={confirmations}
        onToggle={toggleConfirmation}
        onRemove={removeFromAta}
        canEdit
        isAdmin
        currentPlayerId={player?.id}
      />

      <Card title="Incluir na ata">
        <div className="flex gap-2 flex-wrap">
          <select
            value={playerToAdd}
            onChange={(e) => setPlayerToAdd(e.target.value)}
            className={`${inputClass} flex-1 min-w-[160px]`}
          >
            <option value="">Selecione um jogador...</option>
            {availablePlayers.map((p) => (
              <option key={p.id} value={p.id}>{p.name} ({p.player_type})</option>
            ))}
          </select>
          <Button variant="secondary" onClick={addPlayer} disabled={!playerToAdd}>Incluir</Button>
        </div>

        <div className="border-t border-gulag-border mt-3 pt-3">
          <p className="text-sm text-gray-400">Jogou e não está cadastrado?</p>
          <p className="text-xs text-gray-500 mb-2">
            Cadastra na hora e já entra como presente nesta pelada. Telefone e senha ficam para
            depois, em Jogadores.
          </p>
          <div className="grid gap-2 sm:grid-cols-2">
            <input
              value={newPlayer.first_name}
              onChange={(e) => setNewPlayer((p) => ({ ...p, first_name: e.target.value }))}
              placeholder="Nome"
              className={inputClass}
            />
            <input
              value={newPlayer.last_name}
              onChange={(e) => setNewPlayer((p) => ({ ...p, last_name: e.target.value }))}
              placeholder="Sobrenome (opcional)"
              className={inputClass}
            />
            <select
              value={newPlayer.player_type}
              onChange={(e) => setNewPlayer((p) => ({ ...p, player_type: e.target.value }))}
              className={inputClass}
            >
              <option value="diarista">Diarista</option>
              <option value="goleiro">Goleiro</option>
            </select>
            <Button variant="secondary" onClick={createAndAdd} disabled={creating}>
              {creating ? 'Cadastrando...' : '+ Cadastrar e incluir'}
            </Button>
          </div>
        </div>
      </Card>

      <Card
        title="Sorteio de times"
        action={
          <div className="flex gap-2 items-center">
            <input
              type="number" min="2" value={numberOfTeams}
              onChange={(e) => setNumberOfTeams(e.target.value)}
              className={numberInput}
            />
            <Button variant="secondary" onClick={drawTeams}>Sortear</Button>
          </div>
        }
      >
        <TeamDraw teams={teams} onMovePlayer={movePlayer} unassigned={unassigned} />
      </Card>

      <h2 className="text-lg font-semibold text-gray-100 mt-2">Súmula</h2>
      <p className="text-xs text-gray-500 -mt-3">
        Gols, assistências e cartões lançados na tela ao vivo já vêm preenchidos aqui.
        Complete as vitórias/empates/derrotas de cada time e salve para gerar diárias e multas.
      </p>

      {teams.length === 0 ? (
        <Card><EmptyState>Sorteie os times para lançar a súmula.</EmptyState></Card>
      ) : (
        teams.map((team) => {
          const results = teamResults[team.id] || {};
          const teamPlayers = linePlayers.filter((c) => playerTeamId[c.player_id] === team.id);
          const isBest = champion?.id === team.id;

          return (
            <Card
              key={team.id}
              className={isBest ? 'border-gulag-cyan' : ''}
              title={
                <span className="flex items-center gap-2">
                  {team.name}
                  {isBest && (
                    <span className="text-[10px] uppercase tracking-wide bg-gulag-cyan text-black rounded px-1.5 py-0.5">
                      🏆 melhor time do dia
                    </span>
                  )}
                </span>
              }
            >
              <div className="flex gap-2 mb-3">
                {[['wins', 'Vitórias'], ['draws', 'Empates'], ['losses', 'Derrotas']].map(([field, label]) => (
                  <label key={field} className="flex-1 text-center">
                    <span className="block text-[11px] uppercase text-gray-500 mb-1">{label}</span>
                    <input
                      type="number" min="0" inputMode="numeric"
                      className={`${numberInput} w-full`}
                      value={results[field] ?? team[field] ?? ''}
                      onChange={(e) => setTeamResult(team.id, field, e.target.value)}
                    />
                  </label>
                ))}
              </div>

              <ScrollArea>
                {/* Coluna fixa para os times ficarem alinhados entre si */}
                <table className="w-full table-fixed text-sm min-w-[560px]">
                  <thead className="text-gray-400 text-left">
                    <tr>
                      <th className="pb-2">Nome</th>
                      <th className="w-16">Gols</th>
                      <th className="w-16">Ass.</th>
                      <th className="w-20">Amarelo</th>
                      <th className="w-16">Azul</th>
                      <th className="w-20">Vermelho</th>
                      <th className="w-16">Faltou</th>
                    </tr>
                  </thead>
                  <tbody>
                    {teamPlayers.map((c) => {
                      const s = playerStats[c.player_id] || {};
                      return (
                        <tr key={c.player_id} className="text-gray-200 border-t border-gulag-border">
                          <td className="py-1 pr-2 truncate" title={c.name}>{c.name}</td>
                          {['goals', 'assists', 'yellow_cards', 'blue_cards', 'red_cards'].map((field) => (
                            <td key={field} className="py-1">
                              <input
                                type="number" min="0" inputMode="numeric" className={numberInput}
                                value={s[field] ?? ''}
                                onChange={(e) => setPlayerField(c.player_id, field, e.target.value)}
                              />
                            </td>
                          ))}
                          <td>
                            <input
                              type="checkbox" className="w-5 h-5"
                              checked={!!s.absent}
                              onChange={(e) => setPlayerField(c.player_id, 'absent', e.target.checked)}
                            />
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </ScrollArea>
              {teamPlayers.length === 0 && <EmptyState>Nenhum jogador neste time.</EmptyState>}
            </Card>
          );
        })
      )}

      {/* Goleiros aparecem depois dos times, como na ata em papel */}
      {goalkeepers.length > 0 && (
        <Card title="Goleiros">
          <ScrollArea>
            <table className="w-full table-fixed text-sm min-w-[660px]">
              <thead className="text-gray-400 text-left">
                <tr>
                  <th className="pb-2">Nome</th>
                  <th className="w-16">Vit.</th>
                  <th className="w-16">Der.</th>
                  <th className="w-16">Emp.</th>
                  <th className="w-16">Gols</th>
                  <th className="w-16">Ass.</th>
                  <th className="w-20">Pên. def.</th>
                  <th className="w-20">Amarelo</th>
                  <th className="w-20">Vermelho</th>
                </tr>
              </thead>
              <tbody>
                {goalkeepers.map((c) => {
                  const s = goalkeeperStats[c.player_id] || {};
                  return (
                    <tr key={c.player_id} className="text-gray-200 border-t border-gulag-border">
                      <td className="py-1 pr-2 truncate" title={c.name}>{c.name}</td>
                      {['wins', 'losses', 'draws', 'goals', 'assists', 'penalties_saved', 'yellow_cards', 'red_cards'].map((field) => (
                        <td key={field} className="py-1">
                          <input
                            type="number" min="0" inputMode="numeric" className={numberInput}
                            value={s[field] ?? ''}
                            onChange={(e) => setGoalkeeperField(c.player_id, field, e.target.value)}
                          />
                        </td>
                      ))}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </ScrollArea>
        </Card>
      )}

      {teams.length > 0 && (
        <Button onClick={submitSummary} disabled={saving} className="w-full py-3 text-base">
          {saving ? 'Salvando...' : 'Salvar súmula'}
        </Button>
      )}
    </div>
  );
}
