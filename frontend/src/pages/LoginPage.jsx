import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { useNavigate, Link } from 'react-router-dom';
import toast from 'react-hot-toast';
import { useAuth } from '../context/AuthContext';
import { inputClass, Button } from '../components/ui';

const REMEMBERED_KEY = 'gulag:telefone';

export default function LoginPage() {
  const { register, handleSubmit, setValue, formState } = useForm();
  const { login } = useAuth();
  const navigate = useNavigate();
  const [remember, setRemember] = useState(false);
  const [locked, setLocked] = useState(null);

  // Telefone lembrado do ultimo acesso neste aparelho
  useEffect(() => {
    const saved = localStorage.getItem(REMEMBERED_KEY);
    if (saved) {
      setValue('phone', saved);
      setRemember(true);
    }
  }, [setValue]);

  async function onSubmit(values) {
    setLocked(null);
    try {
      await login(values.phone, values.password);
      if (remember) localStorage.setItem(REMEMBERED_KEY, values.phone);
      else localStorage.removeItem(REMEMBERED_KEY);
      navigate('/');
    } catch (err) {
      const data = err.response?.data;
      if (data?.code === 'login_locked') {
        setLocked(data.error);
        return;
      }
      const restantes = data?.remainingAttempts;
      toast.error(
        typeof restantes === 'number'
          ? `${data.error}. Você ainda tem ${restantes} tentativa(s).`
          : data?.error || 'Falha no login'
      );
    }
  }

  return (
    <div className="min-h-screen bg-gulag-bg flex items-center justify-center px-4 py-10">
      <div className="max-w-sm w-full">
        <img src="/logo.jpeg" alt="Gulag" className="w-24 h-24 rounded-full mx-auto mb-6" />
        <h1 className="text-2xl font-bold mb-8 text-center text-gulag-cyan tracking-wide">
          Bem-vindo ao Gulag
        </h1>

        {locked && (
          <div className="mb-4 rounded border border-red-700/60 bg-red-500/10 p-3">
            <p className="text-sm text-red-300">{locked}</p>
          </div>
        )}

        <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-3">
          <input
            {...register('phone', { required: true })}
            placeholder="Telefone ou e-mail"
            inputMode="tel"
            autoComplete="username"
            className={inputClass}
          />
          <input
            {...register('password', { required: true })}
            type="password"
            placeholder="Senha"
            autoComplete="current-password"
            className={inputClass}
          />

          <label className="flex items-center gap-2 text-sm text-gray-400">
            <input
              type="checkbox"
              checked={remember}
              onChange={(e) => setRemember(e.target.checked)}
              className="w-4 h-4"
            />
            Lembrar meu telefone neste aparelho
          </label>

          <Button disabled={formState.isSubmitting}>Entrar</Button>
        </form>

        <p className="text-sm text-center mt-4 text-gray-400">
          Não tem conta? <Link to="/register" className="text-gulag-cyan underline">Cadastre-se</Link>
        </p>
        <p className="text-xs text-center mt-3 text-gray-600">
          Esqueceu a senha? Fale com o organizador para cadastrar uma nova.
        </p>
      </div>
    </div>
  );
}
