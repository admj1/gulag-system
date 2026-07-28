import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { Link, useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import api from '../../api/client';
import Modal from '../../components/Modal';
import { inputClass, Button, Card, Field, EmptyState } from '../../components/ui';

const STATUS_LABELS = { open: 'Lista aberta', closed: 'Lista fechada', played: 'Realizada' };

export default function AdminMatchdaysPage() {
  const [matchdays, setMatchdays] = useState([]);
  const [seasons, setSeasons] = useState([]);
  const [showAta, setShowAta] = useState(false);
  const [showSeason, setShowSeason] = useState(false);
  const [editingSeason, setEditingSeason] = useState(null);

  function load() {
    api.get('/matchdays').then(({ data }) => setMatchdays(data));
    api.get('/seasons').then(({ data }) => setSeasons(data));
  }

  useEffect(load, []);

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
      <Card title="Peladas" action={<Button onClick={() => setShowAta(true)}>+ Lançar ATA</Button>}>
        {matchdays.length === 0 ? (
          <EmptyState>Nenhuma pelada lançada.</EmptyState>
        ) : (
          <ul className="flex flex-col gap-2">
            {matchdays.map((m) => (
              <li key={m.id} className="border border-gulag-border rounded p-3 flex flex-wrap items-center justify-between gap-2">
                <div>
                  <p className="text-gray-100">
                    {new Date(`${m.match_date}T12:00:00`).toLocaleDateString('pt-BR', {
                      weekday: 'short', day: '2-digit', month: '2-digit', year: 'numeric',
                    })}
                  </p>
                  <p className="text-xs text-gray-500">{STATUS_LABELS[m.status] || m.status}</p>
                </div>
                <div className="flex gap-2">
                  <Link to={`/admin/matchdays/${m.id}`}>
                    <Button variant="secondary">Gerenciar</Button>
                  </Link>
                  <Button variant="danger" onClick={() => removeMatchday(m)}>Apagar</Button>
                </div>
              </li>
            ))}
          </ul>
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

// Lancar ATA: escolhe a data, o sistema pre-seleciona mensalistas + goleiros,
// admin ajusta (inclusive incluindo diaristas) e confirma.
function AtaModal({ onClose, onCreated }) {
  const navigate = useNavigate();
  const [matchDate, setMatchDate] = useState(new Date().toISOString().slice(0, 10));
  const [roster, setRoster] = useState([]);
  const [others, setOthers] = useState([]);
  const [selected, setSelected] = useState(new Set());
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    api.get('/matchdays/roster-preview').then(({ data }) => {
      setRoster(data);
      setSelected(new Set(data.map((p) => p.id)));
    });
    api.get('/players', { params: { type: 'diarista' } }).then(({ data }) => setOthers(data));
  }, []);

  function toggle(id) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  async function confirm() {
    if (selected.size === 0) return toast.error('Selecione ao menos um jogador');
    setSaving(true);
    try {
      const { data } = await api.post('/matchdays/from-roster', {
        match_date: matchDate,
        player_ids: Array.from(selected),
      });
      toast.success('ATA lançada');
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
          Mensalistas e goleiros já vêm marcados. Desmarque quem não jogou e inclua os diaristas.
        </p>

        <RosterGroup title="Mensalistas" players={mensalistas} selected={selected} onToggle={toggle} />
        <RosterGroup title="Goleiros" players={goleiros} selected={selected} onToggle={toggle} />
        <RosterGroup title="Diaristas" players={others} selected={selected} onToggle={toggle} />

        <div className="flex gap-2 justify-end sticky bottom-0 bg-gulag-surface pt-2">
          <Button variant="secondary" onClick={onClose}>Cancelar</Button>
          <Button onClick={confirm} disabled={saving}>
            Confirmar ({selected.size})
          </Button>
        </div>
      </div>
    </Modal>
  );
}

function RosterGroup({ title, players, selected, onToggle }) {
  if (players.length === 0) return null;
  return (
    <div>
      <h3 className="text-sm font-semibold text-gray-300 mb-1">{title}</h3>
      <ul className="grid gap-1 sm:grid-cols-2">
        {players.map((p) => (
          <li key={p.id}>
            <label className="flex items-center gap-2 text-sm text-gray-200 py-1">
              <input type="checkbox" checked={selected.has(p.id)} onChange={() => onToggle(p.id)} className="w-4 h-4" />
              <span className="truncate">{p.name}</span>
            </label>
          </li>
        ))}
      </ul>
    </div>
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
