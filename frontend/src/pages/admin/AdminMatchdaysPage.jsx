import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { Link } from 'react-router-dom';
import toast from 'react-hot-toast';
import api from '../../api/client';

const inputClass = 'bg-gulag-surface-2 border border-gulag-border text-gray-100 placeholder-gray-500 rounded px-2 py-1 text-sm focus:outline-none focus:border-gulag-cyan';

export default function AdminMatchdaysPage() {
  const [matchdays, setMatchdays] = useState([]);
  const [seasons, setSeasons] = useState([]);
  const { register, handleSubmit, reset } = useForm();
  const seasonForm = useForm();

  function load() {
    api.get('/matchdays').then(({ data }) => setMatchdays(data));
    api.get('/seasons').then(({ data }) => setSeasons(data));
  }

  useEffect(load, []);

  async function onCreateSeason(values) {
    try {
      await api.post('/seasons', { ...values, year: Number(values.year) });
      toast.success('Temporada criada');
      seasonForm.reset();
      load();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Erro ao criar temporada');
    }
  }

  async function onCreateMatchday(values) {
    try {
      await api.post('/matchdays', {
        season_id: Number(values.season_id),
        match_date: values.match_date,
        confirmation_deadline: values.confirmation_deadline,
      });
      toast.success('Pelada criada');
      reset();
      load();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Erro ao criar pelada');
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="border border-gulag-border rounded p-4 bg-gulag-surface">
        <h2 className="font-semibold text-gulag-cyan mb-3">Temporadas</h2>
        <form onSubmit={seasonForm.handleSubmit(onCreateSeason)} className="grid grid-cols-4 gap-2 mb-3">
          <input {...seasonForm.register('name', { required: true })} placeholder="Nome (ex: 2026)" className={inputClass} />
          <input {...seasonForm.register('year', { required: true })} type="number" placeholder="Ano" className={inputClass} />
          <input {...seasonForm.register('start_date', { required: true })} type="date" className={inputClass} />
          <button className="bg-gulag-cyan text-black font-semibold rounded px-3 py-1 text-sm">Nova temporada</button>
        </form>
        <ul className="text-sm text-gray-300 flex gap-3 flex-wrap">
          {seasons.map((s) => <li key={s.id} className="text-gray-400">{s.name} ({s.year})</li>)}
        </ul>
      </div>

      <div className="border border-gulag-border rounded p-4 bg-gulag-surface">
        <h2 className="font-semibold text-gulag-cyan mb-3">Nova pelada da semana</h2>
        <form onSubmit={handleSubmit(onCreateMatchday)} className="grid grid-cols-4 gap-2">
          <select {...register('season_id', { required: true })} className={inputClass}>
            <option value="">Temporada</option>
            {seasons.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
          <input {...register('match_date', { required: true })} type="date" className={inputClass} />
          <input {...register('confirmation_deadline', { required: true })} type="datetime-local" className={inputClass} />
          <button className="bg-gulag-cyan text-black font-semibold rounded px-3 py-1 text-sm">Criar pelada</button>
        </form>
      </div>

      <ul className="flex flex-col gap-2">
        {matchdays.map((m) => (
          <li key={m.id} className="border border-gulag-border rounded p-3 bg-gulag-surface flex justify-between items-center">
            <div>
              <p className="font-medium text-gray-100">{new Date(m.match_date).toLocaleDateString('pt-BR')}</p>
              <p className="text-xs text-gray-400">
                Prazo: {new Date(m.confirmation_deadline).toLocaleString('pt-BR')} · status: {m.status}
              </p>
            </div>
            <Link to={`/admin/matchdays/${m.id}`} className="text-gulag-cyan underline text-sm">gerenciar</Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
