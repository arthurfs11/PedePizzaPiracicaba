require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const path = require('path');
const Database = require('better-sqlite3');

const PORT = process.env.PORT || 8000;
const DB_PATH = process.env.DB_PATH || path.join(__dirname, '../pedidos.db');

// ── Banco de dados ──
const db = new Database(DB_PATH);

db.exec(`
  CREATE TABLE IF NOT EXISTS pedidos (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    numero        TEXT    UNIQUE NOT NULL,
    nome          TEXT    NOT NULL,
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

  CREATE TABLE IF NOT EXISTS contador (
    chave TEXT PRIMARY KEY,
    valor INTEGER DEFAULT 0
  );

  INSERT OR IGNORE INTO contador (chave, valor) VALUES ('pedido', 0);
`);

// Migração: adiciona colunas novas em bancos existentes (ignora erro se já existirem)
try { db.exec(`ALTER TABLE pedidos ADD COLUMN acompanhamento TEXT`); } catch (_) {}
try { db.exec(`ALTER TABLE pedidos ADD COLUMN pagamento TEXT DEFAULT 'entrega'`); } catch (_) {}

function gerarNumeroPedido() {
  const stmt = db.prepare("UPDATE contador SET valor = valor + 1 WHERE chave = 'pedido'");
  stmt.run();
  const row = db.prepare("SELECT valor FROM contador WHERE chave = 'pedido'").get();
  const hoje = new Date();
  const dd = String(hoje.getDate()).padStart(2, '0');
  const mm = String(hoje.getMonth() + 1).padStart(2, '0');
  const seq = String(row.valor).padStart(3, '0');
  return `PZZ-${dd}${mm}-${seq}`;
}

// ── Express + Socket.io ──
const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*' } });

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// ── API: Receber pedido (chamado pelo n8n) ──
app.post('/api/pedidos', (req, res) => {
  try {
    const { nome, endereco, pizzas, acompanhamento, pagamento, total, telegram_chat_id } = req.body;

    if (!nome || !endereco || !pizzas || !Array.isArray(pizzas) || pizzas.length === 0) {
      return res.status(400).json({ erro: 'Dados do pedido incompletos' });
    }

    const numero = gerarNumeroPedido();
    const itensJson = JSON.stringify(pizzas);
    const acompJson = acompanhamento ? JSON.stringify(acompanhamento) : null;

    db.prepare(`
      INSERT INTO pedidos (numero, nome, endereco, itens, acompanhamento, pagamento, total, status, chat_id)
      VALUES (?, ?, ?, ?, ?, ?, ?, 'recebido', ?)
    `).run(numero, nome, endereco, itensJson, acompJson, pagamento || 'entrega', total, telegram_chat_id || null);

    const pedido = db.prepare('SELECT * FROM pedidos WHERE numero = ?').get(numero);
    const pedidoFormatado = parsePedido(pedido);

    io.emit('novo_pedido', pedidoFormatado);
    console.log(`[PEDIDO] Novo pedido recebido: ${numero} — ${nome}`);

    return res.status(201).json({ numero, status: 'recebido', pedido: pedidoFormatado });
  } catch (err) {
    console.error('[API] Erro ao salvar pedido:', err.message);
    return res.status(500).json({ erro: 'Erro interno ao salvar pedido' });
  }
});

// ── API: Listar todos os pedidos ──
app.get('/api/pedidos', (req, res) => {
  const pedidos = db.prepare('SELECT * FROM pedidos ORDER BY id DESC').all();
  res.json(pedidos.map(parsePedido));
});

// ── API: Atualizar status ──
app.patch('/api/pedidos/:numero/status', (req, res) => {
  try {
    const { numero } = req.params;
    const { status } = req.body;
    const statusValidos = ['recebido', 'em_andamento', 'em_entrega', 'concluido'];

    if (!statusValidos.includes(status)) {
      return res.status(400).json({ erro: 'Status inválido' });
    }

    const pedido = db.prepare('SELECT * FROM pedidos WHERE numero = ?').get(numero);
    if (!pedido) return res.status(404).json({ erro: 'Pedido não encontrado' });

    db.prepare("UPDATE pedidos SET status = ?, atualizado_em = datetime('now','localtime') WHERE numero = ?")
      .run(status, numero);

    const atualizado = parsePedido(db.prepare('SELECT * FROM pedidos WHERE numero = ?').get(numero));
    io.emit('pedido_atualizado', atualizado);

    return res.json(atualizado);
  } catch (err) {
    console.error('[PATCH /status] Erro:', err.message, err.stack);
    return res.status(500).json({ erro: err.message });
  }
});

// ── API: Estatísticas ──
app.get('/api/stats', (req, res) => {
  const recebido     = db.prepare("SELECT COUNT(*) as n FROM pedidos WHERE status = 'recebido'").get().n;
  const em_andamento = db.prepare("SELECT COUNT(*) as n FROM pedidos WHERE status = 'em_andamento'").get().n;
  const em_entrega   = db.prepare("SELECT COUNT(*) as n FROM pedidos WHERE status = 'em_entrega'").get().n;
  const concluido    = db.prepare("SELECT COUNT(*) as n FROM pedidos WHERE status = 'concluido'").get().n;
  const total_hoje   = db.prepare("SELECT COALESCE(SUM(total),0) as n FROM pedidos WHERE date(criado_em) = date('now','localtime')").get().n;
  res.json({ recebido, em_andamento, em_entrega, concluido, total_hoje });
});

// ── Socket.io ──
io.on('connection', (socket) => {
  console.log('[WS] Cliente conectado:', socket.id);
  socket.on('disconnect', () => console.log('[WS] Cliente desconectado:', socket.id));
});

// ── Helpers ──
function parsePedido(p) {
  try {
    return {
      ...p,
      itens:          JSON.parse(p.itens),
      acompanhamento: p.acompanhamento ? JSON.parse(p.acompanhamento) : null,
      pagamento:      p.pagamento || 'entrega',
    };
  } catch (err) {
    console.error('[parsePedido] Erro ao parsear pedido', p?.numero, err.message);
    return { ...p, itens: [], acompanhamento: null, pagamento: p.pagamento || 'entrega' };
  }
}

// ── Inicializar ──
server.listen(PORT, () => {
  console.log(`🍕 Dashboard rodando em http://localhost:${PORT}`);
  console.log(`📦 Banco de dados: ${DB_PATH}`);
});
