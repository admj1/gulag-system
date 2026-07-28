import { useEffect, useRef, useState } from 'react';
import { useForm } from 'react-hook-form';
import toast from 'react-hot-toast';
import api from '../api/client';
import { useAuth } from '../context/AuthContext';
import { inputClass, Button, Card, Field, Avatar } from '../components/ui';

export default function MyProfilePage() {
  const { refreshPlayer } = useAuth();
  const { register, handleSubmit, reset, formState } = useForm();
  const [player, setPlayer] = useState(null);
  const [uploading, setUploading] = useState(false);
  const fileInput = useRef(null);

  useEffect(() => {
    api.get('/players/me').then(({ data }) => {
      setPlayer(data);
      reset({
        first_name: data.first_name,
        last_name: data.last_name,
        nickname: data.nickname || '',
        phone: data.phone || '',
        email: data.email || '',
        position: data.position || '',
      });
    });
  }, [reset]);

  async function onSubmit(values) {
    try {
      const { data } = await api.put('/players/me', values);
      setPlayer(data);
      refreshPlayer(data);
      toast.success('Perfil atualizado');
    } catch (err) {
      toast.error(err.response?.data?.error || 'Erro ao salvar perfil');
    }
  }

  async function onPickPhoto(event) {
    const file = event.target.files?.[0];
    if (!file) return;

    setUploading(true);
    try {
      const form = new FormData();
      form.append('photo', file);
      const { data } = await api.post('/players/me/photo', form);
      const { data: updated } = await api.put('/players/me', { photo_url: data.photo_url });
      setPlayer(updated);
      refreshPlayer(updated);
      toast.success('Foto atualizada');
    } catch (err) {
      toast.error(err.response?.data?.error || 'Erro ao enviar foto');
    } finally {
      setUploading(false);
    }
  }

  if (!player) return <p className="text-gray-400">Carregando...</p>;

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-2xl font-bold text-gray-100">Meu perfil</h1>

      <Card>
        <div className="flex items-center gap-4">
          <Avatar src={player.photo_url} name={player.name} size="lg" />
          <div className="flex flex-col gap-2">
            <p className="font-medium text-gray-100">{player.name}</p>
            <p className="text-sm text-gray-400">{player.player_type} · {player.stars}★</p>
            <input ref={fileInput} type="file" accept="image/*" onChange={onPickPhoto} className="hidden" />
            <Button variant="secondary" onClick={() => fileInput.current?.click()} disabled={uploading}>
              {uploading ? 'Enviando...' : 'Trocar foto'}
            </Button>
          </div>
        </div>
      </Card>

      <Card title="Dados pessoais">
        <form onSubmit={handleSubmit(onSubmit)} className="grid gap-3 sm:grid-cols-2">
          <Field label="Nome *">
            <input {...register('first_name', { required: true })} className={inputClass} />
          </Field>
          <Field label="Sobrenome *">
            <input {...register('last_name', { required: true })} className={inputClass} />
          </Field>
          <Field label="Apelido (usado nas listas)">
            <input {...register('nickname')} className={inputClass} />
          </Field>
          <Field label="Posição">
            <input {...register('position')} className={inputClass} />
          </Field>
          <Field label="Telefone">
            <input {...register('phone')} className={inputClass} />
          </Field>
          <Field label="E-mail">
            <input {...register('email')} className={inputClass} />
          </Field>
          <div className="sm:col-span-2">
            <Button disabled={formState.isSubmitting}>Salvar alterações</Button>
          </div>
        </form>
      </Card>
    </div>
  );
}
