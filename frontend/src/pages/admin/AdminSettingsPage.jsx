import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import toast from 'react-hot-toast';
import api from '../../api/client';
import { inputClass, Button, Card, Field } from '../../components/ui';

export default function AdminSettingsPage() {
  const { register, handleSubmit, reset, formState } = useForm();

  useEffect(() => {
    api.get('/settings').then(({ data }) => {
      reset({
        monthly_fee: data.monthly_fee,
        daily_fee: data.daily_fee,
        absence_fine: data.absence_fine,
        match_time: data.match_time?.slice(0, 5),
      });
    });
  }, [reset]);

  async function onSubmit(values) {
    try {
      await api.put('/settings', values);
      toast.success('Configurações salvas');
    } catch (err) {
      toast.error(err.response?.data?.error || 'Erro ao salvar configurações');
    }
  }

  return (
    <Card title="Configurações da pelada">
      <form onSubmit={handleSubmit(onSubmit)} className="grid gap-3 sm:grid-cols-2">
        <Field label="Mensalidade (R$)">
          <input {...register('monthly_fee')} type="number" step="0.01" min="0" className={inputClass} />
        </Field>
        <Field label="Diária (R$)">
          <input {...register('daily_fee')} type="number" step="0.01" min="0" className={inputClass} />
        </Field>
        <Field label="Multa por ausência (R$)">
          <input {...register('absence_fine')} type="number" step="0.01" min="0" className={inputClass} />
        </Field>
        <Field label="Horário da pelada">
          <input {...register('match_time')} type="time" className={inputClass} />
        </Field>
        <div className="sm:col-span-2">
          <Button disabled={formState.isSubmitting}>Salvar configurações</Button>
        </div>
      </form>
      <p className="text-xs text-gray-500 mt-3">
        Os valores são aplicados nas próximas cobranças geradas (diárias e multas saem automaticamente
        ao salvar a súmula).
      </p>
    </Card>
  );
}
