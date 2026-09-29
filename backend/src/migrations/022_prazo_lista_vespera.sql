-- O prazo da lista era gravado como a propria hora da pelada (07:00) em
-- UTC — ou seja, sabado 04:00 no horario de Brasilia. O convite mostrava
-- "a lista fecha sabado 04:00" e o fechamento automatico de sexta 17h nunca
-- pegava a lista, porque o prazo ainda nao tinha vencido.
--
-- O codigo ja cria a pelada com o prazo certo (vespera, 17:00 de Brasilia —
-- ver PRAZO_DA_LISTA_SQL em controllers/matchdaysController.js). Aqui so
-- acerta o prazo das peladas que ainda estao com a lista ABERTA; lista ja
-- fechada nao muda nada mexer. Idempotente: recalcula sempre para o mesmo
-- valor, pode rodar a cada deploy.
UPDATE matchdays
SET confirmation_deadline = ((match_date - 1) + TIME '17:00') AT TIME ZONE 'America/Sao_Paulo'
WHERE status = 'open'
  AND confirmation_deadline IS DISTINCT FROM (((match_date - 1) + TIME '17:00') AT TIME ZONE 'America/Sao_Paulo');
