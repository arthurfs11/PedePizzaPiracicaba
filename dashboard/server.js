require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const express    = require('express');
const http       = require('http');
const { Server } = require('socket.io');
const cors       = require('cors');
const path       = require('path');
const crypto     = require('crypto');
const Database   = require('better-sqlite3');
const session    = require('express-session');
const bcrypt     = require('bcryptjs');
const nodemailer = require('nodemailer');

const PORT    = process.env.PORT    || 8000;
const DB_PATH = process.env.DB_PATH || path.join(__dirname, '../pedidos.db');

// ── Banco de dados ──────────────────────────────────────────
const db = new Database(DB_PATH);

db.exec(`
  CREATE TABLE IF NOT EXISTS config (
    chave TEXT PRIMARY KEY,
    valor TEXT
  );

  CREATE TABLE IF NOT EXISTS usuarios (
    id        INTEGER PRIMARY KEY AUTOINCREMENT,
    nome      TEXT NOT NULL,
    usuario   TEXT UNIQUE NOT NULL,
    senha     TEXT NOT NULL,
    papel     TEXT DEFAULT 'operador',
    ativo     INTEGER DEFAULT 1,
    criado_em TEXT DEFAULT (datetime('now','localtime'))
  );

  CREATE TABLE IF NOT EXISTS pedidos (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    numero        TEXT    UNIQUE NOT NULL,
    nome          TEXT    NOT NULL,
    telefone      TEXT,
    endereco      TEXT    NOT NULL,
    itens         TEXT    NOT NULL,
    acompanhamento TEXT,
    pagamento     TEXT    DEFAULT 'entrega',
    total         REAL    NOT NULL,
    status        TEXT    DEFAULT 'recebido',
    chat_id       TEXT,
    criado_em     TEXT    DEFAULT (datetime('now','localtime')),
    atualizado_em TEXT    DEFAULT (datetime('now','localtime'))
  );

  CREATE TABLE IF NOT EXISTS pedidos_historico (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    numero        TEXT    UNIQUE NOT NULL,
    nome          TEXT    NOT NULL,
    telefone      TEXT,
    endereco      TEXT    NOT NULL,
    itens         TEXT    NOT NULL,
    acompanhamento TEXT,
    pagamento     TEXT    DEFAULT 'entrega',
    total         REAL    NOT NULL,
    status        TEXT    DEFAULT 'concluido',
    chat_id       TEXT,
    criado_em     TEXT,
    atualizado_em TEXT,
    concluido_em  TEXT    DEFAULT (datetime('now','localtime'))
  );

  CREATE TABLE IF NOT EXISTS contador (
    chave TEXT PRIMARY KEY,
    valor INTEGER DEFAULT 0
  );

  CREATE TABLE IF NOT EXISTS chamados (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    nome       TEXT NOT NULL,
    email      TEXT NOT NULL,
    assunto    TEXT NOT NULL,
    descricao  TEXT NOT NULL,
    prioridade TEXT DEFAULT 'media',
    usuario_id INTEGER,
    criado_em  TEXT DEFAULT (datetime('now','localtime')),
    email_enviado INTEGER DEFAULT 0
  );

  INSERT OR IGNORE INTO contador (chave, valor) VALUES ('pedido', 0);
`);

// Migrações para bancos existentes
[
  `ALTER TABLE pedidos ADD COLUMN acompanhamento TEXT`,
  `ALTER TABLE pedidos ADD COLUMN pagamento TEXT DEFAULT 'entrega'`,
  `ALTER TABLE pedidos ADD COLUMN telefone TEXT`,
  `ALTER TABLE pedidos ADD COLUMN checkout_id TEXT`,
].forEach(sql => { try { db.exec(sql); } catch (_) {} });

// Gerar slug único na primeira execução
if (!db.prepare("SELECT valor FROM config WHERE chave = 'tenant_slug'").get()) {
  const slug = 'pzz-' + crypto.randomBytes(8).toString('hex');
  db.prepare("INSERT INTO config (chave, valor) VALUES ('tenant_slug', ?)").run(slug);
}
const TENANT_SLUG = db.prepare("SELECT valor FROM config WHERE chave = 'tenant_slug'").get().valor;

function gerarNumeroPedido() {
  db.prepare("UPDATE contador SET valor = valor + 1 WHERE chave = 'pedido'").run();
  const { valor } = db.prepare("SELECT valor FROM contador WHERE chave = 'pedido'").get();
  const hoje = new Date();
  const dd   = String(hoje.getDate()).padStart(2, '0');
  const mm   = String(hoje.getMonth() + 1).padStart(2, '0');
  return `PZZ-${dd}${mm}-${String(valor).padStart(3, '0')}`;
}

// ── Express + Socket.io ────────────────────────────────────
const app    = express();
const server = http.createServer(app);
const io     = new Server(server, { cors: { origin: '*' } });

app.use(cors());
app.use(express.json());
app.use(session({
  secret:            process.env.SESSION_SECRET || 'pede-pizza-s3cr3t',
  resave:            false,
  saveUninitialized: false,
  cookie:            { maxAge: 10 * 60 * 60 * 1000 }, // 10 horas
}));

// ── Middlewares de autenticação ────────────────────────────
function requireAuth(req, res, next) {
  if (req.session?.loggedIn) return next();
  if (req.path.startsWith('/api/')) return res.status(401).json({ erro: 'Não autenticado' });
  return res.redirect('/login');
}

function requireAdmin(req, res, next) {
  if (req.session?.usuario?.papel !== 'admin') {
    if (req.path.startsWith('/api/')) return res.status(403).json({ erro: 'Acesso negado: apenas administradores' });
    return res.redirect('/');
  }
  next();
}

// Bloqueia perfil contábil de acessar páginas operacionais
function requireNotContabil(req, res, next) {
  if (req.session?.usuario?.papel === 'contabil') {
    return res.redirect('/relatorios');
  }
  next();
}

// ── Servir assets estáticos sem proteger HTML ──────────────
app.use((req, res, next) => {
  const ext = path.extname(req.path);
  if (ext && ext !== '.html') {
    return express.static(path.join(__dirname, 'public'))(req, res, next);
  }
  next();
});

// ── Entrada via slug único ─────────────────────────────────
app.get(`/${TENANT_SLUG}`, (req, res) => {
  req.session.tenantValidated = true;
  const hasUsers = db.prepare('SELECT COUNT(*) as n FROM usuarios WHERE ativo = 1').get().n > 0;
  if (!hasUsers) return res.redirect('/setup');
  if (req.session.loggedIn) return res.redirect('/');
  return res.redirect('/login');
});

// ── Setup inicial (primeiro usuário) ──────────────────────
app.get('/setup', (req, res) => {
  if (!req.session?.tenantValidated && !req.session?.loggedIn) {
    return res.redirect(`/${TENANT_SLUG}`);
  }
  const hasUsers = db.prepare('SELECT COUNT(*) as n FROM usuarios WHERE ativo = 1').get().n > 0;
  if (hasUsers) return res.redirect('/login');
  res.sendFile(path.join(__dirname, 'public/setup.html'));
});

app.post('/api/auth/setup', async (req, res) => {
  if (!req.session?.tenantValidated && !req.session?.loggedIn) {
    return res.status(403).json({ erro: 'Acesso não autorizado' });
  }
  const hasUsers = db.prepare('SELECT COUNT(*) as n FROM usuarios').get().n > 0;
  if (hasUsers) return res.status(400).json({ erro: 'Já existe um usuário cadastrado' });

  const { nome, usuario, senha } = req.body;
  if (!nome || !usuario || !senha) return res.status(400).json({ erro: 'Preencha todos os campos' });
  if (senha.length < 6) return res.status(400).json({ erro: 'Senha deve ter no mínimo 6 caracteres' });

  const hash = await bcrypt.hash(senha, 10);
  db.prepare("INSERT INTO usuarios (nome, usuario, senha, papel) VALUES (?, ?, ?, 'admin')").run(nome, usuario, hash);
  res.json({ ok: true });
});

// ── Login ──────────────────────────────────────────────────
app.get('/login', (req, res) => {
  if (req.session?.loggedIn) return res.redirect('/');
  res.sendFile(path.join(__dirname, 'public/login.html'));
});

app.post('/api/auth/login', async (req, res) => {
  const { usuario, senha } = req.body;

  // Verificar se existe algum usuário cadastrado
  const hasUsers = db.prepare('SELECT COUNT(*) as n FROM usuarios WHERE ativo = 1').get().n > 0;
  if (!hasUsers) return res.status(400).json({ erro: 'Nenhum usuário cadastrado. Use o link de acesso para configurar.' });

  const user = db.prepare('SELECT * FROM usuarios WHERE usuario = ? AND ativo = 1').get(usuario);
  if (!user) return res.status(401).json({ erro: 'Usuário ou senha incorretos' });

  const valid = await bcrypt.compare(senha, user.senha);
  if (!valid) return res.status(401).json({ erro: 'Usuário ou senha incorretos' });

  req.session.loggedIn = true;
  req.session.tenantValidated = true;
  req.session.usuario = { id: user.id, nome: user.nome, usuario: user.usuario, papel: user.papel };
  return res.json({ ok: true, papel: user.papel });
});

app.post('/api/auth/logout', (req, res) => {
  req.session.destroy(() => {});
  res.json({ ok: true });
});

app.get('/api/auth/me', requireAuth, (req, res) => {
  res.json(req.session.usuario);
});

// ── Páginas protegidas ─────────────────────────────────────
app.get('/',           requireAuth, requireNotContabil,              (req, res) => res.sendFile(path.join(__dirname, 'public/index.html')));
app.get('/relatorios', requireAuth,                                (req, res) => res.sendFile(path.join(__dirname, 'public/relatorios.html')));
app.get('/suporte',    requireAuth, requireNotContabil,            (req, res) => res.sendFile(path.join(__dirname, 'public/suporte.html')));
app.get('/usuarios',   requireAuth, requireAdmin,                  (req, res) => res.sendFile(path.join(__dirname, 'public/usuarios.html')));

// ── API: Usuários (admin only) ─────────────────────────────
app.get('/api/usuarios', requireAuth, requireAdmin, (req, res) => {
  const users = db.prepare('SELECT id, nome, usuario, papel, ativo, criado_em FROM usuarios ORDER BY criado_em ASC').all();
  res.json(users);
});

app.post('/api/usuarios', requireAuth, requireAdmin, async (req, res) => {
  const { nome, usuario, senha, papel } = req.body;
  if (!nome || !usuario || !senha) return res.status(400).json({ erro: 'Campos obrigatórios não preenchidos' });
  if (senha.length < 6) return res.status(400).json({ erro: 'Senha deve ter no mínimo 6 caracteres' });

  const papelValido = ['admin', 'operador', 'contabil'].includes(papel) ? papel : 'operador';
  try {
    const hash = await bcrypt.hash(senha, 10);
    const r = db.prepare('INSERT INTO usuarios (nome, usuario, senha, papel) VALUES (?, ?, ?, ?)').run(nome, usuario, hash, papelValido);
    const novo = db.prepare('SELECT id, nome, usuario, papel, ativo, criado_em FROM usuarios WHERE id = ?').get(r.lastInsertRowid);
    res.status(201).json(novo);
  } catch (err) {
    if (err.message.includes('UNIQUE')) return res.status(400).json({ erro: 'Nome de usuário já está em uso' });
    res.status(500).json({ erro: err.message });
  }
});

app.patch('/api/usuarios/:id', requireAuth, requireAdmin, async (req, res) => {
  const { id } = req.params;
  const { nome, senha, papel, ativo } = req.body;

  const user = db.prepare('SELECT * FROM usuarios WHERE id = ?').get(id);
  if (!user) return res.status(404).json({ erro: 'Usuário não encontrado' });

  // Impedir desativar o próprio usuário
  if (parseInt(id) === req.session.usuario.id && ativo === false) {
    return res.status(400).json({ erro: 'Não é possível desativar o próprio usuário' });
  }

  let senhaHash = user.senha;
  if (senha) {
    if (senha.length < 6) return res.status(400).json({ erro: 'Senha deve ter no mínimo 6 caracteres' });
    senhaHash = await bcrypt.hash(senha, 10);
  }

  db.prepare('UPDATE usuarios SET nome = ?, senha = ?, papel = ?, ativo = ? WHERE id = ?').run(
    nome  ?? user.nome,
    senhaHash,
    papel ?? user.papel,
    ativo !== undefined ? (ativo ? 1 : 0) : user.ativo,
    id
  );

  const atualizado = db.prepare('SELECT id, nome, usuario, papel, ativo, criado_em FROM usuarios WHERE id = ?').get(id);
  res.json(atualizado);
});

app.delete('/api/usuarios/:id', requireAuth, requireAdmin, (req, res) => {
  const { id } = req.params;
  if (parseInt(id) === req.session.usuario.id) {
    return res.status(400).json({ erro: 'Não é possível excluir o próprio usuário' });
  }

  // Impedir excluir o último admin
  const user = db.prepare('SELECT * FROM usuarios WHERE id = ?').get(id);
  if (!user) return res.status(404).json({ erro: 'Usuário não encontrado' });

  if (user.papel === 'admin') {
    const totalAdmins = db.prepare("SELECT COUNT(*) as n FROM usuarios WHERE papel = 'admin' AND ativo = 1").get().n;
    if (totalAdmins <= 1) return res.status(400).json({ erro: 'Não é possível excluir o único administrador' });
  }

  db.prepare('DELETE FROM usuarios WHERE id = ?').run(id);
  res.json({ ok: true });
});

// Link de acesso (admin only)
app.get('/api/link', requireAuth, requireAdmin, (req, res) => {
  const host     = req.get('host') || `localhost:${PORT}`;
  const protocol = req.headers['x-forwarded-proto'] || req.protocol || 'http';
  res.json({ slug: TENANT_SLUG, link: `${protocol}://${host}/${TENANT_SLUG}` });
});

// ── API: Receber pedido — SEM auth (chamado pelo n8n) ──────
app.post('/api/pedidos', (req, res) => {
  try {
    const { nome, telefone, endereco, pizzas, acompanhamento, pagamento, total, telegram_chat_id, checkout_id } = req.body;
    if (!nome || !endereco || !pizzas || !Array.isArray(pizzas) || pizzas.length === 0) {
      return res.status(400).json({ erro: 'Dados do pedido incompletos' });
    }
    const numero        = gerarNumeroPedido();
    const itensJson     = JSON.stringify(pizzas);
    const acompJson     = acompanhamento ? JSON.stringify(acompanhamento) : null;
    const statusInicial = (pagamento === 'pix') ? 'pendente_pagamento' : 'recebido';

    db.prepare(`
      INSERT INTO pedidos (numero, nome, telefone, endereco, itens, acompanhamento, pagamento, total, status, chat_id, checkout_id)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(numero, nome, telefone || null, endereco, itensJson, acompJson, pagamento || 'entrega', total, statusInicial, telegram_chat_id || null, checkout_id || null);

    const pedido = parsePedido(db.prepare('SELECT * FROM pedidos WHERE numero = ?').get(numero));
    io.emit('novo_pedido', pedido);
    console.log(`[PEDIDO] ${numero} — ${nome}`);
    return res.status(201).json({ numero, status: statusInicial, pedido });
  } catch (err) {
    console.error('[API] Erro ao salvar pedido:', err.message);
    return res.status(500).json({ erro: 'Erro interno ao salvar pedido' });
  }
});

// ── Webhook AbacatePay — confirma pagamento Pix automaticamente ──
// Ativo apenas quando ABACATEPAY_WEBHOOK_SECRET estiver definido no .env
app.post('/api/webhooks/abacatepay', (req, res) => {
  const secret = process.env.ABACATEPAY_WEBHOOK_SECRET;
  if (secret && req.query.secret !== secret) {
    return res.status(401).json({ erro: 'Não autorizado' });
  }

  const evento = req.body;
  if (evento?.event !== 'BILLING.PAID') {
    return res.json({ ok: true, ignorado: true });
  }

  const checkoutId = evento?.data?.billing?.id;
  if (!checkoutId) return res.status(400).json({ erro: 'checkout_id ausente no payload' });

  const pedido = db.prepare("SELECT * FROM pedidos WHERE checkout_id = ? AND status = 'pendente_pagamento'").get(checkoutId);
  if (!pedido) {
    console.log(`[ABACATEPAY] Webhook: checkout ${checkoutId} não encontrado ou já confirmado`);
    return res.json({ ok: true, ignorado: true });
  }

  db.prepare("UPDATE pedidos SET status = 'recebido', atualizado_em = datetime('now','localtime') WHERE numero = ?").run(pedido.numero);
  const atualizado = parsePedido(db.prepare('SELECT * FROM pedidos WHERE numero = ?').get(pedido.numero));
  io.emit('pedido_atualizado', atualizado);
  console.log(`[ABACATEPAY] Pix confirmado — pedido ${pedido.numero}`);
  return res.json({ ok: true });
});

// ── API: Pedidos ───────────────────────────────────────────
app.get('/api/pedidos', requireAuth, (req, res) => {
  const pedidos = db.prepare('SELECT * FROM pedidos ORDER BY criado_em ASC').all();
  res.json(pedidos.map(parsePedido));
});

app.get('/api/pedidos/concluidos-hoje', requireAuth, (req, res) => {
  const pedidos = db.prepare(
    "SELECT * FROM pedidos_historico WHERE date(concluido_em) = date('now','localtime') ORDER BY concluido_em ASC"
  ).all();
  res.json(pedidos.map(parsePedidoHistorico));
});

app.patch('/api/pedidos/:numero/status', requireAuth, (req, res) => {
  try {
    const { numero } = req.params;
    const { status } = req.body;
    const statusValidos = ['pendente_pagamento', 'recebido', 'em_andamento', 'em_entrega', 'concluido'];
    if (!statusValidos.includes(status)) return res.status(400).json({ erro: 'Status inválido' });

    const pedido = db.prepare('SELECT * FROM pedidos WHERE numero = ?').get(numero);
    if (!pedido) return res.status(404).json({ erro: 'Pedido não encontrado' });

    if (status === 'concluido') {
      db.transaction(() => {
        db.prepare(`
          INSERT OR REPLACE INTO pedidos_historico
            (numero, nome, telefone, endereco, itens, acompanhamento, pagamento, total, status, chat_id,
             criado_em, atualizado_em, concluido_em)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'concluido', ?, ?, datetime('now','localtime'), datetime('now','localtime'))
        `).run(pedido.numero, pedido.nome, pedido.telefone, pedido.endereco, pedido.itens,
               pedido.acompanhamento, pedido.pagamento, pedido.total, pedido.chat_id, pedido.criado_em);
        db.prepare('DELETE FROM pedidos WHERE numero = ?').run(numero);
      })();

      const historico = db.prepare('SELECT * FROM pedidos_historico WHERE numero = ?').get(numero);
      const concluido = parsePedidoHistorico(historico);
      io.emit('pedido_atualizado', concluido);
      return res.json(concluido);
    }

    db.prepare("UPDATE pedidos SET status = ?, atualizado_em = datetime('now','localtime') WHERE numero = ?").run(status, numero);
    const atualizado = parsePedido(db.prepare('SELECT * FROM pedidos WHERE numero = ?').get(numero));
    io.emit('pedido_atualizado', atualizado);
    return res.json(atualizado);
  } catch (err) {
    console.error('[PATCH /status] Erro:', err.message);
    return res.status(500).json({ erro: err.message });
  }
});

// ── API: Stats ─────────────────────────────────────────────
app.get('/api/stats', requireAuth, (req, res) => {
  const pendente     = db.prepare("SELECT COUNT(*) as n FROM pedidos WHERE status = 'pendente_pagamento'").get().n;
  const recebido     = db.prepare("SELECT COUNT(*) as n FROM pedidos WHERE status = 'recebido'").get().n;
  const em_andamento = db.prepare("SELECT COUNT(*) as n FROM pedidos WHERE status = 'em_andamento'").get().n;
  const em_entrega   = db.prepare("SELECT COUNT(*) as n FROM pedidos WHERE status = 'em_entrega'").get().n;
  const concluido    = db.prepare("SELECT COUNT(*) as n FROM pedidos_historico WHERE date(concluido_em) = date('now','localtime')").get().n;
  const total_hoje   = db.prepare("SELECT COALESCE(SUM(total),0) as n FROM pedidos_historico WHERE date(concluido_em) = date('now','localtime')").get().n;
  res.json({ pendente, recebido, em_andamento, em_entrega, concluido, total_hoje });
});

// ── API: Relatórios ────────────────────────────────────────
app.get('/api/relatorios', requireAuth, (req, res) => {
  const { de, ate, formato } = req.query;
  const conditions = [];
  const params = [];
  if (de)  { conditions.push('date(criado_em) >= ?'); params.push(de); }
  if (ate) { conditions.push('date(criado_em) <= ?'); params.push(ate); }
  const where = conditions.length ? ` WHERE ${conditions.join(' AND ')}` : '';
  const pedidos = db.prepare(`SELECT * FROM pedidos_historico${where} ORDER BY criado_em DESC`).all(...params).map(parsePedidoHistorico);

  const totalFaturado = pedidos.reduce((s, p) => s + (p.total || 0), 0);
  const resumo = {
    total_pedidos: pedidos.length,
    total_faturado: totalFaturado,
    ticket_medio: pedidos.length > 0 ? totalFaturado / pedidos.length : 0,
    por_pagamento: {
      pix:     pedidos.filter(p => p.pagamento === 'pix').length,
      entrega: pedidos.filter(p => p.pagamento !== 'pix').length,
    },
  };

  if (formato === 'csv') {
    const headers = ['Número','Data','Hora','Nome','Telefone','Endereço','Itens','Acompanhamento','Pagamento','Total (R$)','Concluído em'];
    const rows = pedidos.map(p => [
      p.numero,
      (p.criado_em || '').split(' ')[0] || '',
      (p.criado_em || '').split(' ')[1] || '',
      p.nome, p.telefone || '', p.endereco,
      (p.itens || []).map(i => `${i.tamanho?.nome || ''} ${(i.sabores || []).map(s => s.nome).join('/')}`).join(' | '),
      p.acompanhamento?.nome || 'Nenhum',
      p.pagamento === 'pix' ? 'Pix' : 'Na entrega',
      Number(p.total || 0).toFixed(2).replace('.', ','),
      p.concluido_em || '',
    ]);
    const csv = [headers, ...rows].map(row => row.map(c => `"${String(c).replace(/"/g,'""')}"`).join(';')).join('\n');
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="relatorio-${de||'inicio'}-${ate||'fim'}.csv"`);
    return res.send('\ufeff' + csv);
  }

  res.json({ pedidos, resumo });
});

// ── API: Suporte ───────────────────────────────────────────
app.post('/api/suporte/chamado', requireAuth, async (req, res) => {
  const { nome, email, assunto, descricao, prioridade } = req.body;
  if (!nome || !email || !assunto || !descricao) return res.status(400).json({ erro: 'Preencha todos os campos obrigatórios' });

  // Salva no banco independentemente do email
  const usuarioId = req.session.usuario?.id || null;
  const r = db.prepare(
    'INSERT INTO chamados (nome, email, assunto, descricao, prioridade, usuario_id) VALUES (?, ?, ?, ?, ?, ?)'
  ).run(nome, email, assunto, descricao, prioridade || 'media', usuarioId);
  const chamadoId = r.lastInsertRowid;

  const smtpUser = process.env.SMTP_USER;
  const smtpPass = process.env.SMTP_PASS;
  if (!smtpUser || !smtpPass) {
    console.log(`[SUPORTE] Chamado #${chamadoId} registrado (sem SMTP): ${nome} — ${assunto}`);
    return res.json({ ok: true, mensagem: 'Chamado registrado! Nossa equipe entrará em contato em breve.' });
  }

  try {
    const transporter = nodemailer.createTransport({
      host:   process.env.SMTP_HOST || 'smtp.gmail.com',
      port:   parseInt(process.env.SMTP_PORT || '587'),
      secure: process.env.SMTP_SECURE === 'true',
      auth:   { user: smtpUser, pass: smtpPass },
      tls:    { rejectUnauthorized: false },
    });
    const prioLabel = { alta: '🔴 ALTA', media: '🟡 MÉDIA', baixa: '🟢 BAIXA' }[prioridade] || '🟡 MÉDIA';
    await transporter.sendMail({
      from:    `"Pede Pizza Suporte" <${smtpUser}>`,
      to:      process.env.SMTP_TO || 'arthurfsantos@live.com',
      replyTo: email,
      subject: `[Suporte ${prioLabel}] ${assunto}`,
      html: `<div style="font-family:sans-serif;max-width:600px"><h2>🍕 Novo Chamado #${chamadoId}</h2>
        <table style="width:100%;border-collapse:collapse">
          <tr><td style="padding:8px;font-weight:600;background:#f8fafc;border:1px solid #e2e8f0">Nome</td><td style="padding:8px;border:1px solid #e2e8f0">${nome}</td></tr>
          <tr><td style="padding:8px;font-weight:600;background:#f8fafc;border:1px solid #e2e8f0">E-mail</td><td style="padding:8px;border:1px solid #e2e8f0">${email}</td></tr>
          <tr><td style="padding:8px;font-weight:600;background:#f8fafc;border:1px solid #e2e8f0">Prioridade</td><td style="padding:8px;border:1px solid #e2e8f0">${prioLabel}</td></tr>
          <tr><td style="padding:8px;font-weight:600;background:#f8fafc;border:1px solid #e2e8f0">Assunto</td><td style="padding:8px;border:1px solid #e2e8f0">${assunto}</td></tr>
        </table>
        <h3 style="margin-top:16px">Descrição</h3>
        <div style="background:#f8fafc;padding:16px;border-radius:8px;border:1px solid #e2e8f0;white-space:pre-wrap">${descricao}</div>
      </div>`,
    });
    db.prepare('UPDATE chamados SET email_enviado = 1 WHERE id = ?').run(chamadoId);
    res.json({ ok: true, mensagem: 'Chamado enviado com sucesso!' });
  } catch (err) {
    console.error('[SUPORTE] Erro ao enviar email:', err.message);
    // Chamado já foi salvo; informa o usuário mas não retorna erro
    res.json({ ok: true, mensagem: 'Chamado registrado! (e-mail não pôde ser enviado — verifique as configurações SMTP)' });
  }
});

app.get('/api/suporte/chamados', requireAuth, (req, res) => {
  const chamados = db.prepare('SELECT * FROM chamados ORDER BY criado_em DESC LIMIT 100').all();
  res.json(chamados);
});

// ── Socket.io ──────────────────────────────────────────────
io.on('connection', socket => {
  console.log('[WS] Conectado:', socket.id);
  socket.on('disconnect', () => console.log('[WS] Desconectado:', socket.id));
});

// ── Helpers ────────────────────────────────────────────────
function parsePedido(p) {
  if (!p) return null;
  try {
    return { ...p, itens: JSON.parse(p.itens), acompanhamento: p.acompanhamento ? JSON.parse(p.acompanhamento) : null, pagamento: p.pagamento || 'entrega' };
  } catch { return { ...p, itens: [], acompanhamento: null, pagamento: p.pagamento || 'entrega' }; }
}

function parsePedidoHistorico(p) {
  return { ...parsePedido(p), concluido_em: p?.concluido_em || null };
}

// ── Inicializar ────────────────────────────────────────────
server.listen(PORT, () => {
  const hasUsers = db.prepare('SELECT COUNT(*) as n FROM usuarios').get().n > 0;
  console.log(`🍕 Dashboard em http://localhost:${PORT}`);
  console.log(`🔑 Link de acesso: http://localhost:${PORT}/${TENANT_SLUG}`);
  if (!hasUsers) console.log(`⚠️  Nenhum usuário cadastrado. Acesse o link acima para configurar.`);
});
