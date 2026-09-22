-- Numeros de telefone colados de apps como WhatsApp as vezes trazem um
-- caractere Unicode invisivel de formatacao bidirecional (ex.: U+202C). Como
-- o telefone e UNICO no banco, "81988396415" e "81988396415" + esse
-- caractere invisivel contam como valores DIFERENTES para a restricao
-- UNIQUE — os dois numeros parecem identicos na tela, mas driblam a trava e
-- abrem espaco para um segundo cadastro fantasma da mesma pessoa.
--
-- Foi exatamente o caso do Sapo (jogador reportou nao conseguir entrar
-- mesmo apos o admin trocar a senha): o cadastro de verdade dele (com
-- historico de confirmacoes, diarias e sumula) tem o caractere invisivel no
-- telefone; um segundo cadastro vazio e inativo nasceu depois com o mesmo
-- numero "limpo" — e como o login busca por igualdade exata de telefone, a
-- pessoa digitando o numero normal caia nesse cadastro fantasma, inativo e
-- com a senha travada por tentativas erradas, nunca no de verdade. O mesmo
-- padrao apareceu em outro jogador (Wallmer), so que ao contrario: o
-- cadastro fantasma e o que tem o caractere invisivel, o de verdade ja
-- esta com o telefone limpo.
--
-- Este ajuste: 1) apaga so o lado vazio e inativo de cada par (zero
-- confirmacao, diaria, sumula, time ou auditoria — confere antes e aborta
-- se achar qualquer coisa, para nunca apagar cadastro com historico de
-- verdade); 2) limpa o caractere invisivel de todo telefone que sobrar,
-- para nenhum duplicado assim se formar de novo por essa via (a aplicacao
-- tambem passa a limpar isso na hora de salvar, ver controllers/authController.js
-- e controllers/playersController.js). Roda uma vez so.

CREATE TABLE IF NOT EXISTS one_off_fixes (
  name TEXT PRIMARY KEY,
  applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

DO $limpa_telefones$
DECLARE
  par RECORD;
  qtd_relacionados INT;
  qtd_pares INT := 0;
  qtd_telefones_limpos INT;
BEGIN
  IF EXISTS (SELECT 1 FROM one_off_fixes WHERE name = 'limpa_telefones_invisiveis_2026_09') THEN
    RAISE NOTICE 'Limpeza de telefones ja aplicada antes; nada a fazer.';
    RETURN;
  END IF;

  -- Acha pares de cadastros cujo telefone bate depois de tirar o caractere
  -- invisivel, mas nao bate literalmente (ou seja: um dos dois tem o
  -- caractere e o outro nao)
  FOR par IN
    SELECT a.id AS vazio_id, a.phone AS vazio_phone, b.id AS dono_id,
           TRIM(COALESCE(NULLIF(b.nickname, ''), b.first_name || ' ' || b.last_name)) AS dono_nome
    FROM players a
    JOIN players b ON b.id <> a.id
      AND regexp_replace(a.phone, '[​-‏‪-‮⁠-⁩﻿]', '', 'g')
        = regexp_replace(b.phone, '[​-‏‪-‮⁠-⁩﻿]', '', 'g')
      AND a.phone <> b.phone
    WHERE NOT a.active
  LOOP
    -- So apaga o lado "vazio": confere em toda tabela que referencia
    -- players(id) que este cadastro nunca teve nenhum lancamento de verdade
    SELECT
      (SELECT COUNT(*) FROM confirmations WHERE player_id = par.vazio_id OR invited_by_player_id = par.vazio_id)
      + (SELECT COUNT(*) FROM payments WHERE player_id = par.vazio_id)
      + (SELECT COUNT(*) FROM player_match_stats WHERE player_id = par.vazio_id)
      + (SELECT COUNT(*) FROM goalkeeper_match_stats WHERE player_id = par.vazio_id)
      + (SELECT COUNT(*) FROM team_players WHERE player_id = par.vazio_id)
      + (SELECT COUNT(*) FROM player_status_history WHERE player_id = par.vazio_id)
      + (SELECT COUNT(*) FROM match_events WHERE player_id = par.vazio_id OR created_by = par.vazio_id)
      + (SELECT COUNT(*) FROM audit_log WHERE actor_id = par.vazio_id OR target_id = par.vazio_id)
      + (SELECT COUNT(*) FROM registration_requests WHERE reviewed_by = par.vazio_id OR created_player_id = par.vazio_id)
    INTO qtd_relacionados;

    IF qtd_relacionados > 0 THEN
      RAISE EXCEPTION 'Cadastro id % (telefone %, duplicado de % - %) tem % lancamento(s) — nao e um fantasma vazio, abortando para nao apagar dado de verdade',
        par.vazio_id, par.vazio_phone, par.dono_id, par.dono_nome, qtd_relacionados;
    END IF;

    RAISE NOTICE 'Apagando cadastro fantasma id % (inativo, telefone %, sem nenhum lancamento) — duplicado de % (%)',
      par.vazio_id, par.vazio_phone, par.dono_id, par.dono_nome;
    DELETE FROM players WHERE id = par.vazio_id;
    qtd_pares := qtd_pares + 1;
  END LOOP;

  -- So agora, com os duplicados fora do caminho, limpa o caractere
  -- invisivel de todo telefone que ainda tiver um
  UPDATE players
  SET phone = regexp_replace(phone, '[​-‏‪-‮⁠-⁩﻿]', '', 'g')
  WHERE phone ~ '[​-‏‪-‮⁠-⁩﻿]';
  GET DIAGNOSTICS qtd_telefones_limpos = ROW_COUNT;

  INSERT INTO one_off_fixes (name) VALUES ('limpa_telefones_invisiveis_2026_09');
  RAISE NOTICE 'Limpeza concluida: % cadastro(s) fantasma apagado(s), % telefone(s) limpo(s) de caractere invisivel.',
    qtd_pares, qtd_telefones_limpos;
END
$limpa_telefones$;
