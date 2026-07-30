import { useState } from 'react';
import toast from 'react-hot-toast';
import api from '../../api/client';
import { inputClass, Button, Card, Field } from '../../components/ui';

export default function AdminWhatsappPage() {
  const [text, setText] = useState('');
  const [result, setResult] = useState(null);
  const [saving, setSaving] = useState(false);

  async function confirmBatch() {
    setSaving(true);
    try {
      const { data } = await api.post('/integrations/whatsapp/confirm-batch', { text });
      setResult(data);
      toast.success(`${data.confirmed.length} presença(s) confirmada(s)`);
    } catch (err) {
      toast.error(err.response?.data?.error || 'Erro ao confirmar em lote');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <Card title="Confirmar pelo telefone">
        <Field label="Cole aqui a conversa ou a lista de telefones do grupo">
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={8}
            placeholder={'+55 81 99789-5053\n81 98812-9412 confirmado\n...'}
            className={`${inputClass} font-mono text-sm`}
          />
        </Field>
        <div className="mt-3">
          <Button onClick={confirmBatch} disabled={!text.trim() || saving}>
            {saving ? 'Confirmando...' : 'Confirmar presenças'}
          </Button>
        </div>
        <p className="text-xs text-gray-500 mt-3">
          O sistema procura todo número de telefone no texto e confirma a presença de quem estiver
          cadastrado, na pelada com lista aberta. A comparação usa os 8 últimos dígitos, então
          funciona com ou sem +55 e DDD.
        </p>
      </Card>

      {result && (
        <Card title="Resultado">
          <p className="text-sm text-emerald-400 mb-2">
            Confirmados ({result.confirmed.length})
          </p>
          {result.confirmed.length > 0 ? (
            <ol className="text-sm text-gray-200 flex flex-col gap-1 mb-4">
              {result.confirmed.map((p, i) => <li key={p.id}>{i + 1}. {p.name}</li>)}
            </ol>
          ) : (
            <p className="text-sm text-gray-500 mb-4">Nenhum.</p>
          )}

          {result.notFound.length > 0 && (
            <>
              <p className="text-sm text-amber-400 mb-2">
                Não reconhecidos ({result.notFound.length})
              </p>
              <ul className="text-sm text-gray-400 flex flex-col gap-1">
                {result.notFound.map((phone) => <li key={phone}>{phone}</li>)}
              </ul>
              <p className="text-xs text-gray-500 mt-2">
                Esses números não estão cadastrados em nenhum jogador (ou mais de um jogador
                tem o mesmo final). Complete o cadastro em Jogadores para o sistema reconhecer.
              </p>
            </>
          )}
        </Card>
      )}
    </div>
  );
}
