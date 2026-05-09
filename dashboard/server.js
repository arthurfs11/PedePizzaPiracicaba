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

const SUPER_ADMIN_HASH = bcrypt.hashSync('Plug@Dos!123', 10);

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
    criado_em TEXT DEFAULT (datetime('now','-3 hours'))
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
    criado_em     TEXT    DEFAULT (datetime('now','-3 hours')),
    atualizado_em TEXT    DEFAULT (datetime('now','-3 hours'))
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
    concluido_em  TEXT    DEFAULT (datetime('now','-3 hours'))
  );

  CREATE TABLE IF NOT EXISTS pedidos_cancelados (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    numero        TEXT    UNIQUE NOT NULL,
    nome          TEXT    NOT NULL,
    telefone      TEXT,
    endereco      TEXT    NOT NULL,
    itens         TEXT    NOT NULL,
    acompanhamento TEXT,
    pagamento     TEXT    DEFAULT 'entrega',
    total         REAL    NOT NULL,
    status        TEXT    DEFAULT 'cancelado',
    chat_id       TEXT,
    criado_em     TEXT,
    atualizado_em TEXT,
    cancelado_em  TEXT    DEFAULT (datetime('now','-3 hours')),
    entregador_id INTEGER
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
    criado_em  TEXT DEFAULT (datetime('now','-3 hours')),
    email_enviado INTEGER DEFAULT 0
  );

  INSERT OR IGNORE INTO contador (chave, valor) VALUES ('pedido', 0);
  INSERT OR IGNORE INTO config (chave, valor) VALUES ('catalog_version', '0');
`);

// ── Tabela de clientes ──────────────────────────────────────
db.exec(`
  CREATE TABLE IF NOT EXISTS clientes (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    nome          TEXT NOT NULL,
    telefone      TEXT UNIQUE NOT NULL,
    email         TEXT,
    endereco      TEXT,
    observacoes   TEXT,
    total_pedidos INTEGER DEFAULT 1,
    ultimo_pedido TEXT,
    criado_em     TEXT DEFAULT (datetime('now','-3 hours'))
  );
`);

// ── Tabelas do catálogo ─────────────────────────────────────
db.exec(`
  CREATE TABLE IF NOT EXISTS catalogo_pizzas (
    id    TEXT PRIMARY KEY,
    nome  TEXT NOT NULL,
    tipo  TEXT NOT NULL,
    ativo INTEGER DEFAULT 1,
    ordem INTEGER DEFAULT 0
  );
  CREATE TABLE IF NOT EXISTS catalogo_tamanhos (
    id     TEXT PRIMARY KEY,
    nome   TEXT NOT NULL,
    fatias INTEGER NOT NULL,
    preco  REAL NOT NULL,
    ativo  INTEGER DEFAULT 1,
    ordem  INTEGER DEFAULT 0
  );
  CREATE TABLE IF NOT EXISTS catalogo_bordas (
    id    TEXT PRIMARY KEY,
    nome  TEXT NOT NULL,
    preco REAL NOT NULL,
    ativo INTEGER DEFAULT 1,
    ordem INTEGER DEFAULT 0
  );
  CREATE TABLE IF NOT EXISTS catalogo_acompanhamentos (
    id    TEXT PRIMARY KEY,
    nome  TEXT NOT NULL,
    preco REAL NOT NULL,
    ativo INTEGER DEFAULT 1,
    ordem INTEGER DEFAULT 0
  );
`);

// Seed do catálogo na primeira execução
(function seedCatalogo() {
  if (db.prepare('SELECT COUNT(*) as n FROM catalogo_pizzas').get().n > 0) return;
  const ins = (tbl, cols) => db.prepare(`INSERT OR IGNORE INTO ${tbl} (${cols}) VALUES (${cols.split(',').map(() => '?').join(',')})`);
  const ip = ins('catalogo_pizzas', 'id,nome,tipo,ordem');
  [['calabresa','Calabresa','salgada',1],['mussarela','Mussarela','salgada',2],
   ['frango','Frango c/ Catupiry','salgada',3],['portuguesa','Portuguesa','salgada',4],
   ['quatroqueijos','Quatro Queijos','salgada',5],['pepperoni','Pepperoni','salgada',6],
   ['margherita','Margherita','salgada',7],['chocolate','Chocolate c/ Morango','doce',8],
   ['prestigio','Prestígio','doce',9],['romeujulieta','Romeu e Julieta','doce',10],
   ['nutella','Nutella','doce',11],['bananutella','Banana c/ Nutella','doce',12],
  ].forEach(r => ip.run(...r));
  const it = ins('catalogo_tamanhos', 'id,nome,fatias,preco,ordem');
  [['m','Média',6,35.00,1],['g','Grande',8,45.00,2],['f','Família',12,55.00,3]].forEach(r => it.run(...r));
  const ib = ins('catalogo_bordas', 'id,nome,preco,ordem');
  [['catupiry','Catupiry',6.00,1],['creamcheese','Cream Cheese',6.00,2],['cheddar','Cheddar',6.00,3]].forEach(r => ib.run(...r));
  const ia = ins('catalogo_acompanhamentos', 'id,nome,preco,ordem');
  [['ref','Refrigerante 2L',12.00,1],['suc','Suco 1L',8.00,2],['nan','Sem acompanhamento',0,3]].forEach(r => ia.run(...r));
  console.log('[DB] Catálogo semeado com dados padrão.');
})();

// Migrações para bancos existentes
[
  `ALTER TABLE pedidos ADD COLUMN acompanhamento TEXT`,
  `ALTER TABLE pedidos ADD COLUMN pagamento TEXT DEFAULT 'entrega'`,
  `ALTER TABLE pedidos ADD COLUMN telefone TEXT`,
  `ALTER TABLE pedidos ADD COLUMN checkout_id TEXT`,
  `ALTER TABLE pedidos ADD COLUMN pedidos_anteriores INTEGER DEFAULT 0`,
  `ALTER TABLE pedidos_historico ADD COLUMN pedidos_anteriores INTEGER DEFAULT 0`,
  `ALTER TABLE chamados ADD COLUMN status TEXT DEFAULT 'aberto'`,
  `ALTER TABLE chamados ADD COLUMN notas TEXT`,
  `ALTER TABLE chamados ADD COLUMN tenant_link TEXT`,
  `ALTER TABLE pedidos ADD COLUMN entregador_id INTEGER`,
  `ALTER TABLE pedidos_historico ADD COLUMN entregador_id INTEGER`,
].forEach(sql => { try { db.exec(sql); } catch (_) {} });

// ── Tabela de horários de funcionamento ─────────────────────
db.exec(`
  CREATE TABLE IF NOT EXISTS horarios (
    dia             INTEGER PRIMARY KEY,
    aberto          INTEGER DEFAULT 1,
    hora_abertura   TEXT DEFAULT '18:00',
    hora_fechamento TEXT DEFAULT '23:00'
  );`);
[
  [0,1],[1,0],[2,1],[3,1],[4,1],[5,1],[6,1],
].forEach(([dia, aberto]) =>
  db.prepare('INSERT OR IGNORE INTO horarios (dia,aberto,hora_abertura,hora_fechamento) VALUES (?,?,?,?)').run(dia, aberto, '18:00', '23:00')
);
db.prepare("INSERT OR IGNORE INTO config (chave, valor) VALUES ('tempo_entrega', '45')").run();

// ── Tabela de bairros / taxa de entrega ──────────────────────
db.exec(`
  CREATE TABLE IF NOT EXISTS bairros_entrega (
    id    INTEGER PRIMARY KEY AUTOINCREMENT,
    nome  TEXT NOT NULL,
    taxa  REAL NOT NULL DEFAULT 0,
    ativo INTEGER DEFAULT 1
  );`);

// ── Config de fidelidade ──────────────────────────────────────
[
  ['fidelidade_ativo',          '0'],
  ['fidelidade_pedidos',        '10'],
  ['fidelidade_desconto_tipo',  'percentual'],
  ['fidelidade_desconto_valor', '10'],
].forEach(([k, v]) => db.prepare("INSERT OR IGNORE INTO config (chave,valor) VALUES (?,?)").run(k, v));

// ── Tabela de entregadores ────────────────────────────────────
db.exec(`
  CREATE TABLE IF NOT EXISTS entregadores (
    id        INTEGER PRIMARY KEY AUTOINCREMENT,
    nome      TEXT NOT NULL,
    telefone  TEXT,
    status    TEXT DEFAULT 'disponivel',
    ativo     INTEGER DEFAULT 1,
    criado_em TEXT DEFAULT (datetime('now','-3 hours'))
  );
`);

// Gerar slug único na primeira execução
if (!db.prepare("SELECT valor FROM config WHERE chave = 'tenant_slug'").get()) {
  const slug = 'pzz-' + crypto.randomBytes(8).toString('hex');
  db.prepare("INSERT INTO config (chave, valor) VALUES ('tenant_slug', ?)").run(slug);
}
const TENANT_SLUG = db.prepare("SELECT valor FROM config WHERE chave = 'tenant_slug'").get().valor;

function incrementCatalogVersion() {
  db.prepare("UPDATE config SET valor = CAST(valor AS INTEGER) + 1 WHERE chave = 'catalog_version'").run();
}

async function notificarClienteTelegram(chatId, mensagem) {
  const token = process.env.BOT_TOKEN;
  if (!token || !chatId) return;
  try {
    await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, text: mensagem, parse_mode: 'Markdown' }),
    });
  } catch (e) {
    console.warn('[NOTIFY] Falha ao notificar Telegram:', e.message);
  }
}

function lojaAberta() {
  const now  = new Date(Date.now() - 3 * 60 * 60 * 1000); // UTC-3
  const dia  = now.getUTCDay();
  const hhmm = `${String(now.getUTCHours()).padStart(2,'0')}:${String(now.getUTCMinutes()).padStart(2,'0')}`;
  const h    = db.prepare('SELECT * FROM horarios WHERE dia = ?').get(dia);
  if (!h || !h.aberto) return { aberta: false };
  return (hhmm >= h.hora_abertura && hhmm < h.hora_fechamento) ? { aberta: true } : { aberta: false };
}

// ── Gerador Pix Copia e Cola (EMV/TLV — padrão Banco Central) ──
function _crc16Pix(str) {
  let crc = 0xFFFF;
  for (let i = 0; i < str.length; i++) {
    crc ^= str.charCodeAt(i) << 8;
    for (let j = 0; j < 8; j++) crc = (crc & 0x8000) ? ((crc << 1) ^ 0x1021) : (crc << 1);
    crc &= 0xFFFF;
  }
  return crc.toString(16).toUpperCase().padStart(4, '0');
}
function _pixCampo(id, v) { return `${id}${String(v).length.toString().padStart(2,'0')}${v}`; }
function _pixNorm(s, max) {
  return String(s||'').normalize('NFD').replace(/[̀-ͯ]/g,'').replace(/[^A-Za-z0-9 ]/g,' ').replace(/\s+/g,' ').trim().substring(0, max);
}
function gerarPixCopiaECola({ chave, nome, cidade, valor, txid }) {
  const mi  = _pixCampo('00','br.gov.bcb.pix') + _pixCampo('01', chave);
  const ad  = _pixCampo('05', (_pixNorm(txid||'PEDIDO',25).replace(/\s/g,'')));
  const p   = _pixCampo('00','01') + _pixCampo('26',mi) + _pixCampo('52','0000') + _pixCampo('53','986') +
              _pixCampo('54', Number(valor).toFixed(2)) + _pixCampo('58','BR') +
              _pixCampo('59',_pixNorm(nome,25)) + _pixCampo('60',_pixNorm(cidade,15)) +
              _pixCampo('62',ad) + '6304';
  return p + _crc16Pix(p);
}

function normalizarTelefone(tel) {
  return tel ? String(tel).replace(/\D/g, '') : null;
}

function upsertCliente(telefone, nome, endereco) {
  if (!telefone) return;
  const tel = normalizarTelefone(telefone);
  const existing = db.prepare('SELECT id FROM clientes WHERE telefone = ?').get(tel);
  if (existing) {
    db.prepare(`UPDATE clientes SET total_pedidos = total_pedidos + 1, ultimo_pedido = datetime('now','-3 hours'),
      nome = ?, endereco = COALESCE(?, endereco) WHERE telefone = ?`
    ).run(nome, endereco || null, tel);
  } else {
    db.prepare(`INSERT INTO clientes (nome, telefone, endereco, ultimo_pedido) VALUES (?, ?, ?, datetime('now','-3 hours'))`
    ).run(nome, tel, endereco || null);
  }
}

function contarPedidosAnteriores(telefone) {
  if (!telefone) return 0;
  const tel = String(telefone).replace(/\D/g, '');
  const ativo = db.prepare(`SELECT COUNT(*) as n FROM pedidos WHERE replace(replace(replace(replace(telefone,' ',''),'-',''),'(',''),')','') = ?`).get(tel);
  const hist  = db.prepare(`SELECT COUNT(*) as n FROM pedidos_historico WHERE replace(replace(replace(replace(telefone,' ',''),'-',''),'(',''),')','') = ?`).get(tel);
  return (ativo?.n || 0) + (hist?.n || 0);
}

function gerarNumeroPedido() {
  db.prepare("UPDATE contador SET valor = valor + 1 WHERE chave = 'pedido'").run();
  const { valor } = db.prepare("SELECT valor FROM contador WHERE chave = 'pedido'").get();
  // Forçar UTC-3 (Brasília) independente do timezone do servidor
  const brt = new Date(Date.now() - 3 * 60 * 60 * 1000);
  const dd  = String(brt.getUTCDate()).padStart(2, '0');
  const mm  = String(brt.getUTCMonth() + 1).padStart(2, '0');
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
  const papel = req.session?.usuario?.papel;
  if (papel !== 'admin' && papel !== 'super_admin') {
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

// Permite operador, admin e super_admin (ex: gestão do cardápio)
function requireOperadorOuAdmin(req, res, next) {
  const papel = req.session?.usuario?.papel;
  if (!['operador', 'admin', 'super_admin'].includes(papel)) {
    if (req.path.startsWith('/api/')) return res.status(403).json({ erro: 'Acesso negado' });
    return res.redirect('/');
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

  // Super admin hardcoded (acesso irrestrito a todos os tenants)
  if (usuario === 'super_admin') {
    const valid = await bcrypt.compare(senha, SUPER_ADMIN_HASH);
    if (!valid) return res.status(401).json({ erro: 'Usuário ou senha incorretos' });
    req.session.loggedIn = true;
    req.session.tenantValidated = true;
    req.session.usuario = { id: -1, nome: 'Super Admin', usuario: 'super_admin', papel: 'super_admin' };
    return res.json({ ok: true, papel: 'super_admin' });
  }

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
app.get('/home',      requireAuth,                                 (req, res) => res.sendFile(path.join(__dirname, 'public/home.html')));
app.get('/',          requireAuth, requireNotContabil,              (req, res) => res.sendFile(path.join(__dirname, 'public/index.html')));
app.get('/relatorios',requireAuth,                                 (req, res) => res.sendFile(path.join(__dirname, 'public/relatorios.html')));
app.get('/suporte',   requireAuth, requireNotContabil,             (req, res) => res.sendFile(path.join(__dirname, 'public/suporte.html')));
app.get('/usuarios',  requireAuth, requireAdmin,                   (req, res) => res.sendFile(path.join(__dirname, 'public/usuarios.html')));
app.get('/catalogo',  requireAuth, requireOperadorOuAdmin,         (req, res) => res.sendFile(path.join(__dirname, 'public/catalogo.html')));
app.get('/clientes',       requireAuth, requireAdmin, (_req, res) => res.sendFile(path.join(__dirname, 'public/clientes.html')));
app.get('/configuracoes',  requireAuth, requireAdmin, (_req, res) => res.sendFile(path.join(__dirname, 'public/configuracoes.html')));
app.get('/entregadores',   requireAuth, requireAdmin, (_req, res) => res.sendFile(path.join(__dirname, 'public/entregadores.html')));
app.get('/cancelados',     requireAuth, requireAdmin, (_req, res) => res.sendFile(path.join(__dirname, 'public/cancelados.html')));
app.get('/novo-pedido',                               (_req, res) => res.sendFile(path.join(__dirname, 'public/novo-pedido.html')));

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

// ── API: Catálogo (público — usado pelo bot também) ────────
app.get('/api/catalogo/version', (_req, res) => {
  const row = db.prepare("SELECT valor FROM config WHERE chave = 'catalog_version'").get();
  res.json({ version: parseInt(row?.valor || '0', 10) });
});

// ── Página pública do cardápio ─────────────────────────────
app.get('/cardapio', (_req, res) => res.sendFile(path.join(__dirname, 'public/cardapio.html')));

// ── API: bairros ativos (público) ──────────────────────────
app.get('/api/bairros', (_req, res) => {
  res.json(db.prepare('SELECT id, nome, taxa FROM bairros_entrega WHERE ativo=1 ORDER BY nome').all());
});

// ── API: verificar fidelidade por telefone (público) ───────
app.get('/api/fidelidade/check', (req, res) => {
  const getCfg = k => db.prepare("SELECT valor FROM config WHERE chave=?").get(k)?.valor;
  if (getCfg('fidelidade_ativo') !== '1') return res.json({ desconto: 0 });
  const tel = normalizarTelefone(req.query.tel);
  if (!tel) return res.json({ desconto: 0 });
  const prevOrders = contarPedidosAnteriores(tel);
  const fPedidos   = parseInt(getCfg('fidelidade_pedidos') || '10', 10);
  // qualifica quando o PRÓXIMO pedido seria múltiplo de fPedidos (ex: 10º, 20º...)
  const qualifica  = fPedidos > 0 && (prevOrders + 1) % fPedidos === 0;
  if (!qualifica) return res.json({ desconto: 0, proximo: fPedidos - (prevOrders % fPedidos) });
  const tipo  = getCfg('fidelidade_desconto_tipo')  || 'percentual';
  const valor = parseFloat(getCfg('fidelidade_desconto_valor') || '10');
  res.json({
    desconto: valor, tipo,
    pedido_numero: prevOrders + 1,
    mensagem: tipo === 'percentual'
      ? `🎉 ${prevOrders + 1}º pedido — ${valor}% de desconto pela sua fidelidade!`
      : `🎉 ${prevOrders + 1}º pedido — R$${valor.toFixed(2)} de desconto pela sua fidelidade!`,
  });
});

// ── API: lookup de cliente por telefone (público) ──────────
app.get('/api/clientes/lookup', (req, res) => {
  const tel = normalizarTelefone(req.query.tel);
  if (!tel || tel.length < 10) return res.json({ encontrado: false });
  const c = db.prepare('SELECT nome, endereco FROM clientes WHERE telefone = ?').get(tel);
  res.json(c?.endereco ? { encontrado: true, nome: c.nome, endereco: c.endereco } : { encontrado: false });
});

// ── API: status da loja (público — bot + web) ──────────────
app.get('/api/loja/status', (_req, res) => {
  const status   = lojaAberta();
  const horarios = db.prepare('SELECT * FROM horarios ORDER BY dia').all();
  const tempo    = db.prepare("SELECT valor FROM config WHERE chave = 'tempo_entrega'").get();
  res.json({ ...status, horarios, tempo_entrega: tempo?.valor || '45' });
});

app.get('/api/catalogo', (req, res) => {
  const pizzas   = db.prepare('SELECT * FROM catalogo_pizzas ORDER BY ordem, nome').all();
  const tamanhos = db.prepare('SELECT * FROM catalogo_tamanhos ORDER BY ordem, preco').all();
  const bordas   = db.prepare('SELECT * FROM catalogo_bordas ORDER BY ordem, nome').all();
  const acomps   = db.prepare('SELECT * FROM catalogo_acompanhamentos ORDER BY ordem, nome').all();
  const ativo    = arr => arr.filter(x => x.ativo);
  res.json({
    PIZZAS: {
      salgadas: ativo(pizzas).filter(p => p.tipo === 'salgada').map(p => ({ id: p.id, nome: p.nome })),
      doces:    ativo(pizzas).filter(p => p.tipo === 'doce'   ).map(p => ({ id: p.id, nome: p.nome })),
    },
    TAMANHOS:        ativo(tamanhos).map(t => ({ id: t.id, nome: t.nome, fatias: t.fatias, preco: t.preco })),
    BORDAS:          ativo(bordas).map(b => ({ id: b.id, nome: b.nome, preco: b.preco })),
    ACOMPANHAMENTOS: ativo(acomps).map(a => ({ id: a.id, nome: a.nome, preco: a.preco })),
    pizzas_completo:    pizzas,
    tamanhos_completo:  tamanhos,
    bordas_completo:    bordas,
    acomps_completo:    acomps,
  });
});

// ── API: Importação via CSV ────────────────────────────────
app.post('/api/catalogo/importar', requireAuth, requireOperadorOuAdmin, (req, res) => {
  const { csv } = req.body;
  if (!csv?.trim()) return res.status(400).json({ erro: 'CSV vazio' });

  const slugify = s => String(s).toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');

  const linhas = csv.split(/\r?\n/).map(l => l.trim())
    .filter(l => l && !l.startsWith('#'));

  // Pula header se presente
  const inicio = /^tipo/i.test(linhas[0]) ? 1 : 0;

  let importados = 0;
  const erros = [];

  for (let i = inicio; i < linhas.length; i++) {
    // Parseia CSV simples respeitando aspas
    const cols = [];
    let cur = '', inQ = false;
    for (const ch of linhas[i] + ',') {
      if (ch === '"') { inQ = !inQ; }
      else if (ch === ',' && !inQ) { cols.push(cur.trim()); cur = ''; }
      else cur += ch;
    }
    const [tipo, id, nome, subtipo, fatias, preco] = cols;
    const numLinha = i + 1;

    if (!tipo || !nome) { erros.push({ linha: numLinha, motivo: 'tipo e nome são obrigatórios' }); continue; }

    const idFinal = id?.trim() || slugify(nome);
    try {
      if (tipo === 'pizza') {
        const tp = ['salgada','doce'].includes(subtipo?.trim()) ? subtipo.trim() : 'salgada';
        const ord = db.prepare('SELECT COALESCE(MAX(ordem),0)+1 as n FROM catalogo_pizzas').get().n;
        db.prepare('INSERT OR REPLACE INTO catalogo_pizzas (id,nome,tipo,ativo,ordem) VALUES (?,?,?,1,?)').run(idFinal, nome, tp, ord);
      } else if (tipo === 'tamanho') {
        const fat = Math.max(1, parseInt(fatias, 10) || 8);
        const prc = Math.max(0, parseFloat(preco) || 0);
        const ord = db.prepare('SELECT COALESCE(MAX(ordem),0)+1 as n FROM catalogo_tamanhos').get().n;
        db.prepare('INSERT OR REPLACE INTO catalogo_tamanhos (id,nome,fatias,preco,ativo,ordem) VALUES (?,?,?,?,1,?)').run(idFinal, nome, fat, prc, ord);
      } else if (tipo === 'borda') {
        const prc = Math.max(0, parseFloat(preco) || 0);
        const ord = db.prepare('SELECT COALESCE(MAX(ordem),0)+1 as n FROM catalogo_bordas').get().n;
        db.prepare('INSERT OR REPLACE INTO catalogo_bordas (id,nome,preco,ativo,ordem) VALUES (?,?,?,1,?)').run(idFinal, nome, prc, ord);
      } else if (tipo === 'acompanhamento') {
        const prc = Math.max(0, parseFloat(preco) || 0);
        const ord = db.prepare('SELECT COALESCE(MAX(ordem),0)+1 as n FROM catalogo_acompanhamentos').get().n;
        db.prepare('INSERT OR REPLACE INTO catalogo_acompanhamentos (id,nome,preco,ativo,ordem) VALUES (?,?,?,1,?)').run(idFinal, nome, prc, ord);
      } else {
        erros.push({ linha: numLinha, motivo: `tipo desconhecido: "${tipo}"` }); continue;
      }
      importados++;
    } catch (err) {
      erros.push({ linha: numLinha, motivo: err.message });
    }
  }

  if (importados > 0) incrementCatalogVersion();
  res.json({ importados, erros });
});

app.post('/api/catalogo/pizzas', requireAuth, requireOperadorOuAdmin, (req, res) => {
  const { id, nome, tipo } = req.body;
  if (!id || !nome || !['salgada','doce'].includes(tipo)) return res.status(400).json({ erro: 'Dados inválidos' });
  const idNorm = id.toLowerCase().replace(/[\s\W]+/g, '');
  try {
    const ordem = db.prepare('SELECT COALESCE(MAX(ordem),0)+1 as n FROM catalogo_pizzas').get().n;
    db.prepare('INSERT INTO catalogo_pizzas (id,nome,tipo,ativo,ordem) VALUES (?,?,?,1,?)').run(idNorm, nome, tipo, ordem);
    incrementCatalogVersion();
    res.status(201).json(db.prepare('SELECT * FROM catalogo_pizzas WHERE id=?').get(idNorm));
  } catch(e) {
    if (e.message.includes('UNIQUE')) return res.status(400).json({ erro: 'ID já existe' });
    res.status(500).json({ erro: e.message });
  }
});
app.patch('/api/catalogo/pizzas/:id', requireAuth, requireOperadorOuAdmin, (req, res) => {
  const item = db.prepare('SELECT * FROM catalogo_pizzas WHERE id=?').get(req.params.id);
  if (!item) return res.status(404).json({ erro: 'Item não encontrado' });
  const { nome, tipo, ativo } = req.body;
  db.prepare('UPDATE catalogo_pizzas SET nome=?,tipo=?,ativo=? WHERE id=?').run(
    nome ?? item.nome, tipo ?? item.tipo, ativo !== undefined ? (ativo ? 1 : 0) : item.ativo, req.params.id);
  incrementCatalogVersion();
  res.json(db.prepare('SELECT * FROM catalogo_pizzas WHERE id=?').get(req.params.id));
});
app.delete('/api/catalogo/pizzas/:id', requireAuth, requireOperadorOuAdmin, (req, res) => {
  db.prepare('DELETE FROM catalogo_pizzas WHERE id=?').run(req.params.id);
  incrementCatalogVersion();
  res.json({ ok: true });
});

app.post('/api/catalogo/tamanhos', requireAuth, requireOperadorOuAdmin, (req, res) => {
  const { id, nome, fatias, preco } = req.body;
  if (!id || !nome || !fatias || preco === undefined) return res.status(400).json({ erro: 'Dados inválidos' });
  try {
    const ordem = db.prepare('SELECT COALESCE(MAX(ordem),0)+1 as n FROM catalogo_tamanhos').get().n;
    db.prepare('INSERT INTO catalogo_tamanhos (id,nome,fatias,preco,ativo,ordem) VALUES (?,?,?,?,1,?)').run(id, nome, fatias, preco, ordem);
    incrementCatalogVersion();
    res.status(201).json(db.prepare('SELECT * FROM catalogo_tamanhos WHERE id=?').get(id));
  } catch(e) {
    if (e.message.includes('UNIQUE')) return res.status(400).json({ erro: 'ID já existe' });
    res.status(500).json({ erro: e.message });
  }
});
app.patch('/api/catalogo/tamanhos/:id', requireAuth, requireOperadorOuAdmin, (req, res) => {
  const item = db.prepare('SELECT * FROM catalogo_tamanhos WHERE id=?').get(req.params.id);
  if (!item) return res.status(404).json({ erro: 'Item não encontrado' });
  const { nome, fatias, preco, ativo } = req.body;
  db.prepare('UPDATE catalogo_tamanhos SET nome=?,fatias=?,preco=?,ativo=? WHERE id=?').run(
    nome ?? item.nome, fatias ?? item.fatias, preco ?? item.preco, ativo !== undefined ? (ativo ? 1 : 0) : item.ativo, req.params.id);
  incrementCatalogVersion();
  res.json(db.prepare('SELECT * FROM catalogo_tamanhos WHERE id=?').get(req.params.id));
});
app.delete('/api/catalogo/tamanhos/:id', requireAuth, requireOperadorOuAdmin, (req, res) => {
  db.prepare('DELETE FROM catalogo_tamanhos WHERE id=?').run(req.params.id);
  incrementCatalogVersion();
  res.json({ ok: true });
});

app.post('/api/catalogo/bordas', requireAuth, requireOperadorOuAdmin, (req, res) => {
  const { id, nome, preco } = req.body;
  if (!id || !nome || preco === undefined) return res.status(400).json({ erro: 'Dados inválidos' });
  try {
    const ordem = db.prepare('SELECT COALESCE(MAX(ordem),0)+1 as n FROM catalogo_bordas').get().n;
    db.prepare('INSERT INTO catalogo_bordas (id,nome,preco,ativo,ordem) VALUES (?,?,?,1,?)').run(id, nome, preco, ordem);
    incrementCatalogVersion();
    res.status(201).json(db.prepare('SELECT * FROM catalogo_bordas WHERE id=?').get(id));
  } catch(e) {
    if (e.message.includes('UNIQUE')) return res.status(400).json({ erro: 'ID já existe' });
    res.status(500).json({ erro: e.message });
  }
});
app.patch('/api/catalogo/bordas/:id', requireAuth, requireOperadorOuAdmin, (req, res) => {
  const item = db.prepare('SELECT * FROM catalogo_bordas WHERE id=?').get(req.params.id);
  if (!item) return res.status(404).json({ erro: 'Item não encontrado' });
  const { nome, preco, ativo } = req.body;
  db.prepare('UPDATE catalogo_bordas SET nome=?,preco=?,ativo=? WHERE id=?').run(
    nome ?? item.nome, preco ?? item.preco, ativo !== undefined ? (ativo ? 1 : 0) : item.ativo, req.params.id);
  incrementCatalogVersion();
  res.json(db.prepare('SELECT * FROM catalogo_bordas WHERE id=?').get(req.params.id));
});
app.delete('/api/catalogo/bordas/:id', requireAuth, requireOperadorOuAdmin, (req, res) => {
  db.prepare('DELETE FROM catalogo_bordas WHERE id=?').run(req.params.id);
  incrementCatalogVersion();
  res.json({ ok: true });
});

app.post('/api/catalogo/acompanhamentos', requireAuth, requireOperadorOuAdmin, (req, res) => {
  const { id, nome, preco } = req.body;
  if (!id || !nome || preco === undefined) return res.status(400).json({ erro: 'Dados inválidos' });
  try {
    const ordem = db.prepare('SELECT COALESCE(MAX(ordem),0)+1 as n FROM catalogo_acompanhamentos').get().n;
    db.prepare('INSERT INTO catalogo_acompanhamentos (id,nome,preco,ativo,ordem) VALUES (?,?,?,1,?)').run(id, nome, preco, ordem);
    incrementCatalogVersion();
    res.status(201).json(db.prepare('SELECT * FROM catalogo_acompanhamentos WHERE id=?').get(id));
  } catch(e) {
    if (e.message.includes('UNIQUE')) return res.status(400).json({ erro: 'ID já existe' });
    res.status(500).json({ erro: e.message });
  }
});
app.patch('/api/catalogo/acompanhamentos/:id', requireAuth, requireOperadorOuAdmin, (req, res) => {
  const item = db.prepare('SELECT * FROM catalogo_acompanhamentos WHERE id=?').get(req.params.id);
  if (!item) return res.status(404).json({ erro: 'Item não encontrado' });
  const { nome, preco, ativo } = req.body;
  db.prepare('UPDATE catalogo_acompanhamentos SET nome=?,preco=?,ativo=? WHERE id=?').run(
    nome ?? item.nome, preco ?? item.preco, ativo !== undefined ? (ativo ? 1 : 0) : item.ativo, req.params.id);
  incrementCatalogVersion();
  res.json(db.prepare('SELECT * FROM catalogo_acompanhamentos WHERE id=?').get(req.params.id));
});
app.delete('/api/catalogo/acompanhamentos/:id', requireAuth, requireOperadorOuAdmin, (req, res) => {
  db.prepare('DELETE FROM catalogo_acompanhamentos WHERE id=?').run(req.params.id);
  incrementCatalogVersion();
  res.json({ ok: true });
});

// ── API: Receber pedido — SEM auth (chamado pelo n8n) ──────
app.post('/api/pedidos', (req, res) => {
  try {
    const { nome, telefone, endereco, pizzas, acompanhamento, pagamento, total, telegram_chat_id, checkout_id } = req.body;
    if (!nome || !endereco || !pizzas || !Array.isArray(pizzas) || pizzas.length === 0) {
      return res.status(400).json({ erro: 'Dados do pedido incompletos' });
    }
    const numero             = gerarNumeroPedido();
    const itensJson          = JSON.stringify(pizzas);
    const acompJson          = acompanhamento ? JSON.stringify(acompanhamento) : null;
    const statusInicial      = (pagamento === 'pix') ? 'pendente_pagamento' : 'recebido';
    const pedidosAnteriores  = contarPedidosAnteriores(telefone);

    db.prepare(`
      INSERT INTO pedidos (numero, nome, telefone, endereco, itens, acompanhamento, pagamento, total, status, chat_id, checkout_id, pedidos_anteriores, criado_em, atualizado_em)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now','-3 hours'), datetime('now','-3 hours'))
    `).run(numero, nome, telefone || null, endereco, itensJson, acompJson, pagamento || 'entrega', total, statusInicial, telegram_chat_id || null, checkout_id || null, pedidosAnteriores);

    upsertCliente(telefone, nome, endereco);
    const pedido = parsePedido(db.prepare('SELECT * FROM pedidos WHERE numero = ?').get(numero));
    io.emit('novo_pedido', pedido);
    console.log(`[PEDIDO] ${numero} — ${nome}`);
    return res.status(201).json({ numero, status: statusInicial, pedido });
  } catch (err) {
    console.error('[API] Erro ao salvar pedido:', err.message);
    return res.status(500).json({ erro: 'Erro interno ao salvar pedido' });
  }
});

// ── API: Pedido manual (operador via portal) ────────────────
app.post('/api/pedidos/manual', requireAuth, requireNotContabil, (req, res) => {
  try {
    const { nome, telefone, endereco, pizzas, acompanhamento, pagamento, total } = req.body;
    if (!nome || !endereco || !Array.isArray(pizzas) || pizzas.length === 0) {
      return res.status(400).json({ erro: 'Dados do pedido incompletos' });
    }
    const numero            = gerarNumeroPedido();
    const statusInicial     = pagamento === 'pix' ? 'pendente_pagamento' : 'recebido';
    const pedidosAnteriores = contarPedidosAnteriores(telefone);
    db.prepare(`
      INSERT INTO pedidos (numero,nome,telefone,endereco,itens,acompanhamento,pagamento,total,status,pedidos_anteriores,criado_em,atualizado_em)
      VALUES (?,?,?,?,?,?,?,?,?,?,datetime('now','-3 hours'),datetime('now','-3 hours'))
    `).run(numero, nome, telefone || null, endereco,
           JSON.stringify(pizzas),
           acompanhamento ? JSON.stringify(acompanhamento) : null,
           pagamento || 'entrega', total || 0, statusInicial, pedidosAnteriores);
    upsertCliente(telefone, nome, endereco);
    const pedido = parsePedido(db.prepare('SELECT * FROM pedidos WHERE numero=?').get(numero));
    io.emit('novo_pedido', pedido);
    console.log(`[PEDIDO MANUAL] ${numero} — ${nome} (por: ${req.session.usuario?.usuario})`);
    return res.status(201).json({ numero, status: statusInicial, pedido });
  } catch (err) {
    console.error('[PEDIDO MANUAL] Erro:', err.message);
    return res.status(500).json({ erro: 'Erro interno ao salvar pedido' });
  }
});

// ── API: Pedido via web chat (público) ─────────────────────
app.post('/api/pedidos/web', async (req, res) => {
  try {
    const { nome, telefone, endereco, pizzas, acompanhamento, pagamento, total } = req.body;
    if (!nome || !endereco || !Array.isArray(pizzas) || pizzas.length === 0)
      return res.status(400).json({ erro: 'Dados do pedido incompletos' });

    const numero            = gerarNumeroPedido();
    const statusInicial     = pagamento === 'pix' ? 'pendente_pagamento' : 'recebido';
    const pedidosAnteriores = contarPedidosAnteriores(telefone);

    db.prepare(`
      INSERT INTO pedidos (numero,nome,telefone,endereco,itens,acompanhamento,pagamento,total,status,pedidos_anteriores,criado_em,atualizado_em)
      VALUES (?,?,?,?,?,?,?,?,?,?,datetime('now','-3 hours'),datetime('now','-3 hours'))
    `).run(numero, nome, telefone || null, endereco,
           JSON.stringify(pizzas),
           acompanhamento ? JSON.stringify(acompanhamento) : null,
           pagamento || 'entrega', total || 0, statusInicial, pedidosAnteriores);

    upsertCliente(telefone, nome, endereco);
    const pedido = parsePedido(db.prepare('SELECT * FROM pedidos WHERE numero=?').get(numero));
    io.emit('novo_pedido', pedido);

    const resp = { numero, status: statusInicial, pedido };

    if (pagamento === 'pix') {
      // Tenta AbacatePay primeiro
      const abacateKey = process.env.ABACATEPAY_API_KEY;
      if (abacateKey) {
        try {
          const descricao = pizzas.map(p =>
            `${p.tamanho?.nome||''} ${(p.sabores||[]).map(s=>s.nome||s).join('/')}`
          ).join(', ');
          let celular = null;
          if (telefone) {
            const d = telefone.replace(/\D/g,'');
            celular = d.startsWith('55') ? `+${d}` : `+55${d}`;
          }
          const abPayload = {
            frequency: 'ONE_TIME', methods: ['PIX'],
            products: [{ externalId: `web-${Date.now()}`, name: 'Pedido Pede Pizza',
              description: descricao || 'Pedido via Web', quantity: 1,
              price: Math.round((total||0)*100) }],
            customer: { name: nome, ...(celular && { cellphone: celular }) },
            ...(process.env.ABACATEPAY_RETURN_URL && {
              returnUrl: process.env.ABACATEPAY_RETURN_URL,
              completionUrl: process.env.ABACATEPAY_RETURN_URL,
            }),
          };
          const abResp = await fetch('https://api.abacatepay.com/v1/billing/create', {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${abacateKey}`, 'Content-Type': 'application/json' },
            body: JSON.stringify(abPayload),
            signal: AbortSignal.timeout(12000),
          });
          const abData = await abResp.json();
          if (abData?.data?.id && abData?.data?.url) {
            db.prepare('UPDATE pedidos SET checkout_id=? WHERE numero=?').run(abData.data.id, numero);
            resp.checkout_url = abData.data.url;
          }
        } catch (e) {
          console.warn('[WEB PIX] AbacatePay falhou:', e.message);
        }
      }

      // Fallback: Pix Copia e Cola manual
      if (!resp.checkout_url) {
        const pixKey  = process.env.PIX_KEY;
        const pixNome = process.env.PIX_NOME   || 'Pede Pizza Piracicaba';
        const pixCid  = process.env.PIX_CIDADE || 'Piracicaba';
        if (pixKey) {
          const txid = numero.replace(/[^A-Za-z0-9]/g,'').substring(0,25);
          resp.pix_code  = gerarPixCopiaECola({ chave: pixKey, nome: pixNome, cidade: pixCid, valor: total||0, txid });
          resp.pix_valor = total;
        }
      }
    }

    console.log(`[PEDIDO WEB] ${numero} — ${nome}`);
    return res.status(201).json(resp);
  } catch (err) {
    console.error('[WEB] Erro ao salvar pedido:', err.message);
    return res.status(500).json({ erro: 'Erro interno ao salvar pedido' });
  }
});

// ── API: Editar pedido ──────────────────────────────────────
app.put('/api/pedidos/:numero', requireAuth, requireNotContabil, (req, res) => {
  try {
    const { numero } = req.params;
    const { nome, telefone, endereco, itens, acompanhamento, pagamento, total } = req.body;
    const pedido = db.prepare('SELECT * FROM pedidos WHERE numero=?').get(numero);
    if (!pedido) return res.status(404).json({ erro: 'Pedido não encontrado' });
    db.prepare(`
      UPDATE pedidos SET nome=?,telefone=?,endereco=?,itens=?,acompanhamento=?,pagamento=?,total=?,
        atualizado_em=datetime('now','-3 hours')
      WHERE numero=?
    `).run(
      nome     ?? pedido.nome,
      telefone !== undefined ? (telefone || null) : pedido.telefone,
      endereco ?? pedido.endereco,
      itens    ? JSON.stringify(itens) : pedido.itens,
      acompanhamento !== undefined ? (acompanhamento ? JSON.stringify(acompanhamento) : null) : pedido.acompanhamento,
      pagamento ?? pedido.pagamento,
      total     ?? pedido.total,
      numero
    );
    const atualizado = parsePedido(db.prepare('SELECT * FROM pedidos WHERE numero=?').get(numero));
    io.emit('pedido_atualizado', atualizado);
    return res.json(atualizado);
  } catch (err) {
    console.error('[PUT /pedidos] Erro:', err.message);
    return res.status(500).json({ erro: err.message });
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

  db.prepare("UPDATE pedidos SET status = 'recebido', atualizado_em = datetime('now','-3 hours') WHERE numero = ?").run(pedido.numero);
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
    "SELECT * FROM pedidos_historico WHERE date(concluido_em) = date('now','-3 hours') ORDER BY concluido_em ASC"
  ).all();
  res.json(pedidos.map(parsePedidoHistorico));
});

app.get('/api/pedidos/cancelados-hoje', requireAuth, (req, res) => {
  const pedidos = db.prepare(
    "SELECT * FROM pedidos_cancelados WHERE date(cancelado_em) = date('now','-3 hours') ORDER BY cancelado_em ASC"
  ).all();
  res.json(pedidos.map(parsePedidoCancelado));
});

app.get('/api/pedidos/cancelados', requireAuth, (req, res) => {
  const { de, ate } = req.query;
  const conditions = [];
  const params = [];
  if (de)  { conditions.push('date(cancelado_em) >= ?'); params.push(de); }
  if (ate) { conditions.push('date(cancelado_em) <= ?'); params.push(ate); }
  const where = conditions.length ? ' WHERE ' + conditions.join(' AND ') : '';
  const pedidos = db.prepare(
    `SELECT * FROM pedidos_cancelados${where} ORDER BY cancelado_em DESC`
  ).all(...params).map(parsePedidoCancelado);
  const totalValor = pedidos.reduce((s, p) => s + (p.total || 0), 0);
  res.json({
    pedidos,
    resumo: {
      total_pedidos: pedidos.length,
      total_valor:   totalValor,
      por_pagamento: {
        pix:     pedidos.filter(p => p.pagamento === 'pix').length,
        entrega: pedidos.filter(p => p.pagamento !== 'pix').length,
      },
    },
  });
});

app.patch('/api/pedidos/:numero/status', requireAuth, async (req, res) => {
  try {
    const { numero } = req.params;
    const { status } = req.body;
    const statusValidos = ['pendente_pagamento', 'recebido', 'em_andamento', 'em_entrega', 'concluido', 'cancelado'];
    if (!statusValidos.includes(status)) return res.status(400).json({ erro: 'Status inválido' });

    const pedido = db.prepare('SELECT * FROM pedidos WHERE numero = ?').get(numero);
    if (!pedido) return res.status(404).json({ erro: 'Pedido não encontrado' });

    const notifMsgs = {
      recebido:     `✅ *Pedido #${numero} recebido!*\nEstamos confirmando o seu pedido.`,
      em_andamento: `🍕 *Seu pedido #${numero} está sendo preparado!*\nJá estamos na cozinha. 👨‍🍳`,
      em_entrega:   `🛵 *Seu pedido #${numero} saiu para entrega!*\nEm breve chegará até você. 😊`,
      concluido:    `✅ *Pedido #${numero} entregue!*\nBom apetite! Obrigado pela preferência. 🍕`,
    };

    // ── Lógica de entregadores ───────────────────────────────
    // Auto-atribuir quando saindo para entrega
    if (status === 'em_entrega' && !pedido.entregador_id) {
      const disp = db.prepare("SELECT id FROM entregadores WHERE ativo = 1 AND status = 'disponivel' ORDER BY id LIMIT 1").get();
      if (disp) {
        db.prepare('UPDATE pedidos SET entregador_id = ? WHERE numero = ?').run(disp.id, numero);
        db.prepare("UPDATE entregadores SET status = 'ocupado' WHERE id = ?").run(disp.id);
        pedido.entregador_id = disp.id;
        io.emit('entregadores_atualizados');
      }
    }
    // Liberar entregador ao sair de em_entrega
    if (pedido.status === 'em_entrega' && status !== 'em_entrega' && pedido.entregador_id) {
      const outrosAtivos = db.prepare(
        "SELECT COUNT(*) as n FROM pedidos WHERE entregador_id = ? AND numero != ? AND status = 'em_entrega'"
      ).get(pedido.entregador_id, numero).n;
      if (outrosAtivos === 0) {
        db.prepare("UPDATE entregadores SET status = 'disponivel' WHERE id = ?").run(pedido.entregador_id);
        io.emit('entregadores_atualizados');
      }
      if (status !== 'concluido') {
        db.prepare('UPDATE pedidos SET entregador_id = NULL WHERE numero = ?').run(numero);
      }
    }

    if (status === 'cancelado') {
      // Liberar entregador se estiver atribuído
      if (pedido.entregador_id) {
        const outrosAtivos = db.prepare(
          "SELECT COUNT(*) as n FROM pedidos WHERE entregador_id = ? AND numero != ? AND status = 'em_entrega'"
        ).get(pedido.entregador_id, numero).n;
        if (outrosAtivos === 0) {
          db.prepare("UPDATE entregadores SET status = 'disponivel' WHERE id = ?").run(pedido.entregador_id);
          io.emit('entregadores_atualizados');
        }
      }
      db.transaction(() => {
        db.prepare(`
          INSERT OR REPLACE INTO pedidos_cancelados
            (numero, nome, telefone, endereco, itens, acompanhamento, pagamento, total, status, chat_id,
             criado_em, atualizado_em, cancelado_em, entregador_id)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'cancelado', ?, ?, datetime('now','-3 hours'), datetime('now','-3 hours'), ?)
        `).run(pedido.numero, pedido.nome, pedido.telefone, pedido.endereco, pedido.itens,
               pedido.acompanhamento, pedido.pagamento, pedido.total, pedido.chat_id, pedido.criado_em,
               pedido.entregador_id || null);
        db.prepare('DELETE FROM pedidos WHERE numero = ?').run(numero);
      })();

      const canceladoRow = db.prepare('SELECT * FROM pedidos_cancelados WHERE numero = ?').get(numero);
      const cancelado = parsePedidoCancelado(canceladoRow);
      io.emit('pedido_atualizado', cancelado);
      io.to(`pedido:${numero}`).emit('status_pedido', { status: 'cancelado', numero });
      if (pedido.chat_id) {
        await notificarClienteTelegram(pedido.chat_id,
          `❌ *Pedido #${numero} cancelado.*\nSe tiver dúvidas, entre em contato conosco.`);
      }
      return res.json(cancelado);
    }

    if (status === 'concluido') {
      db.transaction(() => {
        db.prepare(`
          INSERT OR REPLACE INTO pedidos_historico
            (numero, nome, telefone, endereco, itens, acompanhamento, pagamento, total, status, chat_id,
             criado_em, atualizado_em, concluido_em, entregador_id)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'concluido', ?, ?, datetime('now','-3 hours'), datetime('now','-3 hours'), ?)
        `).run(pedido.numero, pedido.nome, pedido.telefone, pedido.endereco, pedido.itens,
               pedido.acompanhamento, pedido.pagamento, pedido.total, pedido.chat_id, pedido.criado_em,
               pedido.entregador_id || null);
        db.prepare('DELETE FROM pedidos WHERE numero = ?').run(numero);
      })();

      const historico = db.prepare('SELECT * FROM pedidos_historico WHERE numero = ?').get(numero);
      const concluido = parsePedidoHistorico(historico);
      io.emit('pedido_atualizado', concluido);
      io.to(`pedido:${numero}`).emit('status_pedido', { status: 'concluido', numero });
      if (pedido.chat_id) await notificarClienteTelegram(pedido.chat_id, notifMsgs.concluido);
      return res.json(concluido);
    }

    db.prepare("UPDATE pedidos SET status = ?, atualizado_em = datetime('now','-3 hours') WHERE numero = ?").run(status, numero);
    const atualizado = parsePedido(db.prepare('SELECT * FROM pedidos WHERE numero = ?').get(numero));
    io.emit('pedido_atualizado', atualizado);
    io.to(`pedido:${numero}`).emit('status_pedido', { status, numero });
    if (pedido.chat_id && notifMsgs[status]) await notificarClienteTelegram(pedido.chat_id, notifMsgs[status]);
    return res.json(atualizado);
  } catch (err) {
    console.error('[PATCH /status] Erro:', err.message);
    return res.status(500).json({ erro: err.message });
  }
});

// ── API: Entregadores ──────────────────────────────────────
app.get('/api/entregadores', requireAuth, (req, res) => {
  const all = req.query.todos === '1'
    ? db.prepare('SELECT * FROM entregadores ORDER BY nome').all()
    : db.prepare('SELECT * FROM entregadores WHERE ativo = 1 ORDER BY nome').all();
  const result = all.map(e => ({
    ...e,
    pedidos_ativos: db.prepare("SELECT COUNT(*) as n FROM pedidos WHERE entregador_id = ? AND status = 'em_entrega'").get(e.id).n,
  }));
  res.json(result);
});

app.post('/api/entregadores', requireAuth, requireAdmin, (req, res) => {
  const { nome, telefone } = req.body;
  if (!nome?.trim()) return res.status(400).json({ erro: 'Nome é obrigatório' });
  const r = db.prepare('INSERT INTO entregadores (nome, telefone) VALUES (?, ?)').run(nome.trim(), telefone?.trim() || null);
  res.status(201).json(db.prepare('SELECT * FROM entregadores WHERE id = ?').get(r.lastInsertRowid));
});

app.patch('/api/entregadores/:id', requireAuth, requireAdmin, (req, res) => {
  const id = parseInt(req.params.id, 10);
  const e  = db.prepare('SELECT * FROM entregadores WHERE id = ?').get(id);
  if (!e) return res.status(404).json({ erro: 'Entregador não encontrado' });
  const { nome, telefone, status, ativo } = req.body;
  db.prepare('UPDATE entregadores SET nome=?, telefone=?, status=?, ativo=? WHERE id=?').run(
    nome     !== undefined ? nome.trim()       : e.nome,
    telefone !== undefined ? (telefone?.trim() || null) : e.telefone,
    status   !== undefined ? status            : e.status,
    ativo    !== undefined ? (ativo ? 1 : 0)   : e.ativo,
    id
  );
  res.json(db.prepare('SELECT * FROM entregadores WHERE id = ?').get(id));
});

app.delete('/api/entregadores/:id', requireAuth, requireAdmin, (req, res) => {
  const id = parseInt(req.params.id, 10);
  db.prepare('UPDATE entregadores SET ativo = 0 WHERE id = ?').run(id);
  res.json({ ok: true });
});

// ── API: Atribuir entregador a pedido ──────────────────────
app.patch('/api/pedidos/:numero/entregador', requireAuth, (req, res) => {
  const { numero } = req.params;
  const { entregador_id } = req.body;

  const pedido = db.prepare('SELECT * FROM pedidos WHERE numero = ?').get(numero);
  if (!pedido) return res.status(404).json({ erro: 'Pedido não encontrado' });

  // Liberar entregador anterior (se não tem outros pedidos ativos)
  if (pedido.entregador_id && pedido.entregador_id !== entregador_id) {
    const outros = db.prepare(
      "SELECT COUNT(*) as n FROM pedidos WHERE entregador_id = ? AND numero != ? AND status = 'em_entrega'"
    ).get(pedido.entregador_id, numero).n;
    if (outros === 0) db.prepare("UPDATE entregadores SET status = 'disponivel' WHERE id = ?").run(pedido.entregador_id);
  }

  // Atribuir novo entregador
  if (entregador_id) db.prepare("UPDATE entregadores SET status = 'ocupado' WHERE id = ?").run(entregador_id);
  db.prepare('UPDATE pedidos SET entregador_id = ? WHERE numero = ?').run(entregador_id || null, numero);

  const atualizado = parsePedido(db.prepare('SELECT * FROM pedidos WHERE numero = ?').get(numero));
  io.emit('pedido_atualizado', atualizado);
  io.emit('entregadores_atualizados');
  res.json(atualizado);
});

// ── API: Stats ─────────────────────────────────────────────
app.get('/api/stats', requireAuth, (req, res) => {
  const pendente     = db.prepare("SELECT COUNT(*) as n FROM pedidos WHERE status = 'pendente_pagamento'").get().n;
  const recebido     = db.prepare("SELECT COUNT(*) as n FROM pedidos WHERE status = 'recebido'").get().n;
  const em_andamento = db.prepare("SELECT COUNT(*) as n FROM pedidos WHERE status = 'em_andamento'").get().n;
  const em_entrega   = db.prepare("SELECT COUNT(*) as n FROM pedidos WHERE status = 'em_entrega'").get().n;
  const concluido    = db.prepare("SELECT COUNT(*) as n FROM pedidos_historico WHERE date(concluido_em) = date('now','-3 hours')").get().n;
  const cancelado    = db.prepare("SELECT COUNT(*) as n FROM pedidos_cancelados WHERE date(cancelado_em) = date('now','-3 hours')").get().n;
  const total_hoje   = db.prepare("SELECT COALESCE(SUM(total),0) as n FROM pedidos_historico WHERE date(concluido_em) = date('now','-3 hours')").get().n;
  res.json({ pendente, recebido, em_andamento, em_entrega, concluido, cancelado, total_hoje });
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

// ── API: Métricas (últimos N dias) ─────────────────────────
app.get('/api/metricas', requireAuth, (req, res) => {
  const dias = Math.min(Math.max(parseInt(req.query.dias) || 30, 1), 365);
  const pedidos = db.prepare(
    `SELECT * FROM pedidos_historico WHERE date(criado_em) >= date('now','-${dias} days','localtime') ORDER BY criado_em ASC`
  ).all().map(parsePedidoHistorico);

  const dailyMap = {};
  const pizzaCount = {};
  pedidos.forEach(p => {
    const dia = (p.criado_em || '').substring(0, 10);
    if (!dailyMap[dia]) dailyMap[dia] = { data: dia, pedidos: 0, faturado: 0 };
    dailyMap[dia].pedidos++;
    dailyMap[dia].faturado = Math.round((dailyMap[dia].faturado + (p.total || 0)) * 100) / 100;
    (p.itens || []).forEach(item => {
      (item.sabores || []).forEach(s => {
        const nome = s.nome || s;
        pizzaCount[nome] = (pizzaCount[nome] || 0) + 1;
      });
    });
  });

  const totalFaturado = pedidos.reduce((s, p) => s + (p.total || 0), 0);
  res.json({
    total_pedidos:  pedidos.length,
    total_faturado: Math.round(totalFaturado * 100) / 100,
    ticket_medio:   pedidos.length > 0 ? Math.round(totalFaturado / pedidos.length * 100) / 100 : 0,
    por_pagamento:  { pix: pedidos.filter(p => p.pagamento === 'pix').length, entrega: pedidos.filter(p => p.pagamento !== 'pix').length },
    por_dia:        Object.values(dailyMap).sort((a, b) => a.data.localeCompare(b.data)),
    pizzas_mais_vendidas: Object.entries(pizzaCount).map(([nome, qtd]) => ({ nome, qtd })).sort((a, b) => b.qtd - a.qtd).slice(0, 10),
  });
});

// ── API: Suporte ───────────────────────────────────────────
app.post('/api/suporte/chamado', requireAuth, async (req, res) => {
  const { nome, email, assunto, descricao, prioridade } = req.body;
  if (!nome || !email || !assunto || !descricao) return res.status(400).json({ erro: 'Preencha todos os campos obrigatórios' });

  // Salva no banco independentemente do email
  const usuarioId  = req.session.usuario?.id || null;
  const tenantLink = `${req.protocol}://${req.get('host')}/${TENANT_SLUG}`;
  const r = db.prepare(
    'INSERT INTO chamados (nome, email, assunto, descricao, prioridade, usuario_id, tenant_link) VALUES (?, ?, ?, ?, ?, ?, ?)'
  ).run(nome, email, assunto, descricao, prioridade || 'media', usuarioId, tenantLink);
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
          <tr><td style="padding:8px;font-weight:600;background:#f8fafc;border:1px solid #e2e8f0">Tenant Link</td><td style="padding:8px;border:1px solid #e2e8f0"><a href="${tenantLink}">${tenantLink}</a></td></tr>
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

app.patch('/api/suporte/chamados/:id', requireAuth, requireAdmin, (req, res) => {
  const id = parseInt(req.params.id, 10);
  const { status, notas } = req.body;
  const chamado = db.prepare('SELECT * FROM chamados WHERE id = ?').get(id);
  if (!chamado) return res.status(404).json({ erro: 'Chamado não encontrado' });
  db.prepare(
    'UPDATE chamados SET status = ?, notas = ? WHERE id = ?'
  ).run(status ?? chamado.status ?? 'aberto', notas !== undefined ? notas : chamado.notas, id);
  res.json(db.prepare('SELECT * FROM chamados WHERE id = ?').get(id));
});

// ── API: Clientes ───────────────────────────────────────────
app.get('/api/clientes', requireAuth, requireAdmin, (req, res) => {
  const q = req.query.q ? `%${req.query.q}%` : null;
  const rows = q
    ? db.prepare('SELECT * FROM clientes WHERE nome LIKE ? OR telefone LIKE ? ORDER BY ultimo_pedido DESC LIMIT 200').all(q, q)
    : db.prepare('SELECT * FROM clientes ORDER BY ultimo_pedido DESC LIMIT 200').all();
  res.json(rows);
});

app.post('/api/clientes', requireAuth, requireAdmin, (req, res) => {
  const { nome, email, endereco, observacoes } = req.body;
  const telefone = normalizarTelefone(req.body.telefone);
  if (!nome || !telefone) return res.status(400).json({ erro: 'Nome e telefone são obrigatórios' });
  try {
    const r = db.prepare(
      `INSERT INTO clientes (nome, telefone, email, endereco, observacoes, ultimo_pedido) VALUES (?, ?, ?, ?, ?, datetime('now','-3 hours'))`
    ).run(nome, telefone, email || null, endereco || null, observacoes || null);
    res.status(201).json(db.prepare('SELECT * FROM clientes WHERE id = ?').get(r.lastInsertRowid));
  } catch (err) {
    if (err.message.includes('UNIQUE')) return res.status(409).json({ erro: 'Já existe um cliente com esse telefone' });
    res.status(500).json({ erro: err.message });
  }
});

app.patch('/api/clientes/:id', requireAuth, requireAdmin, (req, res) => {
  const id = parseInt(req.params.id, 10);
  const { nome, email, endereco, observacoes } = req.body;
  const telefone = req.body.telefone !== undefined ? normalizarTelefone(req.body.telefone) : undefined;
  const c = db.prepare('SELECT * FROM clientes WHERE id = ?').get(id);
  if (!c) return res.status(404).json({ erro: 'Cliente não encontrado' });
  try {
    db.prepare(`UPDATE clientes SET nome=?,telefone=?,email=?,endereco=?,observacoes=? WHERE id=?`
    ).run(nome ?? c.nome, telefone ?? c.telefone, email !== undefined ? email : c.email,
          endereco !== undefined ? endereco : c.endereco,
          observacoes !== undefined ? observacoes : c.observacoes, id);
    res.json(db.prepare('SELECT * FROM clientes WHERE id = ?').get(id));
  } catch (err) {
    if (err.message.includes('UNIQUE')) return res.status(409).json({ erro: 'Já existe um cliente com esse telefone' });
    res.status(500).json({ erro: err.message });
  }
});

app.delete('/api/clientes/:id', requireAuth, requireAdmin, (req, res) => {
  db.prepare('DELETE FROM clientes WHERE id = ?').run(parseInt(req.params.id, 10));
  res.json({ ok: true });
});

// ── API: Configurações (horários + tempo entrega) ──────────
app.get('/api/configuracoes/horarios', requireAuth, requireAdmin, (_req, res) => {
  res.json(db.prepare('SELECT * FROM horarios ORDER BY dia').all());
});

app.post('/api/configuracoes/horarios', requireAuth, requireAdmin, (req, res) => {
  const { horarios } = req.body;
  if (!Array.isArray(horarios)) return res.status(400).json({ erro: 'horarios deve ser array' });
  db.transaction(() => {
    horarios.forEach(h =>
      db.prepare('UPDATE horarios SET aberto=?, hora_abertura=?, hora_fechamento=? WHERE dia=?')
        .run(h.aberto ? 1 : 0, h.hora_abertura, h.hora_fechamento, h.dia)
    );
  })();
  res.json({ ok: true });
});

app.get('/api/configuracoes/geral', requireAuth, requireAdmin, (_req, res) => {
  const tempo = db.prepare("SELECT valor FROM config WHERE chave='tempo_entrega'").get();
  res.json({ tempo_entrega: tempo?.valor || '45' });
});

app.post('/api/configuracoes/geral', requireAuth, requireAdmin, (req, res) => {
  const { tempo_entrega } = req.body;
  if (tempo_entrega !== undefined)
    db.prepare("UPDATE config SET valor=? WHERE chave='tempo_entrega'").run(String(parseInt(tempo_entrega, 10) || 45));
  res.json({ ok: true });
});

// ── API: Bairros de entrega ────────────────────────────────
app.get('/api/configuracoes/bairros', requireAuth, requireAdmin, (_req, res) => {
  res.json(db.prepare('SELECT * FROM bairros_entrega ORDER BY nome').all());
});

app.post('/api/configuracoes/bairros', requireAuth, requireAdmin, (req, res) => {
  const { nome, taxa } = req.body;
  if (!nome?.trim()) return res.status(400).json({ erro: 'Nome é obrigatório' });
  const r = db.prepare('INSERT INTO bairros_entrega (nome, taxa) VALUES (?, ?)').run(nome.trim(), parseFloat(taxa) || 0);
  res.status(201).json({ id: r.lastInsertRowid, nome: nome.trim(), taxa: parseFloat(taxa)||0, ativo: 1 });
});

app.patch('/api/configuracoes/bairros/:id', requireAuth, requireAdmin, (req, res) => {
  const id = parseInt(req.params.id, 10);
  const { nome, taxa, ativo } = req.body;
  if (nome !== undefined) db.prepare('UPDATE bairros_entrega SET nome=? WHERE id=?').run(nome.trim(), id);
  if (taxa !== undefined) db.prepare('UPDATE bairros_entrega SET taxa=? WHERE id=?').run(parseFloat(taxa)||0, id);
  if (ativo !== undefined) db.prepare('UPDATE bairros_entrega SET ativo=? WHERE id=?').run(ativo ? 1 : 0, id);
  res.json(db.prepare('SELECT * FROM bairros_entrega WHERE id=?').get(id));
});

app.delete('/api/configuracoes/bairros/:id', requireAuth, requireAdmin, (req, res) => {
  db.prepare('DELETE FROM bairros_entrega WHERE id=?').run(parseInt(req.params.id, 10));
  res.json({ ok: true });
});

// ── API: Programa de fidelidade ────────────────────────────
app.get('/api/configuracoes/fidelidade', requireAuth, requireAdmin, (_req, res) => {
  const g = k => db.prepare("SELECT valor FROM config WHERE chave=?").get(k)?.valor;
  res.json({
    ativo:           g('fidelidade_ativo') === '1',
    pedidos:         parseInt(g('fidelidade_pedidos')        || '10', 10),
    desconto_tipo:   g('fidelidade_desconto_tipo')   || 'percentual',
    desconto_valor:  parseFloat(g('fidelidade_desconto_valor') || '10'),
  });
});

app.post('/api/configuracoes/fidelidade', requireAuth, requireAdmin, (req, res) => {
  const { ativo, pedidos, desconto_tipo, desconto_valor } = req.body;
  const s = (k, v) => db.prepare("UPDATE config SET valor=? WHERE chave=?").run(String(v), k);
  if (ativo          !== undefined) s('fidelidade_ativo',          ativo ? '1' : '0');
  if (pedidos        !== undefined) s('fidelidade_pedidos',        Math.max(1, parseInt(pedidos, 10) || 10));
  if (desconto_tipo  !== undefined) s('fidelidade_desconto_tipo',  desconto_tipo);
  if (desconto_valor !== undefined) s('fidelidade_desconto_valor', Math.max(0, parseFloat(desconto_valor) || 10));
  res.json({ ok: true });
});

// ── API: Impressão térmica ─────────────────────────────────
app.get('/api/pedidos/:numero/imprimir', requireAuth, (req, res) => {
  const { numero } = req.params;
  const p = db.prepare('SELECT * FROM pedidos WHERE numero = ?').get(numero)
         || db.prepare('SELECT * FROM pedidos_historico WHERE numero = ?').get(numero);
  if (!p) return res.status(404).send('<p>Pedido não encontrado.</p>');
  let itens, acomp;
  try { itens = JSON.parse(p.itens); } catch { itens = []; }
  try { acomp = p.acompanhamento ? JSON.parse(p.acompanhamento) : null; } catch { acomp = null; }
  const linhas = itens.map(it => {
    const sab  = (it.sabores||[]).map(s => s.nome||s).join('/');
    const brd  = it.borda ? ` + Borda ${it.borda.nome}` : '';
    const prco = ((it.tamanho?.preco||0) + (it.borda?.preco||0)).toFixed(2);
    return `<tr><td>${it.tamanho?.nome||''} ${sab}${brd}</td><td>R$${prco}</td></tr>`;
  }).join('');
  const acompRow = acomp ? `<tr><td>${acomp.nome}</td><td>R$${(acomp.preco||0).toFixed(2)}</td></tr>` : '';
  const dataPedido = p.criado_em ? new Date(p.criado_em.includes('T') ? p.criado_em : p.criado_em + '-03:00').toLocaleString('pt-BR') : '';
  const html = `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8"><title>Pedido ${p.numero}</title>
<style>@page{size:80mm auto;margin:3mm}*{box-sizing:border-box}body{font-family:monospace;font-size:12px;width:72mm;margin:0}
h2{font-size:14px;text-align:center;margin:0 0 2px}.c{text-align:center}hr{border:none;border-top:1px dashed #000;margin:5px 0}
table{width:100%;border-collapse:collapse}td{padding:2px 0;vertical-align:top}td:last-child{text-align:right;white-space:nowrap}
.tot{font-weight:bold;font-size:13px}p{margin:2px 0}</style>
</head><body onload="window.print()">
<h2>🍕 Pede Pizza Piracicaba</h2>
<p class="c">Pedido <b>#${p.numero}</b></p><p class="c">${dataPedido}</p>
<hr><p><b>Cliente:</b> ${p.nome||'—'}</p><p><b>Tel:</b> ${p.telefone||'—'}</p><p><b>Endereço:</b> ${p.endereco||'—'}</p>
<hr><table>${linhas}${acompRow}<tr><td colspan="2"><hr></td></tr>
<tr class="tot"><td>TOTAL</td><td>R$${(p.total||0).toFixed(2)}</td></tr></table>
<hr><p><b>Pagamento:</b> ${p.pagamento === 'pix' ? 'PIX' : 'Na Entrega'}</p>
</body></html>`;
  res.send(html);
});

// ── Socket.io ──────────────────────────────────────────────
io.on('connection', socket => {
  console.log('[WS] Conectado:', socket.id);
  socket.on('disconnect', () => console.log('[WS] Desconectado:', socket.id));
  socket.on('join_pedido', numero => {
    socket.join(`pedido:${numero}`);
  });
});

// ── Helpers ────────────────────────────────────────────────
function parsePedido(p) {
  if (!p) return null;
  try {
    const entregador = p.entregador_id
      ? (db.prepare('SELECT id, nome, telefone FROM entregadores WHERE id = ?').get(p.entregador_id) || null)
      : null;
    return { ...p, itens: JSON.parse(p.itens), acompanhamento: p.acompanhamento ? JSON.parse(p.acompanhamento) : null, pagamento: p.pagamento || 'entrega', entregador };
  } catch { return { ...p, itens: [], acompanhamento: null, pagamento: p.pagamento || 'entrega', entregador: null }; }
}

function parsePedidoHistorico(p) {
  return { ...parsePedido(p), concluido_em: p?.concluido_em || null };
}

function parsePedidoCancelado(p) {
  return { ...parsePedido(p), status: 'cancelado', cancelado_em: p?.cancelado_em || null };
}

// ── Inicializar ────────────────────────────────────────────
server.listen(PORT, () => {
  const hasUsers = db.prepare('SELECT COUNT(*) as n FROM usuarios').get().n > 0;
  console.log(`🍕 Dashboard em http://localhost:${PORT}`);
  console.log(`🔑 Link de acesso: http://localhost:${PORT}/${TENANT_SLUG}`);
  if (!hasUsers) console.log(`⚠️  Nenhum usuário cadastrado. Acesse o link acima para configurar.`);
});
