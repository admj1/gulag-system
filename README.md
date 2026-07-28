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

## Rodando localmente

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
