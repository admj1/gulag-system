require('dotenv').config();
const path = require('path');
const fs = require('fs');
const os = require('os');
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');

const authRoutes = require('./routes/auth');
const playersRoutes = require('./routes/players');
const matchdaysRoutes = require('./routes/matchdays');
const financeRoutes = require('./routes/finance');
const statsRoutes = require('./routes/stats');
const seasonsRoutes = require('./routes/seasons');
const settingsRoutes = require('./routes/settings');
const { scheduleWeeklyClose } = require('./jobs/closeWeeklyList');

const app = express();

app.use(helmet());
app.use(cors());
app.use(express.json());
app.use(rateLimit({ windowMs: 15 * 60 * 1000, max: 300 }));

app.get('/health', (req, res) => res.json({ status: 'ok' }));

app.use('/uploads', express.static(path.join(__dirname, '..', 'uploads')));

app.use('/api/auth', authRoutes);
app.use('/api/players', playersRoutes);
app.use('/api/matchdays', matchdaysRoutes);
app.use('/api/finance', financeRoutes);
app.use('/api/stats', statsRoutes);
app.use('/api/seasons', seasonsRoutes);
app.use('/api/settings', settingsRoutes);

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
