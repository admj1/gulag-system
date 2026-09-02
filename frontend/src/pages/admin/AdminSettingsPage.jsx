import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import toast from 'react-hot-toast';
import api from '../../api/client';
import { inputClass, Button, Card, Field, EmptyState, matchDateLabel } from '../../components/ui';

export default function AdminSettingsPage() {
  const { register, handleSubmit, reset, formState } = useForm();
  const [settings, setSettings] = useState(null);

  useEffect(() => {
    api.get('/settings').then(({ data }) => {
      setSettings(data);
      reset({
        monthly_fee: data.monthly_fee,
        daily_fee: data.daily_fee,
        absence_fine: data.absence_fine,
        match_time: data.match_time?.slice(0, 5),
      });
    });
  }, [reset]);

  async function onSubmit(values) {
    try {
      await api.put('/settings', values);
      toast.success('Configurações salvas');
    } catch (err) {
      toast.error(err.response?.data?.error || 'Erro ao salvar configurações');
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <Card title="Configurações da pelada">
        <form onSubmit={handleSubmit(onSubmit)} className="grid gap-3 sm:grid-cols-2">
          <Field label="Mensalidade (R$)">
            <input {...register('monthly_fee')} type="number" step="0.01" min="0" className={inputClass} />
          </Field>
          <Field label="Diária (R$)">
            <input {...register('daily_fee')} type="number" step="0.01" min="0" className={inputClass} />
          </Field>
          <Field label="Multa por ausência (R$)">
            <input {...register('absence_fine')} type="number" step="0.01" min="0" className={inputClass} />
          </Field>
          <Field label="Horário da pelada">
            <input {...register('match_time')} type="time" className={inputClass} />
          </Field>
          <div className="sm:col-span-2">
            <Button disabled={formState.isSubmitting}>Salvar configurações</Button>
          </div>
        </form>
        <p className="text-xs text-gray-500 mt-3">
          Os valores são aplicados nas próximas cobranças geradas (diárias e multas saem automaticamente
          ao salvar a súmula).
        </p>
      </Card>

      {settings && <InviteTemplateCard settings={settings} onSaved={setSettings} />}

      <BackupCard />
    </div>
  );
}

// Backup semanal: todo domingo de madrugada o sistema manda uma copia de
// tudo (jogadores, peladas, sumulas, pagamentos...) por e-mail para os
// admins. O botao aqui e so para testar sem esperar o domingo.
function BackupCard() {
  const [sending, setSending] = useState(false);

  async function sendNow() {
    setSending(true);
    try {
      const { data } = await api.post('/settings/backup-now');
      if (data.tooGrande) {
        toast.error('O backup ficou grande demais para anexar por e-mail. Veja o log do Railway.');
      } else {
        toast.success(
          `Backup enviado para ${data.sent} de ${data.recipients} admin(s) — ${data.rows} linha(s), `
          + `${(data.bytes / 1024).toFixed(0)} KB.`
        );
      }
    } catch (err) {
      toast.error(err.response?.data?.error || 'Erro ao gerar o backup');
    } finally {
      setSending(false);
    }
  }

  return (
    <Card title="Backup semanal">
      <p className="text-xs text-gray-500 mb-3">
        Todo domingo de madrugada o sistema manda uma cópia completa do banco (jogadores, peladas,
        súmulas, pagamentos...) por e-mail para os administradores com e-mail cadastrado —
        independente de qualquer coisa no Railway. Use o botão abaixo para testar agora, sem
        esperar o domingo.
      </p>
      <Button variant="secondary" onClick={sendNow} disabled={sending}>
        {sending ? 'Gerando e enviando...' : '📦 Enviar backup agora'}
      </Button>
    </Card>
  );
}

// Valores de exemplo da previa: so para o admin ver o formato antes de salvar
const SAMPLE = {
  nome: 'Mateta',
  data: 'sábado, 08/08/2026',
  horario: '07:00',
  prazo: 'sexta-feira, 07/08, 17:00',
  link: '#',
  logo: '<div style="width:64px;height:64px;border-radius:8px;background:#2dd8d3;color:#0b0d10;'
    + 'font:bold 11px Arial;display:flex;align-items:center;justify-content:center;margin:0 0 12px">LOGO</div>',
  como_entra: 'Confirme seu nome para garantir a vaga.',
};

const FIELDS = [
  ['{{nome}}', 'nome do jogador'],
  ['{{data}}', 'data da pelada por extenso'],
  ['{{horario}}', 'horário da pelada'],
  ['{{prazo}}', 'quando a lista fecha'],
  ['{{link}}', 'endereço da tela da pelada'],
  ['{{logo}}', 'logo embutido na mensagem'],
  ['{{como_entra}}', 'frase que muda para diarista'],
];

function renderPreview(template) {
  return String(template).replace(
    /\{\{\s*(\w+)\s*\}\}/g,
    (original, key) => (key in SAMPLE ? SAMPLE[key] : original)
  );
}

function InviteTemplateCard({ settings, onSaved }) {
  const defaultHtml = settings.invite_html_default || '';
  const [html, setHtml] = useState(settings.invite_html || defaultHtml);
  const [showPreview, setShowPreview] = useState(false);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);

  const usingDefault = !settings.invite_html;

  async function save(value) {
    setSaving(true);
    try {
      const { data } = await api.put('/settings', { invite_html: value });
      onSaved(data);
      setHtml(data.invite_html || data.invite_html_default || '');
      toast.success(
        data.invite_html ? 'Modelo do e-mail salvo' : 'Voltou para o modelo padrão'
      );
    } catch (err) {
      toast.error(err.response?.data?.error || 'Erro ao salvar o modelo');
    } finally {
      setSaving(false);
    }
  }

  // Teste do modelo salvo, sempre só para o próprio admin. Usa a pelada mais
  // recente porque o convite precisa de uma data e de um link de verdade.
  async function sendTest() {
    setTesting(true);
    try {
      const { data: matchdays } = await api.get('/matchdays');
      const target = matchdays[0];
      if (!target) {
        toast.error('Lance uma pelada primeiro — o teste usa os dados de uma pelada real.');
        return;
      }
      const { data } = await api.post(`/matchdays/${target.id}/notify`, { test: true });
      if (data.sent > 0) {
        toast.success(`Teste enviado só para você (pelada de ${matchDateLabel(target.match_date)}).`);
      } else {
        toast.error(data.lastError || 'O servidor não conseguiu enviar. Veja o log do Railway.');
      }
    } catch (err) {
      toast.error(err.response?.data?.error || 'Erro ao enviar o teste');
    } finally {
      setTesting(false);
    }
  }

  return (
    <Card
      title="E-mail de convite"
      action={
        <Button variant="secondary" onClick={() => setShowPreview((v) => !v)}>
          {showPreview ? 'Editar' : 'Ver prévia'}
        </Button>
      }
    >
      <p className="text-xs text-gray-500 mb-2">
        HTML do corpo do e-mail que avisa da pelada nova.
        {usingDefault
          ? ' Está usando o modelo padrão do sistema.'
          : ' Está usando um modelo personalizado.'}
      </p>

      <div className="flex flex-wrap gap-x-3 gap-y-1 mb-3">
        {FIELDS.map(([field, hint]) => (
          <span key={field} className="text-[11px] text-gray-500">
            <code className="text-gulag-cyan">{field}</code> {hint}
          </span>
        ))}
      </div>

      {showPreview ? (
        html.trim() ? (
          <iframe
            title="Prévia do e-mail"
            srcDoc={renderPreview(html)}
            sandbox=""
            className="w-full h-[420px] rounded border border-gulag-border bg-white"
          />
        ) : (
          <EmptyState>Nada para mostrar — o modelo está vazio.</EmptyState>
        )
      ) : (
        <textarea
          value={html}
          onChange={(e) => setHtml(e.target.value)}
          spellCheck={false}
          className={`${inputClass} font-mono text-xs h-[420px] leading-relaxed`}
        />
      )}

      <div className="flex gap-2 flex-wrap mt-3">
        <Button onClick={() => save(html)} disabled={saving}>
          {saving ? 'Salvando...' : 'Salvar modelo'}
        </Button>
        <Button variant="secondary" onClick={sendTest} disabled={testing || saving}>
          {testing ? 'Enviando...' : '✉ Enviar teste para mim'}
        </Button>
        <Button variant="secondary" onClick={() => setHtml(defaultHtml)} disabled={saving}>
          Carregar modelo padrão
        </Button>
        {!usingDefault && (
          <Button variant="danger" onClick={() => save('')} disabled={saving}>
            Voltar ao padrão
          </Button>
        )}
      </div>

      <p className="text-xs text-gray-500 mt-3">
        O teste manda o convite de verdade, com os dados da pelada mais recente, mas só para o seu
        e-mail — mais ninguém recebe. A versão em texto puro que acompanha a mensagem continua sendo
        montada pelo sistema: é a reserva para quem lê e-mail em modo simples.
      </p>
    </Card>
  );
}
