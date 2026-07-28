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

// Sem telefone o jogador nao consegue entrar no sistema
export const isIncomplete = (player) => !player.phone;

export default function AdminPlayersPage() {
  const [players, setPlayers] = useState([]);
  const [search, setSearch] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [onlyIncomplete, setOnlyIncomplete] = useState(false);

  function load() {
    api.get('/players').then(({ data }) => setPlayers(data));
  }

  useEffect(load, []);

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    return players.filter((p) => {
      if (onlyIncomplete && !isIncomplete(p)) return false;
      return !term || p.name.toLowerCase().includes(term);
    });
  }, [players, search, onlyIncomplete]);

  const incompleteCount = players.filter(isIncomplete).length;

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

      {incompleteCount > 0 && (
        <Card className="border-amber-700/60">
          <p className="text-sm text-amber-300">
            {incompleteCount} cadastro(s) sem telefone — esses jogadores ainda não conseguem entrar
            no sistema. Toque no nome para completar.
          </p>
          <div className="mt-2">
            <Button variant="secondary" onClick={() => setOnlyIncomplete((v) => !v)}>
              {onlyIncomplete ? 'Mostrar todos' : 'Mostrar só os incompletos'}
            </Button>
          </div>
        </Card>
      )}

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
          <p className="text-xs text-gray-500">
            {player.stars}★
            {player.blocked ? ' · bloqueado' : ''}
            {isIncomplete(player) && <span className="text-amber-400"> · sem telefone</span>}
          </p>
        </div>
        <span className="text-gulag-cyan text-sm">{open ? 'fechar' : 'editar'}</span>
      </button>
      {open && <PlayerEditor player={player} onChange={onChange} />}
    </div>
  );
}

function PlayerEditor({ player, onChange }) {
  const [statusType, setStatusType] = useState(player.player_type);
  const [statusDate, setStatusDate] = useState(new Date().toISOString().slice(0, 10));
  const { register, handleSubmit, formState } = useForm({
    defaultValues: {
      first_name: player.first_name || '',
      last_name: player.last_name || '',
      nickname: player.nickname || '',
      phone: player.phone || '',
      email: player.email || '',
      position: player.position || '',
      stars: player.stars,
      mensalista_number: player.mensalista_number ?? '',
      password: '',
    },
  });

  async function saveProfile(values) {
    try {
      const payload = {
        ...values,
        stars: Number(values.stars),
        mensalista_number: values.mensalista_number === '' ? null : Number(values.mensalista_number),
      };
      if (!payload.password) delete payload.password;
      await api.put(`/players/${player.id}`, payload);
      toast.success('Cadastro atualizado');
      onChange();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Erro ao salvar cadastro');
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
      {isIncomplete(player) && (
        <p className="sm:col-span-2 text-xs text-amber-300">
          Informe o telefone (e uma senha inicial) para este jogador conseguir entrar no sistema.
        </p>
      )}

      <form onSubmit={handleSubmit(saveProfile)} className="sm:col-span-2 grid gap-3 sm:grid-cols-2">
        <Field label="Nome *">
          <input {...register('first_name', { required: true })} className={inputClass} />
        </Field>
        <Field label="Sobrenome">
          <input {...register('last_name')} className={inputClass} />
        </Field>
        <Field label="Apelido (usado nas listas)">
          <input {...register('nickname')} className={inputClass} />
        </Field>
        <Field label="Telefone">
          <input {...register('phone')} inputMode="tel" className={inputClass} />
        </Field>
        <Field label="E-mail">
          <input {...register('email')} className={inputClass} />
        </Field>
        <Field label="Nova senha (deixe vazio para manter)">
          <input {...register('password')} className={inputClass} />
        </Field>
        <Field label="Posição">
          <input {...register('position')} className={inputClass} />
        </Field>
        <Field label="Estrelas">
          <input {...register('stars')} type="number" step="0.5" min="0" max="5" className={inputClass} />
        </Field>
        <Field label="Número do mensalista (1-20)">
          <input {...register('mensalista_number')} type="number" min="1" max="20" className={inputClass} />
        </Field>
        <div className="sm:col-span-2">
          <Button disabled={formState.isSubmitting}>Salvar cadastro</Button>
        </div>
      </form>

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
