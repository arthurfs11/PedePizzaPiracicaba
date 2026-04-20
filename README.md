# 🍕 Pede Pizza Piracicaba

POC de sistema de pedidos via Telegram para comércios locais. Permite que clientes façam pedidos de pizza de forma guiada pelo Telegram, com um painel web em tempo real para a loja acompanhar os pedidos.

## Arquitetura

```
Telegram ↔ Bot (Node.js + Telegraf)
               ↓ (pedido completo via HTTP)
            n8n (Docker) — workflow: direciona-pedido
               ↓ (HTTP POST)
         Dashboard API (Node.js + Express)
               ↓ (salva + emite evento)
         SQLite (pedidos.db) + Socket.io
               ↓ (real-time)
         Frontend (HTML/CSS/JS) — painel kanban
```

## Componentes

| Serviço    | Tecnologia              | Porta |
|-----------|-------------------------|-------|
| Bot        | Node.js + Telegraf v4   | —     |
| n8n        | n8n (Docker oficial)    | 5678  |
| Dashboard  | Express + Socket.io     | 8000  |
| Banco      | SQLite (`pedidos.db`)   | —     |

---

## Pré-requisitos

- [Docker](https://www.docker.com/get-started) e Docker Compose
- Node.js 20+ (para rodar localmente sem Docker)
- Conta no Telegram e bot criado via [@BotFather](https://t.me/BotFather)

---

## Instalação com Docker (recomendado)

### 1. Clone o repositório e configure o `.env`

```bash
git clone <repo-url>
cd PedePizzaPiracicaba
cp .env.example .env
```

Edite o `.env` se necessário (o token do bot já vem preenchido no `.env.example`).

### 2. Suba todos os serviços

```bash
docker compose up -d --build
```

Aguarde os containers subirem (~30 segundos). Verifique com:

```bash
docker compose ps
docker compose logs -f
```

### 3. Importe o workflow no n8n

1. Acesse `http://localhost:5678`
2. Faça login com `admin` / `pizza123` (ou os valores do seu `.env`)
3. No menu lateral, clique em **Workflows → Import from File**
4. Selecione o arquivo `n8n-workflows/direciona-pedido.json`
5. Clique em **Save** e depois **Activate** (botão no canto superior direito)

> ⚠️ **Importante:** O workflow precisa estar **ativo** para receber pedidos do bot.

### 4. Acesse o painel

Abra `http://localhost:8000` no navegador.

### 5. Teste no Telegram

Procure por `@pedepizzapiracicaba_bot` no Telegram e envie `/start`.

---

## Instalação local (sem Docker)

Útil para desenvolvimento. Execute os serviços em terminais separados.

### Dashboard

```bash
cd dashboard
npm install
cp ../.env.example .env
# Edite .env: N8N_WEBHOOK_URL=http://localhost:5678/webhook/direciona-pedido
node server.js
# Disponível em http://localhost:8000
```

### Bot

```bash
cd telegram-bot
npm install
# Crie um .env com:
# BOT_TOKEN=<seu-token>
# N8N_WEBHOOK_URL=http://localhost:5678/webhook/direciona-pedido
node src/index.js
```

### n8n

```bash
docker run -d \
  -p 5678:5678 \
  -e N8N_BASIC_AUTH_ACTIVE=true \
  -e N8N_BASIC_AUTH_USER=admin \
  -e N8N_BASIC_AUTH_PASSWORD=pizza123 \
  -v n8n_data:/home/node/.n8n \
  --name pede-pizza-n8n \
  n8nio/n8n
```

Depois importe o workflow conforme o passo 3 acima.

---

## Fluxo de conversa no Telegram

```
/start
  └─ Botão: "🍕 Fazer pedido"
       └─ Digite seu nome
            └─ Digite seu endereço
                 └─ Tipo: [🧀 Salgada] ou [🍓 Doce]
                      └─ Tamanho: [Média R$35] [Grande R$45] [Família R$55]
                           └─ Sabores: [1 sabor] ou [2 sabores]
                                └─ Escolha o(s) sabor(es)
                                     └─ [+ Outra pizza] ou [Finalizar]
                                          └─ Acompanhamento: [Refri] [Suco] [Nenhum]  ← 1x por pedido
                                               └─ Resumo + Confirmar / Cancelar
                                                    └─ Pagamento: [🏦 Pix] ou [💵 Na entrega]
                                                         ├─ Pix → código Copia e Cola gerado automaticamente
                                                         └─ Entrega → ✅ Pedido confirmado!
```

### Cardápio

**Pizzas Salgadas:** Calabresa, Mussarela, Frango c/ Catupiry, Portuguesa, Quatro Queijos, Pepperoni, Margherita

**Pizzas Doces:** Chocolate c/ Morango, Prestígio, Romeu e Julieta, Nutella, Banana c/ Nutella

**Tamanhos:**
| Tamanho  | Fatias | Preço   |
|----------|--------|---------|
| Média    | 6      | R$35,00 |
| Grande   | 8      | R$45,00 |
| Família  | 12     | R$55,00 |

**Acompanhamentos:**
| Item           | Preço   |
|----------------|---------|
| Refrigerante 2L| R$12,00 |
| Suco 1L        | R$8,00  |

---

## Painel de Pedidos

Acesse `http://localhost:8000` para ver o painel kanban com quatro colunas:

- 🔔 **Recebidos** — pedidos chegando do Telegram
- 🔥 **Em Andamento** — em preparo na cozinha
- 🛵 **Em Entrega** — saiu para entrega ao cliente
- ✅ **Concluídos** — entregues e finalizados

Funcionalidades:
- Atualização em tempo real via WebSocket (Socket.io)
- Som de notificação ao chegar novo pedido
- Botões para mover pedidos entre status
- Badge de pagamento (🏦 Pix ou 💵 Entrega) em cada card
- Contador de pedidos e total do dia no cabeçalho
- Relógio em tempo real

---

## API do Dashboard

| Método | Endpoint                     | Descrição                        |
|--------|------------------------------|----------------------------------|
| GET    | `/api/pedidos`               | Lista todos os pedidos           |
| POST   | `/api/pedidos`               | Cria novo pedido (usado pelo n8n)|
| PATCH  | `/api/pedidos/:numero/status`| Atualiza status do pedido        |
| GET    | `/api/stats`                 | Estatísticas (contadores + total)|

Status válidos para PATCH: `recebido` → `em_andamento` → `em_entrega` → `concluido`

### Exemplo: POST `/api/pedidos`

```json
{
  "nome": "João Silva",
  "endereco": "Rua das Flores, 123, Centro",
  "pizzas": [
    {
      "tipo": "salgada",
      "tamanho": { "id": "g", "nome": "Grande", "fatias": 8, "preco": 45 },
      "sabores": [{ "id": "calabresa", "nome": "Calabresa" }]
    }
  ],
  "acompanhamento": { "id": "ref", "nome": "Refrigerante 2L", "preco": 12 },
  "pagamento": "pix",
  "total": 57.00,
  "telegram_chat_id": "123456789"
}
```

---

## Estrutura do Projeto

```
PedePizzaPiracicaba/
├── docker-compose.yml          # Orquestração de todos os serviços
├── .env.example                # Exemplo de variáveis de ambiente
├── .gitignore
│
├── telegram-bot/               # Bot do Telegram
│   ├── Dockerfile
│   ├── package.json
│   └── src/
│       ├── index.js            # Entrada principal + comandos
│       ├── flow.js             # Lógica de fluxo da conversa
│       ├── keyboards.js        # Teclados inline do Telegram
│       ├── menu.js             # Cardápio (sabores, tamanhos, acompanhamentos)
│       ├── pix.js              # Gerador de código Pix Copia e Cola (EMV/TLV + CRC16)
│       └── session.js          # Gerenciamento de sessão em memória
│
├── dashboard/                  # Painel web
│   ├── Dockerfile
│   ├── package.json
│   ├── server.js               # API Express + Socket.io + SQLite
│   └── public/
│       ├── index.html          # Interface do painel
│       ├── style.css           # Estilos
│       └── app.js              # Lógica frontend + Socket.io client
│
└── n8n-workflows/
    └── direciona-pedido.json   # Workflow para importar no n8n
```

---

## Comandos úteis

```bash
# Subir tudo
docker compose up -d --build

# Ver logs em tempo real
docker compose logs -f

# Ver logs de um serviço específico
docker compose logs -f bot
docker compose logs -f dashboard
docker compose logs -f n8n

# Parar tudo
docker compose down

# Parar e apagar volumes (CUIDADO: apaga o banco de dados!)
docker compose down -v

# Reiniciar um serviço
docker compose restart bot
```

---

## Personalização

### Configurar Pix

No `.env`, preencha as três variáveis abaixo para que o bot gere o código **Copia e Cola** automaticamente ao final do pedido:

```env
PIX_KEY=pagamentos@suapizzaria.com.br   # chave Pix (email, CPF, CNPJ, telefone ou aleatória)
PIX_NOME=Pede Pizza Piracicaba          # nome do recebedor (até 25 caracteres)
PIX_CIDADE=Piracicaba                   # cidade do recebedor (até 15 caracteres)
```

Se `PIX_KEY` estiver vazio, o bot informa que o código será enviado em breve, sem gerar o payload.

### Alterar cardápio

Edite `telegram-bot/src/menu.js` e adicione/remova sabores, tamanhos ou acompanhamentos.

### Alterar preços

No mesmo arquivo `menu.js`, altere o campo `preco` de cada item.

### Adaptar para outro tipo de comércio

Este projeto foi feito como POC para pizzarias, mas pode ser adaptado para qualquer comércio. Altere:
- `menu.js` com os produtos do comércio
- `flow.js` com o fluxo de conversa adequado
- `keyboards.js` com as opções de cada etapa
- Interface do dashboard conforme a identidade visual

---

## Licença

MIT — livre para uso comercial e modificações.
