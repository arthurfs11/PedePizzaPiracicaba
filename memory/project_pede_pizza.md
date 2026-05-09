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

**Funcionalidades implementadas:**
- Kanban com kanban de pedidos (5 colunas), notificações sonoras, timer ao vivo
- Gerenciamento de catálogo (pizzas, tamanhos, bordas, acompanhamentos)
- Gestão de clientes com deduplicação por telefone normalizado
- Relatórios com exportação CSV
- Suporte/chamados com edição de status e notas (super_admin)
- Usuários com controle de papel (operador, admin, contabil, super_admin)
- Integração AbacatePay para Pix automático + fallback Pix Copia e Cola manual
- Chat web público em /novo-pedido (mesma UI do tema do dashboard)
- Configurações de horário de funcionamento por dia + tempo estimado de entrega
- Notificações ao cliente no Telegram quando status do pedido muda
- Notificações push (web) e socket em tempo real no chat web
- Impressão térmica 80mm via /api/pedidos/:numero/imprimir
- Endereço pré-preenchido ao redigitar telefone (bot + web)
- Verificação de loja aberta/fechada (bot + web)

**Why:** Produto SaaS para vender para comércios locais. Precificação pensada: setup R$497 + mensalidade R$97-397/mês.

**How to apply:** Para subir: `docker compose up -d --build` + importar n8n-workflows/direciona-pedido.json no n8n em http://localhost:5678 e ativar o workflow.
