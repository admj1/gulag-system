# Gulag System — Gestão da Pelada

Sistema de gestão de uma pelada de futebol semanal: confirmação de presença, sorteio de times, súmula, controle financeiro e estatísticas.

Especificação completa em [SPEC.md](./SPEC.md).

## Stack

- **Backend**: Node.js + Express + PostgreSQL, autenticação JWT
- **Frontend**: React + Vite + Tailwind CSS

## Estrutura

```
backend/    API REST
frontend/   Aplicação web (SPA)
```

## Rodando em produção (executável)

Dê duplo clique em `iniciar.bat` (Windows). Na primeira vez, ele instala as dependências,
gera o build de produção do frontend e roda as migrations automaticamente. Depois disso,
o backend passa a servir o frontend buildado no mesmo processo — tudo em
`http://localhost:3001`.

Rode `criar_atalho_desktop.ps1` uma vez para criar um atalho "Gulag System" na Área de Trabalho.

## Rodando em desenvolvimento

### Backend

```bash
cd backend
npm install
cp .env.example .env
npm run dev
```

### Frontend

```bash
cd frontend
npm install
npm run dev
```

O frontend em modo dev (`npm run dev`) roda em `http://localhost:5173` e faz proxy de `/api`
para o backend em `http://localhost:3001` (configurado em `frontend/vite.config.js`).
