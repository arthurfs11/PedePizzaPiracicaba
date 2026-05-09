# Ativação — Guia de Deploy em Produção

Este guia cobre tudo que você precisa para colocar o sistema no ar com um domínio próprio, desde Docker local até servidor Linux dedicado e plataformas cloud.

---

## Arquitetura do Sistema

```
Internet
    │
    ▼
[ Nginx / Proxy ]  ← domínio HTTPS (porta 443)
    │
    ├── /          → Dashboard (Node.js, porta 8000)
    │
    └── /n8n       → n8n (porta 5678) — opcional expor
         
[ Bot Telegram ]   → long polling (sem porta exposta)
    └── POST interno → n8n → Dashboard API

[ SQLite ]         → volume persistente /data/pedidos.db
```

**Três serviços Docker:**
- `dashboard` — painel web + API REST + Socket.io (porta 8000)
- `bot` — bot Telegram em long polling (sem porta)
- `n8n` — orquestrador de fluxos/pedidos (porta 5678, acesso interno)

---

## 1. Pré-requisitos Gerais

Antes de qualquer opção de deploy, você precisa:

### 1.1 Configurar o `.env`

Copie o arquivo de exemplo e preencha:

```bash
cp .env.example .env
nano .env   # ou use qualquer editor
```

**Campos obrigatórios:**

```env
# Token do Bot Telegram (obtenha com @BotFather)
BOT_TOKEN=1234567890:AABBCCDDEEFFaabbccddee...

# Credenciais do n8n (defina antes do primeiro acesso)
N8N_USER=admin
N8N_PASS=SuaSenhaForte123!

# Chave Pix da loja
PIX_KEY=seu@email.com.br
PIX_NOME=Nome Da Pizzaria
PIX_CIDADE=Sua Cidade

# Segredo da sessão (gere com: openssl rand -hex 32)
SESSION_SECRET=cole_aqui_uma_string_aleatoria_longa
```

**Campos opcionais (AbacatePay — Pix automático):**

```env
ABACATEPAY_API_KEY=sua_api_key_abacatepay
ABACATEPAY_RETURN_URL=https://seudominio.com/pedido-confirmado
ABACATEPAY_WEBHOOK_SECRET=outra_string_aleatoria_segura
```

> **Dica:** Gere strings seguras com:
> ```bash
> openssl rand -hex 32
> ```

---

## 2. Opção A — Docker na Sua Máquina (Local / Exposição via Túnel)

Ideal para: testes, demonstrações para clientes, ambientes de homologação.

### 2.1 Requisitos

- Docker Desktop instalado ([docker.com/products/docker-desktop](https://www.docker.com/products/docker-desktop))
- Git

### 2.2 Subir os contêineres

```bash
# Clone o projeto (ou acesse a pasta já existente)
cd PedePizzaPiracicaba

# Configure o .env conforme seção 1.1
cp .env.example .env

# Suba todos os serviços
docker compose up -d

# Acompanhe os logs
docker compose logs -f
```

Acesse localmente em: `http://localhost:8000`

### 2.3 Expor para a internet com Cloudflare Tunnel (sem precisar de IP fixo)

O Cloudflare Tunnel cria um domínio público sem abrir portas no roteador.

```bash
# Instale o cloudflared
brew install cloudflared   # macOS
# ou baixe em: https://developers.cloudflare.com/cloudflare-one/connections/connect-apps/install-and-setup/installation/

# Faça login (abre o browser)
cloudflared tunnel login

# Crie o túnel
cloudflared tunnel create pede-pizza

# Configure o redirecionamento (cria config.yml)
mkdir -p ~/.cloudflared
cat > ~/.cloudflared/config.yml << EOF
tunnel: pede-pizza
credentials-file: /Users/SEU_USUARIO/.cloudflared/pede-pizza.json

ingress:
  - hostname: seudominio.com
    service: http://localhost:8000
  - service: http_status:404
EOF

# Aponte o DNS no painel da Cloudflare (ou use subdomínio .trycloudflare.com sem conta)
cloudflared tunnel route dns pede-pizza seudominio.com

# Rode o túnel
cloudflared tunnel run pede-pizza
```

> Para teste rápido sem conta Cloudflare:
> ```bash
> cloudflared tunnel --url http://localhost:8000
> # Gera um URL temporário: https://xxxx.trycloudflare.com
> ```

### 2.4 Atualizar n8n com URL pública

Após ter o domínio público, edite o `docker-compose.yml`:

```yaml
n8n:
  environment:
    - N8N_HOST=seudominio.com
    - N8N_PROTOCOL=https
    - WEBHOOK_URL=https://seudominio.com/n8n
```

E reinicie:

```bash
docker compose up -d n8n
```

---

## 3. Opção B — Servidor Linux (VPS)

Ideal para: produção real, múltiplos clientes, uptime garantido.

**Provedores recomendados (custo-benefício):**

| Provedor | Plano mínimo sugerido | Preço aprox. |
|---|---|---|
| [Hetzner](https://hetzner.com) | CX22 (2 vCPU, 4GB RAM) | ~€4/mês |
| [Contabo](https://contabo.com) | VPS S (4 vCPU, 8GB RAM) | ~€5/mês |
| [DigitalOcean](https://digitalocean.com) | Droplet 2GB | ~$12/mês |
| [Hostinger VPS](https://hostinger.com.br) | VPS 2 | ~R$30/mês |

### 3.1 Preparar o servidor

```bash
# Conecte via SSH
ssh root@IP_DO_SERVIDOR

# Atualize o sistema
apt update && apt upgrade -y

# Instale dependências
apt install -y git curl ufw

# Instale Docker
curl -fsSL https://get.docker.com | sh

# Instale Docker Compose
apt install -y docker-compose-plugin

# Verifique
docker --version
docker compose version
```

### 3.2 Configurar o firewall

```bash
ufw allow OpenSSH
ufw allow 80/tcp
ufw allow 443/tcp
ufw enable
```

### 3.3 Fazer upload do projeto

**Opção 1 — via Git (recomendado):**
```bash
cd /opt
git clone https://github.com/seu-usuario/PedePizzaPiracicaba.git
cd PedePizzaPiracicaba
```

**Opção 2 — via SCP (upload direto):**
```bash
# Execute no seu Mac/PC local:
scp -r ./PedePizzaPiracicaba root@IP_DO_SERVIDOR:/opt/
```

### 3.4 Configurar e subir

```bash
cd /opt/PedePizzaPiracicaba

# Configure o .env
cp .env.example .env
nano .env  # preencha conforme seção 1.1

# Suba os serviços
docker compose up -d

# Verifique se está rodando
docker compose ps
```

### 3.5 Instalar Nginx como proxy reverso

```bash
apt install -y nginx
```

Crie o arquivo de configuração do site:

```bash
nano /etc/nginx/sites-available/pede-pizza
```

Cole o conteúdo abaixo (substitua `seudominio.com`):

```nginx
server {
    listen 80;
    server_name seudominio.com www.seudominio.com;

    # Dashboard principal
    location / {
        proxy_pass         http://localhost:8000;
        proxy_http_version 1.1;

        # Socket.io
        proxy_set_header Upgrade    $http_upgrade;
        proxy_set_header Connection "upgrade";

        proxy_set_header Host              $host;
        proxy_set_header X-Real-IP         $remote_addr;
        proxy_set_header X-Forwarded-For   $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;

        proxy_read_timeout 86400;
    }

    # n8n (acesso ao painel de workflows — opcional, remova se não quiser expor)
    location /n8n/ {
        proxy_pass         http://localhost:5678/;
        proxy_http_version 1.1;
        proxy_set_header Upgrade    $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host       $host;
    }
}
```

Ative e teste:

```bash
ln -s /etc/nginx/sites-available/pede-pizza /etc/nginx/sites-enabled/
nginx -t           # verifica erros de sintaxe
systemctl restart nginx
```

### 3.6 Habilitar HTTPS com Let's Encrypt

```bash
apt install -y certbot python3-certbot-nginx

certbot --nginx -d seudominio.com -d www.seudominio.com

# Renova automaticamente (já vem configurado, só teste)
certbot renew --dry-run
```

Após o Certbot rodar, o Nginx é reconfigurado automaticamente para HTTPS. Seu sistema estará em `https://seudominio.com`.

### 3.7 Apontar o domínio para o servidor

No painel do seu registrador de domínio (Registro.br, GoDaddy, Cloudflare, etc.):

| Tipo | Nome | Valor |
|---|---|---|
| A | `@` | `IP_DO_SERVIDOR` |
| A | `www` | `IP_DO_SERVIDOR` |

> Propagação DNS pode levar até 48h, mas geralmente ocorre em menos de 1h.

### 3.8 Manter o serviço ativo após reinicializações

O Docker Compose já usa `restart: unless-stopped` em todos os serviços — eles sobem automaticamente se o servidor reiniciar.

Para garantir que o Nginx também sobe:

```bash
systemctl enable nginx
```

---

## 4. Opção C — Railway (Cloud com Docker Compose)

Ideal para: quem não quer gerenciar servidor, quer deploy simples.

> ⚠️ **Limitação:** Railway suporta SQLite com volumes persistentes, mas para escalar para múltiplos clientes simultaneamente é recomendável migrar para PostgreSQL no futuro.

### 4.1 Deploy

1. Crie conta em [railway.app](https://railway.app)
2. Instale a CLI:
   ```bash
   npm install -g @railway/cli
   railway login
   ```
3. Na pasta do projeto:
   ```bash
   railway init
   railway up
   ```
4. No painel do Railway, adicione todas as variáveis de ambiente da seção 1.1
5. Em **Settings → Domains**, gere um domínio público ou conecte o seu

### 4.2 Volume persistente para o banco de dados

No painel do Railway:
- Vá em **dashboard service → Settings → Volumes**
- Monte em `/data` com pelo menos 1GB

---

## 5. Configurar o n8n (Todos os casos)

O n8n é o responsável por receber o pedido do bot e enviá-lo ao dashboard.

### 5.1 Primeiro acesso

Acesse `https://seudominio.com/n8n` (ou `http://localhost:5678` em local).

Login com as credenciais definidas no `.env`:
- Usuário: `N8N_USER`
- Senha: `N8N_PASS`

### 5.2 Importar o workflow

1. No n8n, clique em **+ New Workflow → Import from File**
2. Selecione o arquivo em `n8n-workflows/` na pasta do projeto
3. Ative o workflow (botão toggle no canto superior direito)
4. Confirme que o webhook está ativo em **Executions**

### 5.3 Atualizar URL do webhook no `.env`

Para deploy em produção (substitua pelo domínio real):

```env
N8N_WEBHOOK_URL=https://seudominio.com/n8n/webhook/direciona-pedido
```

Reinicie o bot após a mudança:

```bash
docker compose restart bot
```

---

## 6. Configurar AbacatePay (Pix Automático)

Se quiser confirmação automática de pagamento Pix:

1. Crie conta em [app.abacatepay.com](https://app.abacatepay.com)
2. Gere uma API Key em **Configurações → Integrações**
3. Configure o webhook em **Webhooks → Adicionar**:
   - URL: `https://seudominio.com/api/webhooks/abacatepay?secret=SEU_WEBHOOK_SECRET`
   - Evento: `billing.paid`
4. Preencha no `.env`:
   ```env
   ABACATEPAY_API_KEY=sua_api_key
   ABACATEPAY_WEBHOOK_SECRET=string_que_voce_definiu
   ABACATEPAY_RETURN_URL=https://seudominio.com
   ```
5. Reinicie o dashboard:
   ```bash
   docker compose restart dashboard
   ```

---

## 7. Primeiro Acesso ao Sistema

### 7.1 Gerar o link de ativação

O sistema usa um slug único por instalação para acesso seguro.

```bash
# Veja o slug gerado no log do dashboard
docker compose logs dashboard | grep "Link de acesso"
```

Você verá algo como:
```
🔑 Link de acesso: https://seudominio.com/pzz-a1b2c3d4e5f6g7h8
```

### 7.2 Criar o primeiro usuário admin

1. Acesse o link de ativação no browser
2. Será redirecionado para a tela de **Setup Inicial**
3. Crie o usuário administrador (nome, login, senha)
4. Faça login normalmente

### 7.3 Configurar a loja

Após o login, acesse **⚙️ Configurações** e preencha:
- Tempo estimado de entrega
- Horários de funcionamento
- Taxas de entrega por bairro

---

## 8. Checklist Final

Antes de liberar para o cliente, confirme cada item:

```
[ ] .env preenchido com todas as variáveis obrigatórias
[ ] docker compose ps mostra todos os 3 serviços "Up"
[ ] Dashboard acessível em https://seudominio.com
[ ] HTTPS funcionando (cadeado no browser)
[ ] Primeiro usuário admin criado via link de ativação
[ ] Cardápio configurado (ou importado via CSV)
[ ] Bot Telegram respondendo ao /start
[ ] Workflow n8n importado e ativo
[ ] Pedido de teste completo: bot → dashboard → concluído
[ ] Pix testado (manual ou AbacatePay)
[ ] Horários de funcionamento configurados
[ ] Tempo de entrega configurado
[ ] Backup agendado do volume pizza_db (ver seção abaixo)
```

---

## 9. Backup do Banco de Dados

O banco SQLite fica no volume Docker `pizza_db`. Configure backups automáticos:

```bash
# Backup manual
docker run --rm \
  -v PedePizzaPiracicaba_pizza_db:/data \
  -v $(pwd)/backups:/backup \
  alpine tar czf /backup/pedidos-$(date +%Y%m%d-%H%M).tar.gz /data

# Automatizar via cron (todo dia às 3h da manhã)
crontab -e
# Adicione a linha:
0 3 * * * docker run --rm -v PedePizzaPiracicaba_pizza_db:/data -v /opt/backups:/backup alpine tar czf /opt/backups/pedidos-$(date +\%Y\%m\%d).tar.gz /data
```

---

## 10. Atualizar o Sistema

Para aplicar novas versões sem downtime significativo:

```bash
cd /opt/PedePizzaPiracicaba

# Baixe as atualizações
git pull

# Rebuild apenas os serviços alterados
docker compose up -d --build

# Verifique os logs após atualização
docker compose logs -f --tail=50
```

---

## Referência Rápida de Comandos

```bash
# Subir tudo
docker compose up -d

# Parar tudo
docker compose down

# Ver logs em tempo real
docker compose logs -f

# Reiniciar um serviço específico
docker compose restart dashboard
docker compose restart bot
docker compose restart n8n

# Ver status
docker compose ps

# Acesso ao banco de dados (diagnóstico)
docker run --rm -it \
  -v PedePizzaPiracicaba_pizza_db:/data \
  alpine sh -c "apk add sqlite && sqlite3 /data/pedidos.db"
```
