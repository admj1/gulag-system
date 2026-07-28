import { useForm } from 'react-hook-form';
import { useNavigate, Link } from 'react-router-dom';
import toast from 'react-hot-toast';
import { useAuth } from '../context/AuthContext';

export default function RegisterPage() {
  const { register, handleSubmit } = useForm();
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

  const inputClass = 'bg-gulag-surface border border-gulag-border text-gray-100 placeholder-gray-500 rounded px-3 py-2 focus:outline-none focus:border-gulag-cyan';

  return (
    <div className="min-h-screen bg-gulag-bg flex items-center justify-center px-4">
      <div className="max-w-sm w-full">
        <h1 className="text-3xl font-bold mb-8 text-center text-gulag-cyan tracking-wide">Criar conta</h1>
        <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-3">
          <input {...register('name', { required: true })} placeholder="Nome" className={inputClass} />
          <input {...register('phone', { required: true })} placeholder="Telefone" className={inputClass} />
          <input {...register('email')} placeholder="E-mail (opcional)" className={inputClass} />
          <input {...register('password', { required: true })} type="password" placeholder="Senha" className={inputClass} />
          <button className="bg-gulag-cyan text-black font-semibold rounded py-2 hover:bg-gulag-cyan-dark">
            Cadastrar
          </button>
        </form>
        <p className="text-sm text-center mt-4 text-gray-400">
          Já tem conta? <Link to="/login" className="text-gulag-cyan underline">Entrar</Link>
        </p>
      </div>
    </div>
  );
}
