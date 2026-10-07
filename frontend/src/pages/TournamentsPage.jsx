import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import toast from 'react-hot-toast';
import api from '../api/client';
import Modal from '../components/Modal';
import { useAuth } from '../context/AuthContext';
import { inputClass, Button, Card, Field, EmptyState, matchDateLabel } from '../components/ui';
import { TOURNAMENT_STATUS } from '../components/tournament';

export default function TournamentsPage() {
  const { isAdmin } = useAuth();
  const [tournaments, setTournaments] = useState(null);
  const [creating, setCreating] = useState(false);

  const load = useCallback(() => {
    api.get('/tournaments').then(({ data }) => setTournaments(data));
  }, []);
  useEffect(() => { load(); }, [load]);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-2">
        <h1 className="text-2xl font-bold text-gray-100">Torneios</h1>
        {isAdmin && <Button onClick={() => setCreating(true)}>+ Novo torneio</Button>}
      </div>

      {!tournaments ? (
        <EmptyState>Carregando...</EmptyState>
      ) : tournaments.length === 0 ? (
        <EmptyState>Nenhum torneio ainda.</EmptyState>
      ) : (
        <div className="flex flex-col gap-2">
          {tournaments.map((t) => (
            <Link key={t.id} to={`/torneios/${t.id}`}>
              <Card className="hover:border-gulag-cyan/60">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="font-semibold text-gray-100">{t.name}</p>
                    <p className="text-xs text-gray-500">
                      {matchDateLabel(t.event_date)} · {t.num_teams} times · {t.inscritos} inscrito(s)
                      {Number(t.fee) > 0 && ` · taxa R$ ${Number(t.fee).toFixed(2).replace('.', ',')}`}
                    </p>
                    {t.champion_name && <p className="text-sm text-amber-300 mt-1">🏆 {t.champion_name}</p>}
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-xs text-gulag-cyan">{TOURNAMENT_STATUS[t.status]}</p>
                    {t.inscrito && <p className="text-xs text-emerald-400">✓ você está inscrito</p>}
                  </div>
                </div>
              </Card>
            </Link>
          ))}
        </div>
      )}

      {creating && (
        <NewTournamentModal
          onClose={() => setCreating(false)}
          onCreated={() => { setCreating(false); load(); }}
        />
      )}
    </div>
  );
}

function NewTournamentModal({ onClose, onCreated }) {
  const { register, handleSubmit, formState } = useForm({
    defaultValues: { num_teams: 6, line_per_team: 6, gk_per_team: 1, num_groups: 2, fee: '' },
  });

  async function onSubmit(values) {
    try {
      await api.post('/tournaments', values);
      toast.success('Torneio criado — inscrições abertas');
      onCreated();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Erro ao criar torneio');
    }
  }

  return (
    <Modal title="Novo torneio" onClose={onClose}>
      <form onSubmit={handleSubmit(onSubmit)} className="grid gap-3 sm:grid-cols-2">
        <Field label="Nome *">
          <input {...register('name', { required: true })} placeholder="Copa Gulag" className={inputClass} />
        </Field>
        <Field label="Data *">
          <input {...register('event_date', { required: true })} type="date" className={inputClass} />
        </Field>
        <Field label="Taxa por jogador (R$)">
          <input {...register('fee')} type="number" step="0.01" min="0" className={inputClass} />
        </Field>
        <Field label="Nº de times">
          <input {...register('num_teams')} type="number" min="2" max="16" className={inputClass} />
        </Field>
        <Field label="Jogadores de linha por time (com o capitão)">
          <input {...register('line_per_team')} type="number" min="1" max="15" className={inputClass} />
        </Field>
        <Field label="Goleiros por time">
          <input {...register('gk_per_team')} type="number" min="0" max="3" className={inputClass} />
        </Field>
        <Field label="Grupos">
          <select {...register('num_groups')} className={inputClass}>
            <option value="2">2 grupos (semifinal e final)</option>
            <option value="1">1 grupo (final entre os 2 primeiros)</option>
          </select>
        </Field>
        <p className="sm:col-span-2 text-xs text-gray-500">
          Goleiro é isento da taxa. A taxa é cobrada só de quem for convocado no draft.
        </p>
        <div className="sm:col-span-2 flex gap-2 justify-end">
          <Button type="button" variant="secondary" onClick={onClose}>Cancelar</Button>
          <Button disabled={formState.isSubmitting}>Criar torneio</Button>
        </div>
      </form>
    </Modal>
  );
}
