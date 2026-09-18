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

/**
 * Monta a arte do jogador e devolve um PNG (Blob).
 * Recebe a linha do Ranking Geral como ela ja vem da API.
 */
export async function gerarArteJogador({ player, seasonName }) {
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d');

  const [logo, foto] = await Promise.all([
    carregaImagem('/logo.jpeg'),
    carregaImagem(player.photo_url),
  ]);

  // Fundo + brilho ciano suave atras da pontuacao
  ctx.fillStyle = CORES.fundo;
  ctx.fillRect(0, 0, W, H);

  const brilho = ctx.createRadialGradient(W / 2, 860, 0, W / 2, 860, 520);
  brilho.addColorStop(0, 'rgba(45, 216, 211, 0.16)');
  brilho.addColorStop(1, 'rgba(45, 216, 211, 0)');
  ctx.fillStyle = brilho;
  ctx.fillRect(0, 0, W, H);

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
