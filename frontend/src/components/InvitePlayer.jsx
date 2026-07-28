import { useState } from 'react';
import toast from 'react-hot-toast';
import api from '../api/client';
import { inputClass, Button, Card, Field } from './ui';

// Qualquer jogador pode colocar alguem na lista: escolhe um cadastrado ou digita um nome novo
export default function InvitePlayer({ matchdayId, candidates, onInvited }) {
  const [mode, setMode] = useState('existing');
  const [playerId, setPlayerId] = useState('');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [playerType, setPlayerType] = useState('diarista');
  const [saving, setSaving] = useState(false);

  async function invite() {
    setSaving(true);
    try {
      const payload = mode === 'existing'
        ? { player_id: Number(playerId) }
        : { first_name: firstName.trim(), last_name: lastName.trim(), player_type: playerType };

      const { data } = await api.post(`/matchdays/${matchdayId}/invites`, payload);
      toast.success(`Incluído na lista (${data.queue_position}º da fila)`);
      setPlayerId('');
      setFirstName('');
      setLastName('');
      onInvited();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Erro ao incluir na lista');
    } finally {
      setSaving(false);
    }
  }

  const canSubmit = mode === 'existing' ? !!playerId : firstName.trim().length > 1;

  return (
    <Card title="Colocar alguém na lista">
      <div className="flex gap-2 mb-3">
        <Button
          variant={mode === 'existing' ? 'primary' : 'secondary'}
          onClick={() => setMode('existing')}
        >
          Já cadastrado
        </Button>
        <Button
          variant={mode === 'new' ? 'primary' : 'secondary'}
          onClick={() => setMode('new')}
        >
          Novo nome
        </Button>
      </div>

      {mode === 'existing' ? (
        <Field label="Quem você quer incluir?">
          <select value={playerId} onChange={(e) => setPlayerId(e.target.value)} className={inputClass}>
            <option value="">Selecione...</option>
            {candidates.map((p) => (
              <option key={p.id} value={p.id}>{p.name} ({p.player_type})</option>
            ))}
          </select>
        </Field>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Nome *">
            <input value={firstName} onChange={(e) => setFirstName(e.target.value)} className={inputClass} />
          </Field>
          <Field label="Sobrenome">
            <input value={lastName} onChange={(e) => setLastName(e.target.value)} className={inputClass} />
          </Field>
          <Field label="Entra como">
            <select value={playerType} onChange={(e) => setPlayerType(e.target.value)} className={inputClass}>
              <option value="diarista">Diarista</option>
              <option value="goleiro">Goleiro</option>
            </select>
          </Field>
        </div>
      )}

      <div className="mt-3">
        <Button onClick={invite} disabled={!canSubmit || saving}>
          {saving ? 'Incluindo...' : 'Incluir na lista'}
        </Button>
      </div>
      <p className="text-xs text-gray-500 mt-2">
        Diaristas entram por ordem de inscrição e ocupam as vagas que sobrarem dos mensalistas.
      </p>
    </Card>
  );
}
