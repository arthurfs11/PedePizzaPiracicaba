/* ============================================================
   HELPERS — definidos primeiro
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
    const d = parseDateLocal(dataStr);
    return `${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;
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
  } catch (_) {}
}

async function fazerLogout() {
  await fetch('/api/auth/logout', { method: 'POST' }).catch(() => {});
  window.location.href = '/login';
}

/* ============================================================
   TIMER
   ============================================================ */

function parseDateLocal(str) {
  // Interpreta o timestamp do SQLite (gravado em horário local pelo container TZ=Sao_Paulo)
  // sem adicionar 'Z' para não tratar como UTC
  return new Date(String(str || '').replace(' ', 'T'));
}

function formatarTimer(criadoEm) {
  try {
    const diffMs   = Math.max(0, Date.now() - parseDateLocal(criadoEm).getTime());
    const totalSeg = Math.floor(diffMs / 1000);
    const hh = String(Math.floor(totalSeg / 3600)).padStart(2, '0');
    const mm = String(Math.floor((totalSeg % 3600) / 60)).padStart(2, '0');
    const ss = String(totalSeg % 60).padStart(2, '0');
    return `${hh}:${mm}:${ss}`;
  } catch (_) { return '00:00:00'; }
}

function classeTimer(criadoEm) {
  try {
    const min = Math.floor(Math.max(0, Date.now() - parseDateLocal(criadoEm).getTime()) / 60000);
    if (min <= 10) return 'timer-verde';
    if (min <= 20) return 'timer-amarelo';
    if (min <  30) return 'timer-vermelho';
    return 'timer-piscando';
  } catch (_) { return 'timer-verde'; }
}

function atualizarTimers() {
  document.querySelectorAll('[data-timer]').forEach(el => {
    const criado = el.dataset.timer;
    el.textContent = `⏱ ${formatarTimer(criado)}`;
    el.className   = `card-timer ${classeTimer(criado)}`;
  });
}

setInterval(atualizarTimers, 1000);

/* ============================================================
   ORDENAÇÃO — mais antigo no topo
   ============================================================ */

function reordenarColuna(colId) {
  const col = document.getElementById(colId);
  if (!col) return;
  const cards = [...col.querySelectorAll('.card')];
  cards.sort((a, b) => {
    const ta = new Date(String(a.dataset.criado || '').replace(' ', 'T'));
    const tb = new Date(String(b.dataset.criado || '').replace(' ', 'T'));
    return ta - tb;
  });
  cards.forEach(c => col.appendChild(c));
}

/* ============================================================
   RENDERIZAÇÃO
   ============================================================ */

function renderizarItem(item) {
  try {
    const tipo    = item.tipo === 'salgada' ? '🧀' : '🍓';
    const sabores = Array.isArray(item.sabores)
      ? item.sabores.map(s => s.nome || s).join(' / ')
      : String(item.sabores || '');
    const tamanhoNome  = item.tamanho?.nome  || item.tamanho  || '';
    const precoTotal   = Number(item.tamanho?.preco || 0) + Number(item.borda?.preco || 0);
    const precoStr     = precoTotal.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
    const bordaHtml    = item.borda
      ? `<div class="item-acomp">🟡 Borda ${escHtml(item.borda.nome)} (+${Number(item.borda.preco).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })})</div>`
      : '';
    return `
      <div class="card-item">
        <div class="item-header">
          <span>${tipo} Pizza ${escHtml(tamanhoNome)}</span>
          <span>${precoStr}</span>
        </div>
        <div class="item-desc">${escHtml(sabores)}</div>
        ${bordaHtml}
      </div>`;
  } catch (err) {
    return `<div class="card-item"><div class="item-desc">Item indisponível</div></div>`;
  }
}

function renderizarBotoes(status, numero) {
  const n = escHtml(numero);
  if (status === 'pendente_pagamento') {
    return `
      <button class="btn btn-confirmar-pix" onclick="mudarStatus('${n}','recebido')">💰 Confirmar pagamento Pix</button>`;
  }
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
  return ''; // concluido: sem ações
}

function adicionarCard(pedido, isNovo) {
  try {
    const colId = ({
      pendente_pagamento: 'col-pendente',
      recebido:           'col-recebido',
      em_andamento:       'col-andamento',
      em_entrega:         'col-entrega',
      concluido:          'col-concluido',
    })[pedido.status] || 'col-recebido';

    const col = document.getElementById(colId);
    if (!col) { console.error('[adicionarCard] coluna não encontrada:', colId); return; }

    const empty = col.querySelector('.empty-state');
    if (empty) empty.style.display = 'none';

    const itens     = Array.isArray(pedido.itens) ? pedido.itens : [];
    const itensHtml = itens.map(renderizarItem).join('');
    const total     = Number(pedido.total || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
    const hora      = formatarHora(pedido.criado_em);
    const novoBadge = isNovo ? '<span class="badge-new">Novo</span>' : '';

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

    const telefoneHtml = pedido.telefone
      ? `<span class="card-telefone">📞 ${escHtml(pedido.telefone)}</span>`
      : '';

    // Timer: ativo para pedidos em fluxo, estático para concluído
    const timerHtml = pedido.status === 'concluido'
      ? `<span class="card-timer timer-concluido">✅ Concluído às ${formatarHora(pedido.concluido_em || pedido.atualizado_em)}</span>`
      : `<span class="card-timer ${classeTimer(pedido.criado_em)}" data-timer="${escHtml(pedido.criado_em || '')}">⏱ ${formatarTimer(pedido.criado_em)}</span>`;

    const botoesHtml = renderizarBotoes(pedido.status, pedido.numero);

    const card = document.createElement('div');
    card.className      = 'card';
    card.dataset.numero = pedido.numero;
    card.dataset.status = pedido.status;
    card.dataset.criado = pedido.criado_em || '';

    card.innerHTML = `
      <div class="card-header">
        <span class="card-numero">${escHtml(pedido.numero)} ${novoBadge}</span>
        <div class="card-header-right">${pagamentoBadge} <span class="card-time">🕐 ${hora}</span></div>
      </div>
      <div class="card-timer-wrap">${timerHtml}</div>
      <div class="card-body">
        <div class="card-cliente">
          <span class="card-nome">👤 ${escHtml(pedido.nome)}</span>
          ${telefoneHtml}
          <span class="card-endereco">📍 ${escHtml(pedido.endereco)}</span>
        </div>
        <div class="card-itens">${itensHtml}${acompHtml}</div>
        <div class="card-total">
          <span class="card-total-label">Total do pedido</span>
          <span class="card-total-value">${total}</span>
        </div>
      </div>
      ${botoesHtml ? `<div class="card-actions">${botoesHtml}</div>` : ''}`;

    col.appendChild(card);
    reordenarColuna(colId);
  } catch (err) {
    console.error('[adicionarCard] erro:', err, pedido);
  }
  atualizarEmpties();
  atualizarBadges();
}

/* ============================================================
   DADOS
   ============================================================ */

async function carregarPedidos() {
  console.log('[Dashboard] Carregando pedidos...');
  try {
    const [r1, r2] = await Promise.all([
      fetch('/api/pedidos'),
      fetch('/api/pedidos/concluidos-hoje'),
    ]);
    if (r1.status === 401 || r2.status === 401) { window.location.href = '/login'; return; }
    if (!r1.ok || !r2.ok) throw new Error('Falha na API');

    const [ativos, concluidos] = await Promise.all([r1.json(), r2.json()]);
    console.log(`[Dashboard] ${ativos.length} ativo(s), ${concluidos.length} concluído(s) hoje.`);
    [...ativos, ...concluidos].forEach(p => adicionarCard(p, false));
    await atualizarStats();
    atualizarEmpties();
  } catch (e) {
    console.error('[Dashboard] Erro ao carregar pedidos:', e);
  }
}

async function recarregarTodos() {
  ['col-pendente', 'col-recebido', 'col-andamento', 'col-entrega', 'col-concluido'].forEach(id => {
    document.getElementById(id)?.querySelectorAll('.card').forEach(c => c.remove());
  });
  atualizarEmpties();
  await carregarPedidos();
}

async function mudarStatus(numero, novoStatus) {
  console.log(`[Dashboard] ${numero} → ${novoStatus}`);
  try {
    const r = await fetch(`/api/pedidos/${encodeURIComponent(numero)}/status`, {
      method:  'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ status: novoStatus }),
    });
    if (r.status === 401) { window.location.href = '/login'; return; }
    if (!r.ok) {
      const err = await r.json().catch(() => ({}));
      toast(`❌ Erro: ${err.erro || r.status}`);
    }
  } catch (e) {
    toast('❌ Erro ao atualizar status');
  }
}

async function atualizarStats() {
  try {
    const r = await fetch('/api/stats');
    if (r.status === 401) { window.location.href = '/login'; return; }
    const s = await r.json();
    const setPill = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val; };
    setPill('stat-pendente',   s.pendente);
    setPill('stat-recebido',   s.recebido);
    setPill('stat-andamento',  s.em_andamento);
    setPill('stat-entrega',    s.em_entrega);
    setPill('stat-concluido',  s.concluido);
    setPill('stat-total', Number(s.total_hoje).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }));
  } catch (_) {}
}

/* ============================================================
   UI HELPERS
   ============================================================ */

function atualizarBadges() {
  [
    ['col-pendente',  'badge-pendente'],
    ['col-recebido',  'badge-recebido'],
    ['col-andamento', 'badge-andamento'],
    ['col-entrega',   'badge-entrega'],
    ['col-concluido', 'badge-concluido'],
  ].forEach(([colId, badgeId]) => {
    const n  = document.querySelectorAll(`#${colId} .card`).length;
    const el = document.getElementById(badgeId);
    if (el) el.textContent = n;
  });
}

function atualizarEmpties() {
  [
    ['col-pendente',  'empty-pendente'],
    ['col-recebido',  'empty-recebido'],
    ['col-andamento', 'empty-andamento'],
    ['col-entrega',   'empty-entrega'],
    ['col-concluido', 'empty-concluido'],
  ].forEach(([colId, emptyId]) => {
    const n  = document.querySelectorAll(`#${colId} .card`).length;
    const el = document.getElementById(emptyId);
    if (el) el.style.display = n === 0 ? 'flex' : 'none';
  });
  atualizarBadges();
}

/* ── Relógio ── */
function atualizarRelogio() {
  const agora = new Date();
  const pad   = n => String(n).padStart(2, '0');
  const el    = document.getElementById('clock');
  if (el) el.textContent = `${pad(agora.getHours())}:${pad(agora.getMinutes())}:${pad(agora.getSeconds())}`;
}
setInterval(atualizarRelogio, 1000);
atualizarRelogio();

setInterval(atualizarStats, 30000);

/* ============================================================
   SOCKET.IO — inicializado depois de todas as funções
   ============================================================ */

const socket = io({ transports: ['websocket', 'polling'] });

socket.on('connect', () => {
  console.log('[WS] Conectado. ID:', socket.id);
  setWsStatus('ok', '● Conectado em tempo real');
});

socket.on('disconnect', () => {
  setWsStatus('error', '● Desconectado — tentando reconectar...');
});

socket.on('connect_error', (err) => {
  setWsStatus('error', '● Erro de conexão');
});

socket.on('novo_pedido', (pedido) => {
  console.log('[WS] 🔔 Novo pedido:', pedido.numero);
  adicionarCard(pedido, true);
  // Incrementa contador imediato (confirma via API em seguida)
  const statId = pedido.pagamento === 'pix' ? 'stat-pendente' : 'stat-recebido';
  const elStat = document.getElementById(statId);
  if (elStat) elStat.textContent = parseInt(elStat.textContent || '0') + 1;
  atualizarStats();
  const msg = pedido.pagamento === 'pix'
    ? `💰 Pix aguardando! ${pedido.numero} — ${pedido.nome}`
    : `🔔 Novo pedido! ${pedido.numero} — ${pedido.nome}`;
  toast(msg);
  tocarSom();
});

socket.on('pedido_atualizado', (pedido) => {
  console.log('[WS] 🔄 Atualizado:', pedido.numero, '→', pedido.status);
  const el = document.querySelector(`[data-numero="${pedido.numero}"]`);
  if (el) el.remove();
  adicionarCard(pedido, false);
  atualizarStats();
  atualizarEmpties();
});

/* ============================================================
   INICIALIZAÇÃO
   ============================================================ */

// Revelar link de admin se o usuário logado for administrador
(async () => {
  try {
    const r = await fetch('/api/auth/me');
    if (r.status === 401) { window.location.href = '/login'; return; }
    const me = await r.json();
    if (me?.papel === 'admin') {
      const el = document.getElementById('nav-admin');
      if (el) el.style.display = '';
    }
  } catch (_) {}
})();

carregarPedidos();
