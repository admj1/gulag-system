import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { useNavigate, Link } from 'react-router-dom';
import toast from 'react-hot-toast';
import { useAuth } from '../context/AuthContext';
import { inputClass, Button } from '../components/ui';

export default function RegisterPage() {
  const { register, handleSubmit, formState } = useForm();
  const { register: registerPlayer } = useAuth();
  const navigate = useNavigate();
  const [taken, setTaken] = useState(null);

  async function onSubmit(values) {
    setTaken(null);
    try {
      await registerPlayer(values);
      navigate('/');
    } catch (err) {
      const data = err.response?.data;
      // Telefone/e-mail existente: a pessoa provavelmente ja foi cadastrada pelo organizador
      if (data?.code === 'phone_taken' || data?.code === 'email_taken') {
        setTaken(data.error);
        return;
      }
      toast.error(data?.error || 'Falha no cadastro');
    }
  }

  return (
    <div className="min-h-screen bg-gulag-bg flex items-center justify-center px-4 py-10">
      <div className="max-w-sm w-full">
        <img src="/logo.jpeg" alt="Gulag" className="w-20 h-20 rounded-full mx-auto mb-5" />
        <h1 className="text-2xl font-bold mb-6 text-center text-gulag-cyan tracking-wide">Criar conta</h1>

        {taken && (
          <div className="mb-4 rounded border border-amber-700/60 bg-amber-500/10 p-3">
            <p className="text-sm text-amber-200">{taken}</p>
            <Link to="/login" className="text-sm text-gulag-cyan underline mt-1 inline-block">
              Já tenho senha, quero entrar
            </Link>
          </div>
        )}

        <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-3">
          <input {...register('first_name', { required: true })} placeholder="Nome *" className={inputClass} />
          <input {...register('last_name', { required: true })} placeholder="Sobrenome *" className={inputClass} />
          <input {...register('nickname')} placeholder="Apelido (usado nas listas)" className={inputClass} />
          <input {...register('phone', { required: true })} placeholder="Telefone *" className={inputClass} />
          <input {...register('email')} placeholder="E-mail" className={inputClass} />
          <input {...register('password', { required: true })} type="password" placeholder="Senha *" className={inputClass} />
          <Button disabled={formState.isSubmitting}>Cadastrar</Button>
        </form>
        <p className="text-sm text-center mt-4 text-gray-400">
          Já tem conta? <Link to="/login" className="text-gulag-cyan underline">Entrar</Link>
        </p>
      </div>
    </div>
  );
}
