// Arte do jogador para postar nas redes (PNG 1080x1350, formato de feed que
// tambem fica bem no story e no status do zap).
//
// Desenhada aqui no navegador com canvas, e nao por uma IA de imagem, por um
// motivo pratico: nesta arte o texto PRECISA sair exato — nome, pontuacao e
// numeros da temporada. IA generativa erra texto (o "218" vira "2I8", o nome
// sai trocado) e nao reproduz o hex da paleta nem o logo. Desenhando na mao
// sai identico a identidade do app, na hora, de graca e sem servico externo.

const W = 1080;
const H = 1350;

// Mesma paleta do app (ver frontend/src/index.css)
const CORES = {
  fundo: '#0b0d10',
  superficie: '#16191e',
  borda: '#262b33',
  ciano: '#2dd8d3',
  cianoEscuro: '#1aa8a4',
  texto: '#e5e7eb',
  apagado: '#8b93a1',
};

const FONTE = "system-ui, 'Segoe UI', Roboto, sans-serif";
const MEDALHAS = { 1: '🥇', 2: '🥈', 3: '🥉' };

// Carrega imagem sem nunca "sujar" o canvas: com crossOrigin definido, uma
// origem sem CORS (ex.: CDN mal configurado) falha no onerror em vez de
// carregar e travar o toBlob depois. Falhou, segue sem a foto.
function carregaImagem(src) {
  return new Promise((resolve) => {
    if (!src) return resolve(null);
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = src;
  });
}

function retanguloArredondado(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

// Diminui a fonte ate o texto caber na largura — nome comprido nao pode
// vazar da arte nem ser cortado
function ajustaFonte(ctx, texto, larguraMax, tamanhoInicial, peso = 'bold') {
  let tamanho = tamanhoInicial;
  ctx.font = `${peso} ${tamanho}px ${FONTE}`;
  while (ctx.measureText(texto).width > larguraMax && tamanho > 22) {
    tamanho -= 2;
    ctx.font = `${peso} ${tamanho}px ${FONTE}`;
  }
  return tamanho;
}

// Desenha a imagem preenchendo o circulo (recorte tipo "cover", sem distorcer)
function fotoCircular(ctx, img, cx, cy, raio) {
  ctx.save();
  ctx.beginPath();
  ctx.arc(cx, cy, raio, 0, Math.PI * 2);
  ctx.clip();
  const escala = Math.max((raio * 2) / img.width, (raio * 2) / img.height);
  const largura = img.width * escala;
  const altura = img.height * escala;
  ctx.drawImage(img, cx - largura / 2, cy - altura / 2, largura, altura);
  ctx.restore();
}

function iniciais(nome) {
  return (nome || '?')
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((parte) => parte[0])
    .join('')
    .toUpperCase();
}

// O canvas soma o espacamento DEPOIS da ultima letra tambem, o que empurra
// texto centralizado meio espaco para a esquerda. Quando centralizado,
// devolve o deslocamento para compensar.
function comEspacamento(ctx, valor, desenhar) {
  const suporta = 'letterSpacing' in ctx;
  const anterior = suporta ? ctx.letterSpacing : null;
  if (suporta) ctx.letterSpacing = valor;
  const compensa = suporta && ctx.textAlign === 'center' ? parseFloat(valor) / 2 : 0;
  desenhar(compensa);
  if (suporta) ctx.letterSpacing = anterior;
}

// Bloco de um numero com legenda embaixo (usado na grade de estatisticas)
function estatistica(ctx, { valor, rotulo, cx, cy }) {
  ctx.textAlign = 'center';
  ctx.fillStyle = CORES.texto;
  ctx.font = `bold 62px ${FONTE}`;
  ctx.fillText(String(valor), cx, cy);

  ctx.fillStyle = CORES.apagado;
  const tamanho = ajustaFonte(ctx, rotulo, 290, 24, '600');
  ctx.font = `600 ${tamanho}px ${FONTE}`;
  comEspacamento(ctx, '1px', (dx) => ctx.fillText(rotulo, cx + dx, cy + 38));
}

// ---------------------------------------------------------------------------
// Fundos artisticos
//
// Sao desenhados (e nao imagens prontas) por tres motivos praticos: usam o hex
// exato da paleta, ficam nitidos em qualquer tamanho e nao somam megabytes de
// asset ao app. Todos ficam de proposito em alpha baixo: o fundo e moldura,
// quem tem que aparecer e o jogador.
// ---------------------------------------------------------------------------

const CIANO = (alfa) => `rgba(45, 216, 211, ${alfa})`;

// Cobre o miolo com a propria cor de fundo, deixando o desenho so nas bordas.
// E o que impede a textura de brigar com o nome e a pontuacao.
function desvaneceCentro(ctx, raio) {
  const g = ctx.createRadialGradient(W / 2, 560, 0, W / 2, 560, raio);
  g.addColorStop(0, CORES.fundo);
  g.addColorStop(0.65, CORES.fundo);
  g.addColorStop(1, 'rgba(11, 13, 16, 0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);
}

// Brilho suave atras da pontuacao
function fundoClassico(ctx) {
  const brilho = ctx.createRadialGradient(W / 2, 860, 0, W / 2, 860, 520);
  brilho.addColorStop(0, CIANO(0.16));
  brilho.addColorStop(1, CIANO(0));
  ctx.fillStyle = brilho;
  ctx.fillRect(0, 0, W, H);
}

// Campo visto de cima: faixas de corte, circulo central emoldurando a foto e
// arcos de escanteio
function fundoCampo(ctx) {
  const faixa = (W - 56) / 8;
  for (let i = 1; i < 8; i += 2) {
    ctx.fillStyle = CIANO(0.022);
    ctx.fillRect(28 + i * faixa, 28, faixa, H - 56);
  }

  ctx.strokeStyle = CIANO(0.12);
  ctx.lineWidth = 4;

  ctx.beginPath();
  ctx.moveTo(28, 400);
  ctx.lineTo(W - 28, 400);
  ctx.stroke();

  ctx.beginPath();
  ctx.arc(W / 2, 400, 250, 0, Math.PI * 2);
  ctx.stroke();

  ctx.beginPath();
  ctx.arc(W / 2, 400, 9, 0, Math.PI * 2);
  ctx.fillStyle = CIANO(0.18);
  ctx.fill();

  const cantos = [
    [28, 28, 0, Math.PI / 2],
    [W - 28, 28, Math.PI / 2, Math.PI],
    [W - 28, H - 28, Math.PI, Math.PI * 1.5],
    [28, H - 28, Math.PI * 1.5, Math.PI * 2],
  ];
  for (const [x, y, de, ate] of cantos) {
    ctx.beginPath();
    ctx.arc(x, y, 80, de, ate);
    ctx.stroke();
  }

  fundoClassico(ctx);
}

// Feixes de refletor descendo do alto, como luz de quadra
function fundoHolofote(ctx) {
  const feixes = [
    { x: 170, topo: 90, base: 520 },
    { x: W - 170, topo: 90, base: 520 },
    { x: W / 2, topo: 60, base: 760 },
  ];
  for (const feixe of feixes) {
    const luz = ctx.createLinearGradient(0, 0, 0, H);
    luz.addColorStop(0, CIANO(0.13));
    luz.addColorStop(0.55, CIANO(0.035));
    luz.addColorStop(1, CIANO(0));
    ctx.fillStyle = luz;
    ctx.beginPath();
    ctx.moveTo(feixe.x - feixe.topo / 2, 20);
    ctx.lineTo(feixe.x + feixe.topo / 2, 20);
    ctx.lineTo(feixe.x + feixe.base / 2, H);
    ctx.lineTo(feixe.x - feixe.base / 2, H);
    ctx.closePath();
    ctx.fill();
  }
}

// Malha tecnica nas bordas, com o miolo limpo
function fundoGrade(ctx) {
  ctx.strokeStyle = CIANO(0.16);
  ctx.lineWidth = 2;
  const passo = 60;
  for (let x = 28; x <= W - 28; x += passo) {
    ctx.beginPath();
    ctx.moveTo(x, 28);
    ctx.lineTo(x, H - 28);
    ctx.stroke();
  }
  for (let y = 28; y <= H - 28; y += passo) {
    ctx.beginPath();
    ctx.moveTo(28, y);
    ctx.lineTo(W - 28, y);
    ctx.stroke();
  }
  desvaneceCentro(ctx, 620);
  fundoClassico(ctx);
}

// Raios saindo de tras do jogador
function fundoRaios(ctx) {
  ctx.save();
  ctx.translate(W / 2, 430);
  const total = 24;
  for (let i = 0; i < total; i += 2) {
    ctx.fillStyle = CIANO(0.075);
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.arc(0, 0, 1500, (i / total) * Math.PI * 2, ((i + 1) / total) * Math.PI * 2);
    ctx.closePath();
    ctx.fill();
  }
  ctx.restore();
  desvaneceCentro(ctx, 480);
  fundoClassico(ctx);
}

// A ordem aqui e a ordem que aparece para o jogador escolher
export const FUNDOS = [
  { key: 'classico', label: 'Clássico', desenhar: fundoClassico },
  { key: 'campo', label: 'Campo', desenhar: fundoCampo },
  { key: 'holofote', label: 'Holofote', desenhar: fundoHolofote },
  { key: 'grade', label: 'Grade', desenhar: fundoGrade },
  { key: 'raios', label: 'Raios', desenhar: fundoRaios },
];

/**
 * Monta a arte do jogador e devolve um PNG (Blob).
 * Recebe a linha do Ranking Geral como ela ja vem da API.
 */
export async function gerarArteJogador({ player, seasonName, fundo = 'classico' }) {
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d');

  const [logo, foto] = await Promise.all([
    carregaImagem('/logo.jpeg'),
    carregaImagem(player.photo_url),
  ]);

  ctx.fillStyle = CORES.fundo;
  ctx.fillRect(0, 0, W, H);

  // Fundo escolhido pelo jogador (cai no classico se vier algo desconhecido)
  const estilo = FUNDOS.find((f) => f.key === fundo) || FUNDOS[0];
  estilo.desenhar(ctx);

  // Moldura
  ctx.strokeStyle = CORES.borda;
  ctx.lineWidth = 2;
  retanguloArredondado(ctx, 28, 28, W - 56, H - 56, 36);
  ctx.stroke();

  // ---- Cabecalho: logo + GULAG + temporada
  if (logo) fotoCircular(ctx, logo, 138, 138, 52);

  ctx.textAlign = 'left';
  ctx.fillStyle = CORES.ciano;
  ctx.font = `bold 56px ${FONTE}`;
  comEspacamento(ctx, '3px', () => ctx.fillText('GULAG', 210, 158));

  if (seasonName) {
    ctx.textAlign = 'right';
    ctx.fillStyle = CORES.apagado;
    ctx.font = `600 30px ${FONTE}`;
    comEspacamento(ctx, '2px', () => ctx.fillText(`TEMPORADA ${seasonName}`.toUpperCase(), W - 80, 152));
  }

  // ---- Foto do jogador com anel ciano
  const fotoCx = W / 2;
  const fotoCy = 400;
  const raio = 150;

  ctx.save();
  ctx.shadowColor = 'rgba(45, 216, 211, 0.45)';
  ctx.shadowBlur = 40;
  ctx.beginPath();
  ctx.arc(fotoCx, fotoCy, raio + 6, 0, Math.PI * 2);
  ctx.fillStyle = CORES.superficie;
  ctx.fill();
  ctx.restore();

  if (foto) {
    fotoCircular(ctx, foto, fotoCx, fotoCy, raio);
  } else {
    ctx.beginPath();
    ctx.arc(fotoCx, fotoCy, raio, 0, Math.PI * 2);
    ctx.fillStyle = CORES.superficie;
    ctx.fill();
    ctx.textAlign = 'center';
    ctx.fillStyle = CORES.ciano;
    ctx.font = `bold 110px ${FONTE}`;
    ctx.fillText(iniciais(player.name), fotoCx, fotoCy + 38);
  }

  ctx.beginPath();
  ctx.arc(fotoCx, fotoCy, raio + 6, 0, Math.PI * 2);
  ctx.strokeStyle = CORES.ciano;
  ctx.lineWidth = 6;
  ctx.stroke();

  // ---- Posicao no ranking
  const medalha = MEDALHAS[player.position];
  const posicao = `${medalha ? `${medalha} ` : ''}${player.position}º no Ranking Geral`;
  ctx.textAlign = 'center';
  ctx.fillStyle = CORES.ciano;
  const tamanhoPosicao = ajustaFonte(ctx, posicao, W - 200, 40, '600');
  ctx.font = `600 ${tamanhoPosicao}px ${FONTE}`;
  ctx.fillText(posicao, W / 2, 630);

  // ---- Nome
  ctx.fillStyle = CORES.texto;
  const tamanhoNome = ajustaFonte(ctx, player.name, W - 160, 76);
  ctx.font = `bold ${tamanhoNome}px ${FONTE}`;
  ctx.fillText(player.name, W / 2, 710);

  // ---- Pontuacao (maior hierarquia visual da arte)
  ctx.fillStyle = CORES.ciano;
  ctx.font = `bold 190px ${FONTE}`;
  ctx.fillText(String(player.points), W / 2, 910);

  ctx.fillStyle = CORES.apagado;
  ctx.font = `600 34px ${FONTE}`;
  comEspacamento(ctx, '6px', (dx) => ctx.fillText('PONTOS', W / 2 + dx, 962));

  // ---- Grade de estatisticas
  const painelY = 1005;
  const painelH = 252;
  ctx.fillStyle = CORES.superficie;
  retanguloArredondado(ctx, 70, painelY, W - 140, painelH, 28);
  ctx.fill();
  ctx.strokeStyle = CORES.borda;
  ctx.lineWidth = 2;
  retanguloArredondado(ctx, 70, painelY, W - 140, painelH, 28);
  ctx.stroke();

  const colunas = [250, 540, 830];
  const linhas = [painelY + 80, painelY + 188];
  const celulas = [
    { valor: player.goals, rotulo: 'GOLS' },
    { valor: player.assists, rotulo: 'ASSISTÊNCIAS' },
    { valor: player.presencas, rotulo: 'PRESENÇAS' },
    { valor: player.tp_count, rotulo: 'TIMES DA PELADA' },
    { valor: player.artilheiro_count, rotulo: 'ARTILHEIRO DO DIA' },
    { valor: player.garcom_count, rotulo: 'GARÇOM DO DIA' },
  ];
  celulas.forEach((celula, i) => {
    estatistica(ctx, {
      ...celula,
      cx: colunas[i % 3],
      cy: linhas[Math.floor(i / 3)],
    });
  });

  // ---- Rodape
  ctx.textAlign = 'center';
  ctx.fillStyle = CORES.cianoEscuro;
  ctx.font = `600 24px ${FONTE}`;
  comEspacamento(ctx, '3px', (dx) => ctx.fillText('GULAG SYSTEM', W / 2 + dx, H - 48));

  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error('Não foi possível gerar a imagem'))),
      'image/png'
    );
  });
}

/**
 * Abre o compartilhamento nativo do celular (Instagram, WhatsApp...). Onde
 * nao existe (navegador de computador), baixa o arquivo.
 */
export async function compartilharArte(blob, nomeArquivo) {
  const arquivo = new File([blob], nomeArquivo, { type: 'image/png' });

  if (navigator.canShare?.({ files: [arquivo] })) {
    try {
      await navigator.share({ files: [arquivo] });
      return 'compartilhado';
    } catch (err) {
      // Cancelar o menu de compartilhar nao e erro: nao cai para o download
      if (err.name === 'AbortError') return 'cancelado';
    }
  }

  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = nomeArquivo;
  link.click();
  URL.revokeObjectURL(url);
  return 'baixado';
}
