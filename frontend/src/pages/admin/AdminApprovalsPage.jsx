import { useCallback, useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import toast from 'react-hot-toast';
import api from '../../api/client';
import Modal from '../../components/Modal';
import { inputClass, Button, Card, Field, EmptyState } from '../../components/ui';

function formatDateTime(iso) {
  return new Date(iso).toLocaleString('pt-BR', {
    day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit',
  });
}

export default function AdminApprovalsPage() {
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(false);
  const [rejecting, setRejecting] = useState(null); // solicitacao selecionada para recusar

  const load = useCallback(() => {
    setLoading(true);
    api.get('/registration-requests')
      .then(({ data }) => setRequests(data))
      .catch((err) => toast.error(err.response?.data?.error || 'Erro ao carregar solicitações'))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { load(); }, [load]);

  async function approve(request) {
    try {
      await api.post(`/registration-requests/${request.id}/approve`);
      toast.success(`${request.first_name} foi aprovado e já pode entrar`);
      load();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Erro ao aprovar solicitação');
    }
  }

  async function reject(request, reason) {
    try {
      await api.post(`/registration-requests/${request.id}/reject`, { reason });
      toast.success('Solicitação recusada');
      setRejecting(null);
      load();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Erro ao recusar solicitação');
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <Card title={`Solicitações pendentes (${requests.length})`}>
        <p className="text-xs text-gray-500 mb-3">
          Pedidos de cadastro enviados pela tela pública. Aprovar cria o cadastro com os dados e a
          senha que a pessoa escolheu; recusar não cria nada.
        </p>

        {requests.length === 0 && !loading ? (
          <EmptyState>Nenhuma solicitação pendente.</EmptyState>
        ) : (
          <div className="flex flex-col gap-2">
            {requests.map((r) => (
              <div key={r.id} className="border border-gulag-border rounded p-3">
                <p className="text-gray-100">
                  {r.first_name} {r.last_name}
                  {r.nickname && <span className="text-gray-500 text-sm"> ({r.nickname})</span>}
                </p>
                <p className="text-xs text-gray-500">
                  {r.phone}{r.email ? ` · ${r.email}` : ''} · solicitado em {formatDateTime(r.created_at)}
                </p>
                <div className="flex gap-2 mt-2">
                  <Button onClick={() => approve(r)}>Aprovar</Button>
                  <Button variant="danger" onClick={() => setRejecting(r)}>Recusar</Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>

      {rejecting && (
        <RejectModal
          request={rejecting}
          onClose={() => setRejecting(null)}
          onConfirm={(reason) => reject(rejecting, reason)}
        />
      )}
    </div>
  );
}

function RejectModal({ request, onClose, onConfirm }) {
  const { register, handleSubmit, formState } = useForm({ defaultValues: { reason: '' } });

  async function onSubmit({ reason }) {
    await onConfirm(reason);
  }

  return (
    <Modal title={`Recusar ${request.first_name} ${request.last_name}`} onClose={onClose}>
      <form onSubmit={handleSubmit(onSubmit)} className="grid gap-3">
        <Field label="Motivo (opcional, fica só no seu histórico)">
          <textarea {...register('reason')} rows={3} className={inputClass} />
        </Field>
        <div className="flex gap-2 justify-end">
          <Button type="button" variant="secondary" onClick={onClose}>Cancelar</Button>
          <Button type="submit" variant="danger" disabled={formState.isSubmitting}>Recusar</Button>
        </div>
      </form>
    </Modal>
  );
}
