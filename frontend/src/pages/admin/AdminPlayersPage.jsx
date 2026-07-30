import { useCallback, useEffect, useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import toast from 'react-hot-toast';
import api from '../../api/client';
import Modal from '../../components/Modal';
import { useAuth } from '../../context/AuthContext';
import { inputClass, Button, Card, Field, Avatar, EmptyState } from '../../components/ui';

const GROUPS = [
  { key: 'mensalista', label: 'Mensalistas' },
  { key: 'goleiro', label: 'Goleiros' },
  { key: 'diarista', label: 'Diaristas' },
];

// Sem telefone o jogador nao consegue entrar no sistema
export const isIncomplete = (player) => !player.phone;

export default function AdminPlayersPage() {
  const { player: me } = useAuth();
  const isOwner = !!me?.is_owner;
  const [players, setPlayers] = useState([]);
  const [search, setSearch] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [onlyIncomplete, setOnlyIncomplete] = useState(false);
  const [showInactive, setShowInactive] = useState(false);

  const load = useCallback(() => {
    api.get('/players', { params: { includeInactive: showInactive } })
      .then(({ data }) => setPlayers(data));
  }, [showInactive]);

  useEffect(() => { load(); }, [load]);

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

      <label className="flex items-center gap-2 text-sm text-gray-400">
        <input
          type="checkbox"
          checked={showInactive}
          onChange={(e) => setShowInactive(e.target.checked)}
          className="w-4 h-4"
        />
        Mostrar cadastros inativos
      </label>

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
                {group.map((p) => (
                  <PlayerRow key={p.id} player={p} onChange={load} isOwner={isOwner} />
                ))}
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
        <Field label="Número (mensalista 1-99)">
          <input {...register('mensalista_number')} type="number" min="1" max="99" className={inputClass} />
        </Field>
        <div className="sm:col-span-2 flex gap-2 justify-end">
          <Button type="button" variant="secondary" onClick={onClose}>Cancelar</Button>
          <Button disabled={formState.isSubmitting}>Cadastrar</Button>
        </div>
      </form>
    </Modal>
  );
}

function PlayerRow({ player, onChange, isOwner }) {
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
          <p className={`truncate ${player.active ? 'text-gray-100' : 'text-gray-500 line-through'}`}>
            {player.name}
            {player.is_owner && <span className="text-gulag-cyan text-xs ml-1">(dono)</span>}
            {!player.is_owner && player.role === 'admin' && (
              <span className="text-gulag-cyan text-xs ml-1">(admin)</span>
            )}
          </p>
          <p className="text-xs text-gray-500">
            {player.stars}★
            {!player.active ? ' · inativo' : ''}
            {player.blocked ? ' · bloqueado' : ''}
            {isIncomplete(player) && <span className="text-amber-400"> · sem telefone</span>}
          </p>
        </div>
        <span className="text-gulag-cyan text-sm">{open ? 'fechar' : 'editar'}</span>
      </button>
      {open && <PlayerEditor player={player} onChange={onChange} isOwner={isOwner} />}
    </div>
  );
}

function PlayerEditor({ player, onChange, isOwner }) {
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

  // Efeito imediato: virar mensalista ocupa a primeira vaga livre da numeracao
  async function changeType(player_type) {
    try {
      const { data } = await api.patch(`/players/${player.id}/status`, { player_type });
      toast.success(
        data.mensalista_number
          ? `Agora é mensalista nº ${data.mensalista_number}`
          : `Agora é ${player_type}`
      );
      onChange();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Erro ao atualizar tipo');
    }
  }

  async function toggleActive() {
    const reactivating = !player.active;
    if (!reactivating && !window.confirm(`Inativar o cadastro de ${player.name}?`)) return;
    try {
      await api.patch(`/players/${player.id}/active`, { active: reactivating });
      toast.success(reactivating ? 'Cadastro reativado' : 'Cadastro inativado');
      onChange();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Erro ao alterar situação');
    }
  }

  async function removePlayer() {
    if (!window.confirm(`Excluir definitivamente ${player.name}? Isso não pode ser desfeito.`)) return;
    try {
      await api.delete(`/players/${player.id}`);
      toast.success('Cadastro excluído');
      onChange();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Erro ao excluir cadastro');
    }
  }

  async function toggleAdmin() {
    const role = player.role === 'admin' ? 'player' : 'admin';
    const acao = role === 'admin' ? 'promover a administrador' : 'remover o acesso de administrador de';
    if (!window.confirm(`Deseja ${acao} ${player.name}?`)) return;
    try {
      await api.patch(`/players/${player.id}/role`, { role });
      toast.success(role === 'admin' ? 'Agora é administrador' : 'Acesso de administrador removido');
      onChange();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Erro ao alterar perfil');
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
        <Field label="Número do mensalista (1-99)">
          <input {...register('mensalista_number')} type="number" min="1" max="99" className={inputClass} />
        </Field>
        <div className="sm:col-span-2">
          <Button disabled={formState.isSubmitting}>Salvar cadastro</Button>
        </div>
      </form>

      <div className="sm:col-span-2 border-t border-gulag-border pt-3">
        <p className="text-sm text-gray-400 mb-2">
          Tipo atual: <span className="text-gray-100">{player.player_type}</span>
          {player.mensalista_number && <span className="text-gray-500"> · nº {player.mensalista_number}</span>}
        </p>
        <div className="flex gap-2 flex-wrap">
          {player.player_type === 'mensalista' ? (
            <Button variant="secondary" onClick={() => changeType('diarista')}>
              Tornar Diarista
            </Button>
          ) : (
            <Button onClick={() => changeType('mensalista')}>
              Tornar Mensalista
            </Button>
          )}
          {player.player_type !== 'goleiro' && (
            <Button variant="secondary" onClick={() => changeType('goleiro')}>
              Tornar Goleiro
            </Button>
          )}
        </div>
      </div>

      <div className="sm:col-span-2 border-t border-gulag-border pt-3 flex gap-2 flex-wrap">
        <Button variant={player.blocked ? 'secondary' : 'danger'} onClick={toggleBlock}>
          {player.blocked ? 'Desbloquear cadastro' : 'Bloquear cadastro'}
        </Button>

        {!player.is_owner && (
          <>
            <Button variant="secondary" onClick={toggleActive}>
              {player.active ? 'Inativar cadastro' : 'Reativar cadastro'}
            </Button>
            <Button variant="danger" onClick={removePlayer}>Excluir cadastro</Button>
          </>
        )}

        {isOwner && !player.is_owner && (
          <Button variant="secondary" onClick={toggleAdmin}>
            {player.role === 'admin' ? 'Remover admin' : 'Promover a admin'}
          </Button>
        )}
      </div>

      {player.blocked && player.block_reason && (
        <p className="sm:col-span-2 text-xs text-red-300">Motivo do bloqueio: {player.block_reason}</p>
      )}
      <p className="sm:col-span-2 text-xs text-gray-500">
        Inativar tira o jogador das listas e mantém o histórico. Excluir só é possível
        para cadastros sem nenhum lançamento.
      </p>
    </div>
  );
}
