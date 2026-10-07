// Textos e formatos usados em mais de uma tela do torneio

export const TOURNAMENT_STATUS = {
  inscricoes: 'Inscrições abertas',
  draft: 'Draft',
  grupos: 'Fase de grupos',
  mata_mata: 'Mata-mata',
  encerrado: 'Encerrado',
};

export const STAGE_LABEL = { grupo: 'Grupo', semi: 'Semifinal', final: 'Final' };

export function reais(valor) {
  return `R$ ${Number(valor || 0).toFixed(2).replace('.', ',')}`;
}

// "Grupo A · Jogo 3", "Semifinal", "Final"
export function rotuloPartida(m) {
  return m.stage === 'grupo' ? `Grupo ${m.group_label} · Jogo ${m.order_num}` : STAGE_LABEL[m.stage];
}
