---
name: Pede Pizza Piracicaba - Projeto
description: POC de sistema de pedidos via Telegram para pizzaria/comércios locais
type: project
---

Sistema completo de pedidos via Telegram com painel web em tempo real.

**Stack:**
- Telegram Bot: Node.js + Telegraf v4 (telegram-bot/)
- Dashboard: Node.js + Express + Socket.io + SQLite better-sqlite3 (dashboard/)
- Orquestrador: n8n via Docker (porta 5678)
- Banco: SQLite (pedidos.db na raiz)
- Deploy: docker-compose.yml orquestra todos os 3 serviços

**Fluxo:** Bot conversa com cliente no Telegram → ao finalizar pedido, chama webhook n8n → n8n chama POST /api/pedidos no dashboard → dashboard salva no SQLite e emite Socket.io para o frontend atualizar em tempo real.

**Why:** POC para vender para comércios locais, exemplo com pizzaria mas adaptável para qualquer comércio.

**How to apply:** Para subir: `docker compose up -d --build` + importar n8n-workflows/direciona-pedido.json no n8n em http://localhost:5678 e ativar o workflow.
