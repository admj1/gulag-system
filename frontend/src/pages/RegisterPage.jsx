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

  return (
    <div className="max-w-sm mx-auto mt-16">
      <h1 className="text-2xl font-bold mb-6 text-center">Criar conta</h1>
      <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-3">
        <input {...register('name', { required: true })} placeholder="Nome" className="border rounded px-3 py-2" />
        <input {...register('phone', { required: true })} placeholder="Telefone" className="border rounded px-3 py-2" />
        <input {...register('email')} placeholder="E-mail (opcional)" className="border rounded px-3 py-2" />
        <input {...register('password', { required: true })} type="password" placeholder="Senha" className="border rounded px-3 py-2" />
        <button className="bg-emerald-700 text-white rounded py-2">Cadastrar</button>
      </form>
      <p className="text-sm text-center mt-4">
        Já tem conta? <Link to="/login" className="underline">Entrar</Link>
      </p>
    </div>
  );
}
