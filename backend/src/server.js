require('dotenv').config();
const path = require('path');
const fs = require('fs');
const os = require('os');
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const jwt = require('jsonwebtoken');

const authRoutes = require('./routes/auth');
const playersRoutes = require('./routes/players');
const matchdaysRoutes = require('./routes/matchdays');
const financeRoutes = require('./routes/finance');
const statsRoutes = require('./routes/stats');
const seasonsRoutes = require('./routes/seasons');
const settingsRoutes = require('./routes/settings');
const integrationsRoutes = require('./routes/integrations');
const auditRoutes = require('./routes/audit');
const { scheduleWeeklyClose } = require('./jobs/closeWeeklyList');
const { scheduleWeeklyBackup } = require('./jobs/weeklyBackup');

const app = express();

// Atras do proxy do Railway, para o limite de requisicoes valer por pessoa
// e nao somar todo mundo no IP do proxy
app.set('trust proxy', 1);

app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      ...helmet.contentSecurityPolicy.getDefaultDirectives(),
      // As fotos dos jogadores ficam no Cloudinary
      'img-src': ["'self'", 'data:', 'https://res.cloudinary.com'],
    },
  },
}));
app.use(cors());
app.use(express.json());

app.get('/health', (req, res) => res.json({ status: 'ok' }));

// Versao do que esta no ar: o app compara com a que ele carregou e avisa quem
// esta com a pagina aberta que saiu publicacao nova. No Railway vem o commit;
// fora dele, o horario em que o servidor subiu — que tambem muda a cada deploy.
const DEPLOY_VERSION = process.env.RAILWAY_GIT_COMMIT_SHA
  || process.env.RAILWAY_DEPLOYMENT_ID
  || String(Date.now());

app.get('/api/version', (req, res) => res.json({ version: DEPLOY_VERSION }));

app.use('/uploads', express.static(path.join(__dirname, '..', 'uploads')));

// Loga o jogador quando o token e valido, para o limite valer por pessoa, nao
// por IP: numa pelada todo mundo costuma estar na mesma rede (wifi do campo,
// hotspot), e um limite por IP faz o grupo inteiro dividir a mesma cota — foi
// isso que travou o sistema no dia em que a ATA foi lancada. Sem token valido
// (tela de login) cai para o IP, que e a unica coisa disponivel ali.
function rateLimitKey(req) {
  const header = req.headers.authorization;
  if (header?.startsWith('Bearer ')) {
    try {
      const { id } = jwt.verify(header.slice('Bearer '.length), process.env.JWT_SECRET);
      return `user:${id}`;
    } catch {
      // token invalido ou expirado: usa o IP mesmo
    }
  }
  return req.ip;
}

// Leitura (GET) fica de fora do limite: abrir telas nao gasta recurso do banco
// como uma escrita gasta, e foi rajada de GET (todo mundo navegando ao mesmo
// tempo) que travou o sistema no dia do lancamento da ATA — nao adianta reduzir
// so o numero se o que estoura a cota nem e o que precisa ser contido. O limite
// vale para quem grava algo (POST/PATCH/DELETE), que e o que de fato pesa.
app.use('/api', rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 1000,
  keyGenerator: rateLimitKey,
  skip: (req) => req.method === 'GET',
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Muitas requisições em pouco tempo. Aguarde um instante e tente de novo.' },
}));

// Login e cadastro ainda nao tem token, entao caem no limite por IP acima; aqui
// e so uma trava extra contra tentativa de forca bruta — a conta em si ja se
// autobloqueia apos 5 senhas erradas (ver authController).
app.use('/api/auth', rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Muitas tentativas em pouco tempo. Aguarde um instante e tente de novo.' },
}));

app.use('/api/auth', authRoutes);
app.use('/api/players', playersRoutes);
app.use('/api/matchdays', matchdaysRoutes);
app.use('/api/finance', financeRoutes);
app.use('/api/stats', statsRoutes);
app.use('/api/seasons', seasonsRoutes);
app.use('/api/settings', settingsRoutes);
app.use('/api/integrations', integrationsRoutes);
app.use('/api/audit-log', auditRoutes);

const frontendDist = path.join(__dirname, '..', '..', 'frontend', 'dist');
if (fs.existsSync(frontendDist)) {
  app.use(express.static(frontendDist));
  app.get(/^\/(?!api\/).*/, (req, res) => {
    res.sendFile(path.join(frontendDist, 'index.html'));
  });
}

app.use((err, req, res, next) => {
  console.error(err);
  res.status(err.status || 500).json({ error: err.message || 'Erro interno' });
});

const PORT = process.env.PORT || 3001;
// 0.0.0.0 aceita conexoes da rede local, para abrir o sistema pelo celular
const HOST = process.env.HOST || '0.0.0.0';

app.listen(PORT, HOST, () => {
  console.log(`Servidor rodando na porta ${PORT}`);
  console.log(`  neste computador: http://localhost:${PORT}`);
  for (const [, addresses] of Object.entries(os.networkInterfaces())) {
    for (const address of addresses || []) {
      if (address.family === 'IPv4' && !address.internal) {
        console.log(`  na rede (celular): http://${address.address}:${PORT}`);
      }
    }
  }
});
scheduleWeeklyClose();
scheduleWeeklyBackup();
