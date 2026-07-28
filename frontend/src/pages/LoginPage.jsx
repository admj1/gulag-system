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
    <div className="max-w-sm mx-auto mt-16">
      <h1 className="text-2xl font-bold mb-6 text-center">Entrar</h1>
      <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-3">
        <input
          {...register('phone', { required: true })}
          placeholder="Telefone"
          className="border rounded px-3 py-2"
        />
        <input
          {...register('password', { required: true })}
          type="password"
          placeholder="Senha"
          className="border rounded px-3 py-2"
        />
        <button className="bg-emerald-700 text-white rounded py-2">Entrar</button>
      </form>
      <p className="text-sm text-center mt-4">
        Não tem conta? <Link to="/register" className="underline">Cadastre-se</Link>
      </p>
    </div>
  );
}
