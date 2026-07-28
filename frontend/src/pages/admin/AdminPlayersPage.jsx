import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import toast from 'react-hot-toast';
import api from '../../api/client';

const inputClass = 'bg-gulag-surface-2 border border-gulag-border text-gray-100 placeholder-gray-500 rounded px-2 py-1 text-sm focus:outline-none focus:border-gulag-cyan';

export default function AdminPlayersPage() {
  const [players, setPlayers] = useState([]);
  const { register, handleSubmit, reset } = useForm();

  function load() {
    api.get('/players').then(({ data }) => setPlayers(data));
  }

  useEffect(load, []);

  async function onCreate(values) {
    try {
      await api.post('/players', { ...values, stars: Number(values.stars) || 3 });
      toast.success('Jogador cadastrado');
      reset();
      load();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Erro ao cadastrar jogador');
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="border border-gulag-border rounded p-4 bg-gulag-surface">
        <h2 className="font-semibold text-gulag-cyan mb-3">Cadastrar jogador</h2>
        <form onSubmit={handleSubmit(onCreate)} className="grid grid-cols-3 gap-2">
          <input {...register('name', { required: true })} placeholder="Nome" className={inputClass} />
          <input {...register('phone', { required: true })} placeholder="Telefone" className={inputClass} />
          <input {...register('email')} placeholder="E-mail (opcional)" className={inputClass} />
          <input {...register('password')} placeholder="Senha (opcional)" className={inputClass} />
          <input {...register('position')} placeholder="Posição" className={inputClass} />
          <input {...register('stars')} type="number" step="0.5" min="0" max="5" placeholder="Estrelas" className={inputClass} />
          <select {...register('player_type')} className={inputClass} defaultValue="diarista">
            <option value="mensalista">Mensalista</option>
            <option value="diarista">Diarista</option>
            <option value="goleiro">Goleiro</option>
          </select>
          <button className="bg-gulag-cyan text-black font-semibold rounded px-3 py-1 text-sm col-span-1">
            Cadastrar
          </button>
        </form>
      </div>

      <div className="flex flex-col gap-2">
        {players.map((p) => (
          <PlayerRow key={p.id} player={p} onChange={load} />
        ))}
      </div>
    </div>
  );
}

function PlayerRow({ player, onChange }) {
  const [stars, setStars] = useState(player.stars);
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
    if (player.blocked) {
      await api.patch(`/players/${player.id}/block`, { blocked: false });
      toast.success('Cadastro desbloqueado');
      onChange();
      return;
    }
    const reason = window.prompt('Motivo do bloqueio (débito ou suspensão disciplinar):');
    if (reason === null) return;
    await api.patch(`/players/${player.id}/block`, { blocked: true, block_reason: reason });
    toast.success('Cadastro bloqueado');
    onChange();
  }

  return (
    <div className="border border-gulag-border rounded p-3 bg-gulag-surface flex flex-wrap items-center gap-3">
      <div className="min-w-[160px]">
        <p className="font-medium text-gray-100">{player.name}</p>
        <p className="text-xs text-gray-400">{player.phone}</p>
      </div>

      <div className="flex items-center gap-1">
        <input
          type="number" step="0.5" min="0" max="5" value={stars}
          onChange={(e) => setStars(e.target.value)}
          className={`${inputClass} w-16`}
        />
        <button onClick={saveStars} className="text-xs text-gulag-cyan underline">salvar</button>
      </div>

      <div className="flex items-center gap-1">
        <select value={statusType} onChange={(e) => setStatusType(e.target.value)} className={inputClass}>
          <option value="mensalista">Mensalista</option>
          <option value="diarista">Diarista</option>
          <option value="goleiro">Goleiro</option>
        </select>
        <input type="date" value={statusDate} onChange={(e) => setStatusDate(e.target.value)} className={inputClass} />
        <button onClick={applyStatusChange} className="text-xs text-gulag-cyan underline">aplicar</button>
      </div>

      <button
        onClick={toggleBlock}
        className={`ml-auto text-xs rounded px-2 py-1 ${player.blocked ? 'bg-red-900 text-red-200' : 'bg-gulag-surface-2 text-gray-300'}`}
      >
        {player.blocked ? 'Bloqueado (clique p/ liberar)' : 'Bloquear'}
      </button>
    </div>
  );
}
