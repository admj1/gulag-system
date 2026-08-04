import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { Link, useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import api from '../../api/client';
import MatchdayAccordion from '../../components/MatchdayAccordion';
import Modal from '../../components/Modal';
import PlayerPicker from '../../components/PlayerPicker';
import { inputClass, Button, Card, Field, EmptyState, matchDateLabel } from '../../components/ui';

const STATUS_LABELS = { open: 'Lista aberta', closed: 'Lista fechada', played: 'Realizada' };

export default function AdminMatchdaysPage() {
  const [matchdays, setMatchdays] = useState([]);
  const [seasons, setSeasons] = useState([]);
  const [showAta, setShowAta] = useState(false);
  const [showRetro, setShowRetro] = useState(false);
  const [showSeason, setShowSeason] = useState(false);
  const [editingSeason, setEditingSeason] = useState(null);

  function load() {
    api.get('/matchdays').then(({ data }) => setMatchdays(data));
    api.get('/seasons').then(({ data }) => setSeasons(data));
  }

  useEffect(load, []);

  const openMatchday = matchdays.find((m) => m.status === 'open');
  const previous = matchdays.filter((m) => m.status !== 'open');

  async function removeSeason(season) {
    if (!window.confirm(`Apagar a temporada "${season.name}"?`)) return;
    try {
      await api.delete(`/seasons/${season.id}`);
      toast.success('Temporada apagada');
      load();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Erro ao apagar temporada');
    }
  }

  async function removeMatchday(matchday) {
    if (!window.confirm('Apagar esta pelada e suas cobranças?')) return;
    try {
      await api.delete(`/matchdays/${matchday.id}`);
      toast.success('Pelada apagada');
      load();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Erro ao apagar pelada');
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <Card
        title="Peladas"
        action={
          <div className="flex gap-2 flex-wrap justify-end">
            <Button onClick={() => setShowAta(true)}>+ Lançar ATA</Button>
            <Button variant="secondary" onClick={() => setShowRetro(true)}>
              + ATA Retroativa
            </Button>
          </div>
        }
      >
        {matchdays.length === 0 ? (
          <EmptyState>Nenhuma pelada lançada.</EmptyState>
        ) : (
          <div className="flex flex-col gap-3">
            {/* A pelada com lista aberta e a que esta em uso: fica fora do agrupamento */}
            {openMatchday && (
              <div className="border border-gulag-cyan/50 rounded p-3 flex flex-wrap items-center justify-between gap-2">
                <div>
                  <p className="text-xs uppercase tracking-wide text-gulag-cyan">Lista aberta</p>
                  <p className="text-gray-100">{matchDateLabel(openMatchday.match_date)}</p>
                </div>
                <MatchdayActions matchday={openMatchday} onRemove={removeMatchday} />
              </div>
            )}

            {previous.length > 0 && (
              <MatchdayAccordion
                matchdays={previous}
                renderItem={(m) => (
                  <div className="flex flex-wrap items-center justify-between gap-2 px-2 py-2">
                    <div>
                      <p className="text-sm text-gray-200">{matchDateLabel(m.match_date)}</p>
                      <p className="text-xs text-gray-500">{STATUS_LABELS[m.status] || m.status}</p>
                    </div>
                    <MatchdayActions matchday={m} onRemove={removeMatchday} />
                  </div>
                )}
              />
            )}
          </div>
        )}
      </Card>

      <Card title="Temporadas" action={<Button variant="secondary" onClick={() => setShowSeason(true)}>+ Nova temporada</Button>}>
        {seasons.length === 0 ? (
          <EmptyState>Nenhuma temporada cadastrada.</EmptyState>
        ) : (
          <ul className="flex flex-col gap-2">
            {seasons.map((s) => (
              <li key={s.id} className="border border-gulag-border rounded p-3 flex flex-wrap items-center justify-between gap-2">
                <div>
                  <p className="text-gray-100">{s.name}</p>
                  <p className="text-xs text-gray-500">
                    {s.year} · início {new Date(`${s.start_date}T12:00:00`).toLocaleDateString('pt-BR')}
                  </p>
                </div>
                <div className="flex gap-2">
                  <Button variant="secondary" onClick={() => setEditingSeason(s)}>Editar</Button>
                  <Button variant="danger" onClick={() => removeSeason(s)}>Apagar</Button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>

      {showAta && <AtaModal onClose={() => setShowAta(false)} onCreated={load} />}
      {showRetro && <RetroactiveAtaModal onClose={() => setShowRetro(false)} onCreated={load} />}
      {(showSeason || editingSeason) && (
        <SeasonModal
          season={editingSeason}
          onClose={() => { setShowSeason(false); setEditingSeason(null); }}
          onSaved={() => { setShowSeason(false); setEditingSeason(null); load(); }}
        />
      )}
    </div>
  );
}

function MatchdayActions({ matchday, onRemove }) {
  return (
    <div className="flex gap-2 shrink-0">
      <Link to={`/admin/matchdays/${matchday.id}`}>
        <Button variant="secondary">Gerenciar</Button>
      </Link>
      <Button variant="danger" onClick={() => onRemove(matchday)}>Apagar</Button>
    </div>
  );
}

// Lancar ATA: basta a data. Todos os mensalistas e goleiros ja entram relacionados
// (pendentes) e vao ficando verdes conforme confirmam. Diaristas entram por ordem.
function AtaModal({ onClose, onCreated }) {
  const navigate = useNavigate();
  const [matchDate, setMatchDate] = useState(new Date().toISOString().slice(0, 10));
  const [roster, setRoster] = useState([]);
  const [diaristas, setDiaristas] = useState([]);
  const [selectedDiaristas, setSelectedDiaristas] = useState([]);
  const [notify, setNotify] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    api.get('/matchdays/roster-preview').then(({ data }) => setRoster(data));
    api.get('/players', { params: { type: 'diarista' } }).then(({ data }) => setDiaristas(data));
  }, []);

  async function confirm() {
    setSaving(true);
    try {
      const { data } = await api.post('/matchdays/from-roster', {
        match_date: matchDate,
        diarista_ids: selectedDiaristas,
        notify,
      });
      const aviso = data.notified;
      if (!notify) toast.success('ATA lançada');
      else if (!aviso?.configured) {
        toast.success('ATA lançada. O envio de e-mail ainda não está configurado no servidor.');
      } else if (aviso.recipients === 0) {
        toast.success('ATA lançada. Ninguém da lista tem e-mail cadastrado.');
      } else {
        toast.success(`ATA lançada. Avisando ${aviso.recipients} jogador(es) por e-mail.`);
      }
      onCreated();
      onClose();
      navigate(`/admin/matchdays/${data.id}`);
    } catch (err) {
      toast.error(err.response?.data?.error || 'Erro ao lançar ATA');
    } finally {
      setSaving(false);
    }
  }

  const mensalistas = roster.filter((p) => p.player_type === 'mensalista');
  const goleiros = roster.filter((p) => p.player_type === 'goleiro');

  return (
    <Modal title="Lançar ATA" onClose={onClose}>
      <div className="flex flex-col gap-4">
        <Field label="Data da pelada">
          <input type="date" value={matchDate} onChange={(e) => setMatchDate(e.target.value)} className={inputClass} />
        </Field>

        <p className="text-xs text-gray-500">
          Os {mensalistas.length} mensalistas
          {goleiros.length > 0
            ? ` e ${goleiros.length} goleiro(s) fixo(s) já entram`
            : ' já entram'} na ata. Cada um fica verde ao confirmar; quem não confirmar até o
          fechamento libera a vaga para os diaristas, por ordem de inscrição. Os demais goleiros
          entram colocando o nome na lista, como avulsos.
        </p>

        <div>
          <h3 className="text-sm font-semibold text-gray-300 mb-1">Mensalistas</h3>
          <ol className="grid gap-0.5 sm:grid-cols-2 text-sm text-gray-400">
            {mensalistas.map((p) => (
              <li key={p.id}>
                <span className="text-gray-600 mr-1">{p.mensalista_number}</span> {p.name}
              </li>
            ))}
          </ol>
        </div>

        {goleiros.length > 0 && (
          <div>
            <h3 className="text-sm font-semibold text-gray-300 mb-1">Goleiros</h3>
            <ul className="grid gap-0.5 sm:grid-cols-2 text-sm text-gray-400">
              {goleiros.map((p) => <li key={p.id}>{p.name}</li>)}
            </ul>
          </div>
        )}

        <PlayerPicker
          players={diaristas}
          selected={selectedDiaristas}
          onChange={setSelectedDiaristas}
          label="Incluir diaristas (opcional)"
          ordered
          emptyLabel="Nenhum diarista incluído — eles também podem se inscrever sozinhos."
        />

        <label className="flex items-start gap-2 text-sm text-gray-300">
          <input
            type="checkbox"
            checked={notify}
            onChange={(e) => setNotify(e.target.checked)}
            className="w-4 h-4 mt-0.5"
          />
          <span>
            Avisar por e-mail
            <span className="block text-xs text-gray-500">
              Manda o convite para todo o elenco com e-mail cadastrado — mensalistas, goleiros e
              diaristas — com o botão de confirmar presença.
            </span>
          </span>
        </label>

        <div className="flex gap-2 justify-end sticky bottom-0 bg-gulag-surface pt-2">
          <Button variant="secondary" onClick={onClose}>Cancelar</Button>
          <Button onClick={confirm} disabled={saving}>
            {saving ? 'Lançando...' : 'Confirmar'}
          </Button>
        </div>
      </div>
    </Modal>
  );
}

// ATA retroativa: lancamento manual a partir do papel. Cria a pelada ja fechada
// com quem jogou e os times vazios, para o admin montar e preencher a sumula.
function RetroactiveAtaModal({ onClose, onCreated }) {
  const navigate = useNavigate();
  const [matchDate, setMatchDate] = useState(new Date().toISOString().slice(0, 10));
  const [numberOfTeams, setNumberOfTeams] = useState(4);
  const [players, setPlayers] = useState([]);
  const [selected, setSelected] = useState([]);
  const [saving, setSaving] = useState(false);
  const [newPlayer, setNewPlayer] = useState({ first_name: '', last_name: '', player_type: 'diarista' });
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    api.get('/players').then(({ data }) => setPlayers(data));
  }, []);

  // Ata antiga costuma ter goleiro avulso que nunca foi cadastrado: cria na hora
  // e ja marca como presente, sem sair do modal.
  async function createAndSelect() {
    const firstName = newPlayer.first_name.trim();
    if (firstName.length < 2) return toast.error('Informe o nome de quem jogou');
    setCreating(true);
    try {
      const { data } = await api.post('/players', {
        first_name: firstName,
        last_name: newPlayer.last_name.trim(),
        player_type: newPlayer.player_type,
      });
      setPlayers((list) => [...list, data]);
      setSelected((list) => [...list, data.id]);
      setNewPlayer({ first_name: '', last_name: '', player_type: newPlayer.player_type });
      toast.success(`${data.name} cadastrado e incluído`);
    } catch (err) {
      toast.error(err.response?.data?.error || 'Erro ao cadastrar jogador');
    } finally {
      setCreating(false);
    }
  }

  async function confirm() {
    if (selected.length === 0) return toast.error('Selecione quem jogou nesse dia');
    setSaving(true);
    try {
      const { data } = await api.post('/matchdays/retroactive', {
        match_date: matchDate,
        player_ids: selected,
        number_of_teams: Number(numberOfTeams),
      });
      toast.success('ATA retroativa criada. Monte os times e preencha a súmula.');
      onCreated();
      onClose();
      navigate(`/admin/matchdays/${data.id}`);
    } catch (err) {
      toast.error(err.response?.data?.error || 'Erro ao criar ATA retroativa');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal title="Lançar ATA Retroativa" onClose={onClose}>
      <div className="flex flex-col gap-4">
        <p className="text-xs text-gray-500">
          Para lançar uma pelada que já aconteceu. Informe a data, quantos times foram e quem
          jogou. Na tela seguinte você arrasta os jogadores para os times e preenche a súmula
          em branco, no mesmo formato da ata.
        </p>

        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Data da pelada">
            <input
              type="date" value={matchDate}
              onChange={(e) => setMatchDate(e.target.value)}
              className={inputClass}
            />
          </Field>
          <Field label="Quantidade de times">
            <input
              type="number" min="2" max="8" value={numberOfTeams}
              onChange={(e) => setNumberOfTeams(e.target.value)}
              className={inputClass}
            />
          </Field>
        </div>

        <PlayerPicker
          players={players}
          selected={selected}
          onChange={setSelected}
          label="Quem jogou"
          emptyLabel="Nenhum jogador selecionado ainda."
        />

        <div className="border-t border-gulag-border pt-3">
          <p className="text-sm text-gray-400">Jogou e não está cadastrado?</p>
          <p className="text-xs text-gray-500 mb-2">
            Cadastra na hora e já entra como presente nessa pelada. Telefone e senha ficam para
            depois, em Jogadores — sem eles a pessoa só não consegue entrar no sistema.
          </p>
          <div className="grid gap-2 sm:grid-cols-2">
            <Field label="Nome *">
              <input
                value={newPlayer.first_name}
                onChange={(e) => setNewPlayer((p) => ({ ...p, first_name: e.target.value }))}
                className={inputClass}
              />
            </Field>
            <Field label="Sobrenome">
              <input
                value={newPlayer.last_name}
                onChange={(e) => setNewPlayer((p) => ({ ...p, last_name: e.target.value }))}
                className={inputClass}
              />
            </Field>
            <Field label="Entra como">
              <select
                value={newPlayer.player_type}
                onChange={(e) => setNewPlayer((p) => ({ ...p, player_type: e.target.value }))}
                className={inputClass}
              >
                <option value="diarista">Diarista</option>
                <option value="goleiro">Goleiro</option>
              </select>
            </Field>
            <div className="flex items-end">
              <Button type="button" variant="secondary" onClick={createAndSelect} disabled={creating}>
                {creating ? 'Cadastrando...' : '+ Cadastrar e incluir'}
              </Button>
            </div>
          </div>
        </div>

        <div className="flex gap-2 justify-end sticky bottom-0 bg-gulag-surface pt-2">
          <Button variant="secondary" onClick={onClose}>Cancelar</Button>
          <Button onClick={confirm} disabled={saving}>
            {saving ? 'Criando...' : `Criar súmula (${selected.length})`}
          </Button>
        </div>
      </div>
    </Modal>
  );
}

function SeasonModal({ season, onClose, onSaved }) {
  const { register, handleSubmit, formState } = useForm({
    defaultValues: season
      ? { name: season.name, year: season.year, start_date: season.start_date?.slice(0, 10) }
      : { year: new Date().getFullYear(), start_date: `${new Date().getFullYear()}-01-01` },
  });

  async function onSubmit(values) {
    try {
      const payload = { ...values, year: Number(values.year) };
      if (season) {
        await api.put(`/seasons/${season.id}`, payload);
        toast.success('Temporada atualizada');
      } else {
        await api.post('/seasons', payload);
        toast.success('Temporada criada');
      }
      onSaved();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Erro ao salvar temporada');
    }
  }

  return (
    <Modal title={season ? 'Editar temporada' : 'Nova temporada'} onClose={onClose}>
      <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-3">
        <Field label="Nome">
          <input {...register('name', { required: true })} placeholder="Ex: 2026" className={inputClass} />
        </Field>
        <Field label="Ano">
          <input {...register('year', { required: true })} type="number" className={inputClass} />
        </Field>
        <Field label="Início">
          <input {...register('start_date', { required: true })} type="date" className={inputClass} />
        </Field>
        <div className="flex gap-2 justify-end">
          <Button type="button" variant="secondary" onClick={onClose}>Cancelar</Button>
          <Button disabled={formState.isSubmitting}>Salvar</Button>
        </div>
      </form>
    </Modal>
  );
}
