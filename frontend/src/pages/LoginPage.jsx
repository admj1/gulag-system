import { useForm } from 'react-hook-form';
import { useNavigate, Link } from 'react-router-dom';
import toast from 'react-hot-toast';
import { useAuth } from '../context/AuthContext';

export default function LoginPage() {
  const { register, handleSubmit } = useForm();
  const { login } = useAuth();
  const navigate = useNavigate();

  async function onSubmit(values) {
    try {
      await login(values.phone, values.password);
      navigate('/');
    } catch (err) {
      toast.error(err.response?.data?.error || 'Falha no login');
    }
  }

  return (
    <div className="min-h-screen bg-gulag-bg flex items-center justify-center px-4">
      <div className="max-w-sm w-full">
        <img src="/logo.jpeg" alt="Gulag" className="w-24 h-24 rounded-full mx-auto mb-6" />
        <h1 className="text-2xl font-bold mb-8 text-center text-gulag-cyan tracking-wide">Entrar no Gulag</h1>
        <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-3">
          <input
            {...register('phone', { required: true })}
            placeholder="Telefone ou e-mail"
            className="bg-gulag-surface border border-gulag-border text-gray-100 placeholder-gray-500 rounded px-3 py-2 focus:outline-none focus:border-gulag-cyan"
          />
          <input
            {...register('password', { required: true })}
            type="password"
            placeholder="Senha"
            className="bg-gulag-surface border border-gulag-border text-gray-100 placeholder-gray-500 rounded px-3 py-2 focus:outline-none focus:border-gulag-cyan"
          />
          <button className="bg-gulag-cyan text-black font-semibold rounded py-2 hover:bg-gulag-cyan-dark">
            Entrar
          </button>
        </form>
        <p className="text-sm text-center mt-4 text-gray-400">
          Não tem conta? <Link to="/register" className="text-gulag-cyan underline">Cadastre-se</Link>
        </p>
      </div>
    </div>
  );
}
