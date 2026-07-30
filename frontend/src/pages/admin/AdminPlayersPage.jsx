import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
// Sem e-mail ele entra normalmente, mas nao recebe o aviso da pelada nova
const hasNoEmail = (player) => !player.email;

export default function AdminPlayersPage() {
  const { player: me } = useAuth();
  const isOwner = !!me?.is_owner;
  const [players, setPlayers] = useState([]);
  const [search, setSearch] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [missing, setMissing] = useState(null); // null | 'phone' | 'email'
  const [showInactive, setShowInactive] = useState(false);

  const load = useCallback(() => {
    api.get('/players', { params: { includeInactive: showInactive } })
      .then(({ data }) => setPlayers(data));
  }, [showInactive]);

  useEffect(() => { load(); }, [load]);

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    return players.filter((p) => {
      if (missing === 'phone' && !isIncomplete(p)) return false;
      if (missing === 'email' && !hasNoEmail(p)) return false;
      return !term || p.name.toLowerCase().includes(term);
    });
  }, [players, search, missing]);

  const incompleteCount = players.filter(isIncomplete).length;
  const noEmailCount = players.filter(hasNoEmail).length;
  const toggleMissing = (key) => setMissing((current) => (current === key ? null : key));

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
            <Button variant="secondary" onClick={() => toggleMissing('phone')}>
              {missing === 'phone' ? 'Mostrar todos' : 'Mostrar só os incompletos'}
            </Button>
          </div>
        </Card>
      )}

      {noEmailCount > 0 && (
        <Card>
          <p className="text-sm text-gray-300">
            {noEmailCount} cadastro(s) sem e-mail — esses jogadores <strong>não recebem</strong> o
            aviso de pelada nova. Eles podem preencher em "Meu perfil", ou você cadastra aqui.
          </p>
          <div className="mt-2">
            <Button variant="secondary" onClick={() => toggleMissing('email')}>
              {missing === 'email' ? 'Mostrar todos' : 'Mostrar só quem está sem e-mail'}
            </Button>
          </div>
        </Card>
      )}

      <StarSuggestions onApplied={load} />

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

// O sistema so recomenda: nenhuma estrela muda sozinha, o admin aplica uma a uma.
function StarSuggestions({ onApplied }) {
  const [data, setData] = useState(null);
  const [open, setOpen] = useState(false);
  const [dismissed, setDismissed] = useState([]);
  const [applying, setApplying] = useState(null);

  const load = useCallback(() => {
    api.get('/stats/star-suggestions')
      .then(({ data: result }) => setData(result))
      .catch(() => setData({ suggestions: [] }));
  }, []);

  useEffect(() => { load(); }, [load]);

  async function apply(suggestion) {
    setApplying(suggestion.id);
    try {
      await api.put(`/players/${suggestion.id}`, { stars: suggestion.suggested_stars });
      toast.success(`${suggestion.name} agora tem ${suggestion.suggested_stars}★`);
      setDismissed((list) => [...list, suggestion.id]);
      onApplied();
      load();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Erro ao alterar as estrelas');
    } finally {
      setApplying(null);
    }
  }

  if (!data) return null;

  const pending = data.suggestions.filter((s) => !dismissed.includes(s.id));
  if (pending.length === 0) return null;

  return (
    <Card
      className="border-gulag-cyan/40"
      title={`Sugestões de estrelas (${pending.length})`}
      action={
        <Button variant="secondary" onClick={() => setOpen((v) => !v)}>
          {open ? 'Ocultar' : 'Ver sugestões'}
        </Button>
      }
    >
      <p className="text-xs text-gray-500">
        Baseado nas últimas {data.window} peladas de cada um: participação em gols e aproveitamento
        do time, comparados com o resto do elenco. Nada muda sozinho — você aplica se concordar.
      </p>

      {open && (
        <ul className="flex flex-col gap-2 mt-3">
          {pending.map((s) => (
            <li
              key={s.id}
              className="border border-gulag-border rounded p-3 flex flex-wrap items-center justify-between gap-2"
            >
              <div className="min-w-0">
                <p className="text-gray-100 flex items-center gap-2 flex-wrap">
                  <span className="truncate">{s.name}</span>
                  <span className="text-sm text-gray-400">
                    {s.current_stars}★
                    <span className={s.direction === 'up' ? 'text-emerald-400' : 'text-amber-400'}>
                      {' '}→ {s.suggested_stars}★
                    </span>
                  </span>
                </p>
                <p className="text-xs text-gray-500">
                  {s.contribution} gol+assist. por pelada (média do elenco {data.averageContribution})
                  {s.win_pct !== null && ` · ${s.win_pct}% de aproveitamento`}
                  {' · '}
                  {s.peladas} peladas desde{' '}
                  {new Date(`${s.desde}T12:00:00`).toLocaleDateString('pt-BR')}
                </p>
              </div>
              <div className="flex gap-2 shrink-0">
                <Button onClick={() => apply(s)} disabled={applying === s.id}>
                  {applying === s.id ? 'Aplicando...' : 'Aplicar'}
                </Button>
                <Button
                  variant="secondary"
                  onClick={() => setDismissed((list) => [...list, s.id])}
                >
                  Ignorar
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </Card>
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
            {player.login_locked && <span className="text-red-400"> · senha bloqueada</span>}
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
  const [uploading, setUploading] = useState(false);
  const fileInput = useRef(null);
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

  // Sobe a imagem e ja grava a URL no cadastro do jogador
  async function onPickPhoto(event) {
    const file = event.target.files?.[0];
    if (!file) return;

    setUploading(true);
    try {
      const form = new FormData();
      form.append('photo', file);
      const { data } = await api.post(`/players/${player.id}/photo`, form);
      await api.put(`/players/${player.id}`, { photo_url: data.photo_url });
      toast.success('Foto atualizada');
      onChange();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Erro ao enviar foto');
    } finally {
      setUploading(false);
      event.target.value = '';
    }
  }

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

  async function unlockLogin() {
    try {
      await api.patch(`/players/${player.id}/unlock`);
      toast.success('Senha liberada. Cadastre uma nova senha para o jogador.');
      onChange();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Erro ao liberar senha');
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

      <div className="sm:col-span-2 flex items-center gap-3">
        <Avatar src={player.photo_url} name={player.name} />
        <input
          ref={fileInput}
          type="file"
          accept="image/*"
          onChange={onPickPhoto}
          className="hidden"
        />
        <Button variant="secondary" onClick={() => fileInput.current?.click()} disabled={uploading}>
          {uploading ? 'Enviando...' : player.photo_url ? 'Trocar foto' : 'Colocar foto'}
        </Button>
      </div>

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

        {player.login_locked && (
          <Button variant="secondary" onClick={unlockLogin}>
            Liberar senha bloqueada
          </Button>
        )}

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
