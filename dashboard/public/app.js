/* ============================================================
   HELPERS — definidos primeiro para estarem disponíveis logo
   ============================================================ */

function escHtml(str) {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function formatarHora(dataStr) {
  try {
    const d = new Date(String(dataStr).replace(' ', 'T'));
    const h = String(d.getHours()).padStart(2, '0');
    const m = String(d.getMinutes()).padStart(2, '0');
    return `${h}:${m}`;
  } catch (_) { return String(dataStr || ''); }
}

function setWsStatus(type, msg) {
  const el = document.getElementById('ws-status');
  if (el) { el.textContent = msg; el.className = `ws-${type}`; }
}

function toast(msg) {
  let container = document.querySelector('.toast-container');
  if (!container) {
    container = document.createElement('div');
    container.className = 'toast-container';
    document.body.appendChild(container);
  }
  const el = document.createElement('div');
  el.className = 'toast';
  el.textContent = msg;
  container.appendChild(el);
  setTimeout(() => el.remove(), 4000);
}

function tocarSom() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.frequency.setValueAtTime(880, ctx.currentTime);
    osc.frequency.setValueAtTime(1100, ctx.currentTime + 0.1);
    gain.gain.setValueAtTime(0.3, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.4);
    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + 0.4);
  } catch (_) { /* sem suporte */ }
}

/* ============================================================
   RENDERIZAÇÃO
   ============================================================ */

function renderizarItem(item) {
  try {
    const tipo    = item.tipo === 'salgada' ? '🧀' : '🍓';
    const sabores = Array.isArray(item.sabores)
      ? item.sabores.map((s) => s.nome || s).join(' / ')
      : String(item.sabores || '');
    const tamanhoNome  = item.tamanho?.nome  || item.tamanho  || '';
    const tamanhoPreco = Number(item.tamanho?.preco || 0);
    const precoStr     = tamanhoPreco.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
    const acomp        = item.acompanhamento?.preco > 0
      ? `<div class="item-acomp">🥤 ${escHtml(item.acompanhamento.nome)}</div>` : '';

    return `
      <div class="card-item">
        <div class="item-header">
          <span>${tipo} Pizza ${escHtml(tamanhoNome)}</span>
          <span>${precoStr}</span>
        </div>
        <div class="item-desc">${escHtml(sabores)}</div>
        ${acomp}
      </div>`;
  } catch (err) {
    console.error('[renderizarItem] erro:', err, item);
    return `<div class="card-item"><div class="item-desc">Item indisponível</div></div>`;
  }
}

function renderizarBotoes(status, numero) {
  const n = escHtml(numero);
  if (status === 'recebido') {
    return `
      <button class="btn btn-iniciar"  onclick="mudarStatus('${n}','em_andamento')">🔥 Iniciar preparo</button>
      <button class="btn btn-concluir" onclick="mudarStatus('${n}','concluido')" title="Concluir direto">✅</button>`;
  }
  if (status === 'em_andamento') {
    return `
      <button class="btn btn-voltar"   onclick="mudarStatus('${n}','recebido')">↩ Voltar</button>
      <button class="btn btn-entregar" onclick="mudarStatus('${n}','em_entrega')">🛵 Saiu para entrega</button>`;
  }
  if (status === 'em_entrega') {
    return `
      <button class="btn btn-voltar"   onclick="mudarStatus('${n}','em_andamento')">↩ Voltar</button>
      <button class="btn btn-concluir" onclick="mudarStatus('${n}','concluido')">✅ Entrega concluída</button>`;
  }
  if (status === 'concluido') {
    return `<button class="btn btn-voltar" onclick="mudarStatus('${n}','em_entrega')">↩ Reabrir</button>`;
  }
  return '';
}

function adicionarCard(pedido, isNovo) {
  try {
    const colId = ({
      recebido:     'col-recebido',
      em_andamento: 'col-andamento',
      em_entrega:   'col-entrega',
      concluido:    'col-concluido',
    })[pedido.status] || 'col-recebido';

    const col = document.getElementById(colId);
    if (!col) { console.error('[adicionarCard] coluna não encontrada:', colId); return; }

    // Oculta empty-state
    const empty = col.querySelector('.empty-state');
    if (empty) empty.style.display = 'none';

    // Garante que itens é um array
    const itens = Array.isArray(pedido.itens) ? pedido.itens : [];
    const itensHtml  = itens.map(renderizarItem).join('');
    const total      = Number(pedido.total || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
    const hora       = formatarHora(pedido.criado_em);
    const botoesHtml = renderizarBotoes(pedido.status, pedido.numero);
    const novoBadge  = isNovo ? '<span class="badge-new">Novo</span>' : '';

    const card = document.createElement('div');
    card.className = 'card';
    card.dataset.numero = pedido.numero;
    card.dataset.status = pedido.status;

    const pagamentoBadge = pedido.pagamento === 'pix'
      ? '<span class="badge-pagamento badge-pix">🏦 Pix</span>'
      : '<span class="badge-pagamento badge-entrega">💵 Entrega</span>';

    const acompHtml = (pedido.acompanhamento?.preco > 0)
      ? `<div class="card-item card-item-acomp">
           <div class="item-header">
             <span>🥤 ${escHtml(pedido.acompanhamento.nome)}</span>
             <span>${Number(pedido.acompanhamento.preco).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</span>
           </div>
         </div>` : '';

    card.innerHTML = `
      <div class="card-header">
        <span class="card-numero">${escHtml(pedido.numero)} ${novoBadge}</span>
        <div class="card-header-right">${pagamentoBadge} <span class="card-time">🕐 ${hora}</span></div>
      </div>
      <div class="card-body">
        <div class="card-cliente">
          <span class="card-nome">👤 ${escHtml(pedido.nome)}</span>
          <span class="card-endereco">📍 ${escHtml(pedido.endereco)}</span>
        </div>
        <div class="card-itens">${itensHtml}${acompHtml}</div>
        <div class="card-total">
          <span class="card-total-label">Total do pedido</span>
          <span class="card-total-value">${total}</span>
        </div>
      </div>
      <div class="card-actions">${botoesHtml}</div>`;

    col.insertBefore(card, col.firstChild);
  } catch (err) {
    console.error('[adicionarCard] erro ao renderizar pedido:', err, pedido);
  }
  atualizarEmpties();
  atualizarBadges();
}

/* ============================================================
   DADOS
   ============================================================ */

async function carregarPedidos() {
  console.log('[Dashboard] Carregando pedidos do servidor...');
  try {
    const r = await fetch('/api/pedidos');
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const pedidos = await r.json();
    console.log(`[Dashboard] ${pedidos.length} pedido(s) encontrado(s).`);
    pedidos.forEach((p) => adicionarCard(p, false));
    await atualizarStats();
    atualizarEmpties();
  } catch (e) {
    console.error('[Dashboard] Erro ao carregar pedidos:', e);
  }
}

async function recarregarTodos() {
  ['col-recebido', 'col-andamento', 'col-entrega', 'col-concluido'].forEach((id) => {
    document.getElementById(id)?.querySelectorAll('.card').forEach((c) => c.remove());
  });
  await carregarPedidos();
}

async function mudarStatus(numero, novoStatus) {
  console.log(`[Dashboard] Mudando status ${numero} → ${novoStatus}`);
  try {
    const r = await fetch(`/api/pedidos/${encodeURIComponent(numero)}/status`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: novoStatus }),
    });
    if (!r.ok) {
      const err = await r.json().catch(() => ({}));
      console.error('[mudarStatus] Erro da API:', err);
      toast(`❌ Erro: ${err.erro || r.status}`);
    }
  } catch (e) {
    console.error('[mudarStatus] Erro de rede:', e);
    toast('❌ Erro ao atualizar status');
  }
}

async function atualizarStats() {
  try {
    const r = await fetch('/api/stats');
    const s = await r.json();
    document.getElementById('stat-recebido').textContent  = s.recebido;
    document.getElementById('stat-andamento').textContent = s.em_andamento;
    document.getElementById('stat-entrega').textContent   = s.em_entrega;
    document.getElementById('stat-concluido').textContent = s.concluido;
    document.getElementById('stat-total').textContent     =
      Number(s.total_hoje).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  } catch (_) { /* silencioso */ }
}

/* ============================================================
   UI HELPERS
   ============================================================ */

function atualizarBadges() {
  [['col-recebido','badge-recebido'],['col-andamento','badge-andamento'],['col-entrega','badge-entrega'],['col-concluido','badge-concluido']]
    .forEach(([colId, badgeId]) => {
      const n = document.querySelectorAll(`#${colId} .card`).length;
      const el = document.getElementById(badgeId);
      if (el) el.textContent = n;
    });
}

function atualizarEmpties() {
  [['col-recebido','empty-recebido'],['col-andamento','empty-andamento'],['col-entrega','empty-entrega'],['col-concluido','empty-concluido']]
    .forEach(([colId, emptyId]) => {
      const n  = document.querySelectorAll(`#${colId} .card`).length;
      const el = document.getElementById(emptyId);
      if (el) el.style.display = n === 0 ? 'flex' : 'none';
    });
  atualizarBadges();
}

/* ── Relógio ── */
function atualizarRelogio() {
  const agora = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  const el = document.getElementById('clock');
  if (el) el.textContent = `${pad(agora.getHours())}:${pad(agora.getMinutes())}:${pad(agora.getSeconds())}`;
}
setInterval(atualizarRelogio, 1000);
atualizarRelogio();

/* ============================================================
   SOCKET.IO — inicializado depois de todas as funções
   ============================================================ */

const socket = io({ transports: ['websocket', 'polling'] });

socket.on('connect', () => {
  console.log('[WS] Conectado. ID:', socket.id);
  setWsStatus('ok', '● Conectado em tempo real');
});

socket.on('disconnect', () => {
  console.warn('[WS] Desconectado.');
  setWsStatus('error', '● Desconectado — tentando reconectar...');
});

socket.on('connect_error', (err) => {
  console.error('[WS] Erro de conexão:', err.message);
  setWsStatus('error', '● Erro de conexão');
});

socket.on('novo_pedido', (pedido) => {
  console.log('[WS] 🔔 Novo pedido recebido:', pedido.numero, pedido);
  adicionarCard(pedido, true);
  atualizarStats();
  toast(`🔔 Novo pedido! ${pedido.numero} — ${pedido.nome}`);
  tocarSom();
});

socket.on('pedido_atualizado', (pedido) => {
  console.log('[WS] 🔄 Pedido atualizado:', pedido.numero, '→', pedido.status);
  const el = document.querySelector(`[data-numero="${pedido.numero}"]`);
  if (el) el.remove();
  adicionarCard(pedido, false);
  atualizarStats();
  atualizarEmpties();
});

/* ============================================================
   INICIALIZAÇÃO
   ============================================================ */

carregarPedidos();
