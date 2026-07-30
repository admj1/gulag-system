// Guarda simples de edicoes nao salvas. Fica fora do React para poder ser
// consultada tanto pelos links da sidebar quanto pelo aviso do navegador.
let dirty = false;
let message = 'Você tem alterações não salvas. Sair agora vai descartar tudo.';

function onBeforeUnload(event) {
  event.preventDefault();
  event.returnValue = message;
  return message;
}

export function setUnsaved(value, customMessage) {
  dirty = !!value;
  if (customMessage) message = customMessage;

  if (dirty) window.addEventListener('beforeunload', onBeforeUnload);
  else window.removeEventListener('beforeunload', onBeforeUnload);
}

export function hasUnsaved() {
  return dirty;
}

// Retorna true quando pode navegar (nao ha pendencia ou o usuario confirmou sair)
export function confirmLeave() {
  if (!dirty) return true;
  const ok = window.confirm(message);
  if (ok) setUnsaved(false);
  return ok;
}
