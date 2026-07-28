import { useForm } from 'react-hook-form';
import { useNavigate, Link } from 'react-router-dom';
import toast from 'react-hot-toast';
import { useAuth } from '../context/AuthContext';
import { inputClass, Button } from '../components/ui';

export default function RegisterPage() {
  const { register, handleSubmit, formState } = useForm();
  const { register: registerPlayer } = useAuth();
  const navigate = useNavigate();

  async function onSubmit(values) {
    try {
      await registerPlayer(values);
      navigate('/');
    } catch (err) {
      toast.error(err.response?.data?.error || 'Falha no cadastro');
    }
  }

  return (
    <div className="min-h-screen bg-gulag-bg flex items-center justify-center px-4 py-10">
      <div className="max-w-sm w-full">
        <img src="/logo.jpeg" alt="Gulag" className="w-20 h-20 rounded-full mx-auto mb-5" />
        <h1 className="text-2xl font-bold mb-6 text-center text-gulag-cyan tracking-wide">Criar conta</h1>
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
