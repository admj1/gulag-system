# Especificação — Sistema de Gestão da Pelada

## Contexto

Aplicação web para gerenciar uma pelada de futebol semanal (todo sábado), substituindo o processo atual feito por WhatsApp e ata em papel. O sistema cobre: confirmação de presença, sorteio de times, lançamento de súmula, controle financeiro e estatísticas.

## Perfis de usuário

* **Admin (organizador/financeiro)**: acesso total. Cadastra jogadores, define fechamento da lista, lança súmula, sorteia/ajusta times, controla pagamentos.
* **Jogador**: precisa estar logado para acessar o sistema. Pode confirmar presença semanal, incluir diaristas e visualizar estatísticas de todos os jogadores (suas e dos demais). Não edita dados de partida nem tem acesso ao financeiro.

## Jogadores

* 20 mensalistas fixos + diaristas variáveis
* 4 goleiros cadastrados fixos; qualquer jogador pode convidar goleiros extras
* Cada jogador tem: nome, foto (opcional), posição, nível/estrelas, status (mensalista/diarista/goleiro)

## Fluxo semanal — Confirmação de presença

1. Toda semana, o sistema abre uma lista de confirmação com os 20 mensalistas listados.
2. Diaristas podem se inscrever em campo separado; ordem de inscrição = ordem de prioridade (fila). Mensalistas podem incluir diaristas.
3. Jogadores logados confirmam presença com um clique (equivalente ao emoji no WhatsApp).
4. A lista fecha automaticamente toda **sexta-feira às 17:00**.
5. Ao fechar: sistema calcula quantos mensalistas confirmaram e, com base nas vagas restantes até 20, confirma os diaristas por ordem de fila.
6. Quem confirmou e não comparecer no sábado é marcado para multa de R$15,00 (aplicada automaticamente se marcado como "ausente" na súmula).

## Sorteio de times

* Após fechar a lista de 20 confirmados, sistema sugere times equilibrados automaticamente com base no nível/estrelas de cada jogador (algoritmo simples de balanceamento por soma/média de estrelas).
* Goleiros não são alocados.
* Admin pode ajustar manualmente o sorteio antes de finalizar (drag-and-drop entre times, se possível).

## Súmula (lançamento pós-jogo, feito só pelo admin)

Baseado na ata em papel usada hoje. Para cada jogador de linha, por partida:

* Gols
* Vitorias/Empates/Derrotas por time para saber quem foi o melhor time do dia.
* Assistências
* Cartão amarelo / azul / vermelho
* Faltou (ausência, mesmo tendo confirmado)

Para goleiros, tabela separada por partida:

* Vitória / derrota / empate
* Pênaltis defendidos
* Assistências
* Gols

## Financeiro (painel do admin)

* Controle de mensalidade: R$50,00/mês por mensalista — status pago/pendente por mês, marcado manualmente pelo admin (sem integração de pagamento/Pix).
* Controle de diária: R$15,00 por diarista por dia jogado.
* Controle de multas: R$15,00 por confirmação + ausência.
* Goleiros isentos de qualquer cobrança.
* Função de bloquear cadastro por débitos (jogador não consegue confirmar o nome na lista) ou aplicar suspensão disciplinar (jogador deverá ver a mensagem informando motivo no bloqueio).
* Painel deve mostrar: quem está em atraso, valores pendentes, histórico de pagamentos por jogador.

## Estatísticas e página do jogador

Cada jogador tem uma página própria (visível a todos os logados) com:

* Nº de peladas jogadas
* Total de gols, assistências, cartões (por tipo), faltas/ausências
* Contra quais jogadores tem mais vitórias/derrotas
* Contra quais goleiros tem mais vitórias/derrotas
* Para goleiros: vitórias, derrotas, pênaltis defendidos, assistências, gols, também comparado por adversário

Deve haver também um painel geral com rankings (artilheiro, garçom/assistências, etc.) por temporada/geral.

## Decisões técnicas já definidas

* Plataforma: **web app** (responsivo, funciona bem no navegador do celular) — não é necessário app nativo.
* Lançamento de dados da partida: feito só pelo admin, depois do jogo, a partir da ata em papel (não em tempo real).
* Pagamento: apenas controle manual, sem gateway de pagamento integrado.
* Autenticação: obrigatória para todos os jogadores (login simples, ex. e-mail/senha ou número de telefone).


## Em aberto (decidir antes ou durante a construção)

* Como cadastrar os jogadores inicialmente (import manual pelo admin vs. auto-cadastro): ambas as opções, porém o jogador deverá cadastrar sua senha e vincular um telefone.
* Regra exata do algoritmo de balanceamento por estrelas (quem define as estrelas de cada jogador? o admin manualmente, ou baseado em desempenho histórico?): admin manualmente mas sistema recomenda alteração baseado no histórico.
* Histórico: o sistema deve manter dados por "temporada" (ex: ano) ou é tudo acumulado desde o início?: Por temporada.
* Notificações (ex: lembrete de fechamento da lista sexta às 17h) — via e-mail, WhatsApp, ou só dentro do site?: Isso será definido futuramente.
* Como os mensalistas mudam conforme o tempo, o admin terá a opção de  promover um jogador a mensalista ou rebaixar a diarista. É interessante que fique registrado no histórico. Ao promover ou rebaixar, o sistema pergunta a data de inicio e de término respectivamente que o jogador se tornou mensalista. Exemplo: João é mensalista, quando for retirado, o sistema perguntará a partir de qual mês ele não será mais mensalista, dessa forma o sistema não cobra mais mensalidade nem aloca ele na ata automaticamente.
* 

USO FUTURO: ABA DE TORNEIOS; ABA DE FOTOS DA PELADA.

