// Limpa caracteres Unicode invisiveis de formatacao bidirecional (ex.: o
// U+202C que o WhatsApp e outros apps grudam ao redor de numero de telefone
// copiado). Sem isso, dois telefones que parecem identicos na tela podem
// contar como valores DIFERENTES para a restricao UNIQUE do banco — foi
// assim que surgiu um cadastro fantasma duplicado (ver migration
// 020_limpa_telefones_invisiveis.sql). Aplicar na entrada evita que o
// problema volte.
const INVISIVEIS = /[​-‏‪-‮⁠-⁩﻿]/g;

function limpaTelefone(value) {
  if (value === null || value === undefined) return value;
  return String(value).replace(INVISIVEIS, '').trim();
}

module.exports = { limpaTelefone };
