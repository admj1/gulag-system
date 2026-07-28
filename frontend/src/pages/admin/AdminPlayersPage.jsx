import { useEffect, useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import toast from 'react-hot-toast';
import api from '../../api/client';
import Modal from '../../components/Modal';
import { inputClass, Button, Card, Field, Avatar, EmptyState } from '../../components/ui';

const GROUPS = [
  { key: 'mensalista', label: 'Mensalistas' },
  { key: 'goleiro', label: 'Goleiros' },
  { key: 'diarista', label: 'Diaristas' },
];

export default function AdminPlayersPage() {
  const [players, setPlayers] = useState([]);
  const [search, setSearch] = useState('');
  const [showForm, setShowForm] = useState(false);

  function load() {
    api.get('/players').then(({ data }) => setPlayers(data));
  }

  useEffect(load, []);

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return players;
    return players.filter((p) => p.name.toLowerCase().includes(term));
  }, [players, search]);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap gap-2 items-center">
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Pesquisar jogador..."
          className={`${inputClass} flex-1 min-w-[180px]`}
        />
        <Button onClick={() => setShowForm(true)}>+ Cadastrar jogador</Button>
      </div>

      {showForm && (
        <NewPlayerModal
          onClose={() => setShowForm(false)}
          onCreated={() => { setShowForm(false); load(); }}
        />
      )}

      {GROUPS.map(({ key, label }) => {
        const group = filtered.filter((p) => p.player_type === key);
        return (
          <Card key={key} title={`${label} (${group.length})`}>
            {group.length === 0 ? (
              <EmptyState>Nenhum jogador.</EmptyState>
            ) : (
              <div className="flex flex-col gap-2">
                {group.map((p) => <PlayerRow key={p.id} player={p} onChange={load} />)}
              </div>
            )}
          </Card>
        );
      })}
    </div>
  );
}

function NewPlayerModal({ onClose, onCreated }) {
  const { register, handleSubmit, formState } = useForm({ defaultValues: { player_type: 'diarista', stars: 3 } });

  async function onSubmit(values) {
    try {
      await api.post('/players', { ...values, stars: Number(values.stars) || 3 });
      toast.success('Jogador cadastrado');
      onCreated();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Erro ao cadastrar jogador');
    }
  }

  return (
    <Modal title="Cadastrar jogador" onClose={onClose}>
      <form onSubmit={handleSubmit(onSubmit)} className="grid gap-3 sm:grid-cols-2">
        <Field label="Nome *">
          <input {...register('first_name', { required: true })} className={inputClass} />
        </Field>
        <Field label="Sobrenome *">
          <input {...register('last_name', { required: true })} className={inputClass} />
        </Field>
        <Field label="Apelido">
          <input {...register('nickname')} className={inputClass} />
        </Field>
        <Field label="Telefone">
          <input {...register('phone')} className={inputClass} />
        </Field>
        <Field label="E-mail">
          <input {...register('email')} className={inputClass} />
        </Field>
        <Field label="Senha inicial">
          <input {...register('password')} className={inputClass} />
        </Field>
        <Field label="Posição">
          <input {...register('position')} className={inputClass} />
        </Field>
        <Field label="Estrelas">
          <input {...register('stars')} type="number" step="0.5" min="0" max="5" className={inputClass} />
        </Field>
        <Field label="Tipo">
          <select {...register('player_type')} className={inputClass}>
            <option value="mensalista">Mensalista</option>
            <option value="diarista">Diarista</option>
            <option value="goleiro">Goleiro</option>
          </select>
        </Field>
        <Field label="Número (mensalista 1-20)">
          <input {...register('mensalista_number')} type="number" min="1" max="20" className={inputClass} />
        </Field>
        <div className="sm:col-span-2 flex gap-2 justify-end">
          <Button type="button" variant="secondary" onClick={onClose}>Cancelar</Button>
          <Button disabled={formState.isSubmitting}>Cadastrar</Button>
        </div>
      </form>
    </Modal>
  );
}

function PlayerRow({ player, onChange }) {
  const [open, setOpen] = useState(false);

  return (
    <div className="border border-gulag-border rounded">
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center gap-3 p-2 text-left"
      >
        {player.mensalista_number && (
          <span className="text-gray-500 text-sm w-5 text-right shrink-0">{player.mensalista_number}</span>
        )}
        <Avatar src={player.photo_url} name={player.name} size="sm" />
        <div className="min-w-0 flex-1">
          <p className="text-gray-100 truncate">{player.name}</p>
          <p className="text-xs text-gray-500">{player.stars}★ {player.blocked ? '· bloqueado' : ''}</p>
        </div>
        <span className="text-gulag-cyan text-sm">{open ? 'fechar' : 'editar'}</span>
      </button>
      {open && <PlayerEditor player={player} onChange={onChange} />}
    </div>
  );
}

function PlayerEditor({ player, onChange }) {
  const [stars, setStars] = useState(player.stars);
  const [number, setNumber] = useState(player.mensalista_number ?? '');
  const [statusType, setStatusType] = useState(player.player_type);
  const [statusDate, setStatusDate] = useState(new Date().toISOString().slice(0, 10));

  async function saveStars() {
    try {
      await api.put(`/players/${player.id}`, { stars: Number(stars) });
      toast.success('Estrelas atualizadas');
      onChange();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Erro ao salvar');
    }
  }

  async function saveNumber() {
    try {
      await api.put(`/players/${player.id}`, { mensalista_number: number === '' ? null : Number(number) });
      toast.success('Numeração atualizada');
      onChange();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Erro ao salvar numeração');
    }
  }

  async function applyStatusChange() {
    try {
      await api.patch(`/players/${player.id}/status`, { player_type: statusType, start_date: statusDate });
      toast.success('Status atualizado');
      onChange();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Erro ao atualizar status');
    }
  }

  async function toggleBlock() {
    try {
      if (player.blocked) {
        await api.patch(`/players/${player.id}/block`, { blocked: false });
        toast.success('Cadastro desbloqueado');
      } else {
        const reason = window.prompt('Motivo do bloqueio (débito ou suspensão disciplinar):');
        if (reason === null) return;
        await api.patch(`/players/${player.id}/block`, { blocked: true, block_reason: reason });
        toast.success('Cadastro bloqueado');
      }
      onChange();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Erro ao alterar bloqueio');
    }
  }

  return (
    <div className="border-t border-gulag-border p-3 grid gap-3 sm:grid-cols-2">
      <Field label="Estrelas">
        <div className="flex gap-2">
          <input
            type="number" step="0.5" min="0" max="5" value={stars}
            onChange={(e) => setStars(e.target.value)}
            className={inputClass}
          />
          <Button variant="secondary" onClick={saveStars}>Salvar</Button>
        </div>
      </Field>

      <Field label="Número do mensalista (1-20)">
        <div className="flex gap-2">
          <input
            type="number" min="1" max="20" value={number}
            onChange={(e) => setNumber(e.target.value)}
            className={inputClass}
          />
          <Button variant="secondary" onClick={saveNumber}>Salvar</Button>
        </div>
      </Field>

      <Field label="Tipo / a partir de">
        <div className="flex gap-2 flex-wrap">
          <select value={statusType} onChange={(e) => setStatusType(e.target.value)} className={`${inputClass} flex-1`}>
            <option value="mensalista">Mensalista</option>
            <option value="diarista">Diarista</option>
            <option value="goleiro">Goleiro</option>
          </select>
          <input type="date" value={statusDate} onChange={(e) => setStatusDate(e.target.value)} className={`${inputClass} flex-1`} />
          <Button variant="secondary" onClick={applyStatusChange}>Aplicar</Button>
        </div>
      </Field>

      <div className="sm:col-span-2">
        <Button variant={player.blocked ? 'secondary' : 'danger'} onClick={toggleBlock}>
          {player.blocked ? 'Desbloquear cadastro' : 'Bloquear cadastro'}
        </Button>
        {player.blocked && player.block_reason && (
          <p className="text-xs text-red-300 mt-1">Motivo: {player.block_reason}</p>
        )}
      </div>
    </div>
  );
}
