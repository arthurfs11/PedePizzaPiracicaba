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
  // O banco armazena horário de Brasília como texto (sem offset).
  // Extraímos HH:MM direto da string para evitar conversão de fuso do browser.
  try {
    const m = String(dataStr || '').match(/(\d{2}):(\d{2})/);
    return m ? `${m[1]}:${m[2]}` : '--:--';
  } catch (_) { return '--:--'; }
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
  // SQLite armazena horário de Brasília (UTC-3). Forçamos o offset explicitamente
  // para o timer funcionar independente do fuso do browser ou do container.
  if (!str) return new Date('');
  return new Date(String(str).replace(' ', 'T') + '-03:00');
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
    if (min < 15) return 'timer-verde';
    if (min < 30) return 'timer-amarelo';
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
  const btnEditar   = `<button class="btn-editar-pedido" onclick="abrirEditarPedido('${n}')">✏️ Editar</button>`;
  const btnImprimir = `<button class="btn btn-imprimir" onclick="window.open('/api/pedidos/${n}/imprimir','_blank')" title="Imprimir">🖨️</button>`;
  const btnCancelar = `<button class="btn btn-cancelar" onclick="confirmarCancelar('${n}')">❌ Cancelar</button>`;
  if (status === 'pendente_pagamento') {
    return `
      ${btnEditar}${btnImprimir}
      <button class="btn btn-confirmar-pix" onclick="mudarStatus('${n}','recebido')">💰 Confirmar pagamento Pix</button>
      ${btnCancelar}`;
  }
  if (status === 'recebido') {
    return `
      ${btnEditar}${btnImprimir}
      <button class="btn btn-iniciar"  onclick="mudarStatus('${n}','em_andamento')">🔥 Iniciar preparo</button>
      <button class="btn btn-concluir" onclick="mudarStatus('${n}','concluido')" title="Concluir direto">✅</button>
      ${btnCancelar}`;
  }
  if (status === 'em_andamento') {
    return `
      ${btnEditar}${btnImprimir}
      <button class="btn btn-voltar"   onclick="mudarStatus('${n}','recebido')">↩ Voltar</button>
      <button class="btn btn-entregar" onclick="mudarStatus('${n}','em_entrega')">🛵 Saiu para entrega</button>
      ${btnCancelar}`;
  }
  if (status === 'em_entrega') {
    return `
      ${btnEditar}${btnImprimir}
      <button class="btn btn-voltar"   onclick="mudarStatus('${n}','em_andamento')">↩ Voltar</button>
      <button class="btn btn-concluir" onclick="mudarStatus('${n}','concluido')">✅ Entrega concluída</button>
      ${btnCancelar}`;
  }
  return btnImprimir; // concluido / cancelado: só impressão
}

function confirmarCancelar(numero) {
  if (!confirm(`Cancelar o pedido ${numero}?\n\nEsta ação não pode ser desfeita.`)) return;
  mudarStatus(numero, 'cancelado');
}

function adicionarCard(pedido, isNovo) {
  try {
    // Pedidos cancelados não aparecem no kanban — vão para /cancelados
    if (pedido.status === 'cancelado') return;

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

    const ant = pedido.pedidos_anteriores ?? 0;
    const ordemBadgeHtml = pedido.telefone
      ? (ant === 0
          ? `<span class="badge-ordem primeiro-pedido">⭐ Primeiro pedido na loja</span>`
          : `<span class="badge-ordem pedido-recorrente">🔁 ${ant + 1}º pedido na loja</span>`)
      : '';

    // Timer: ativo para pedidos em fluxo, estático para concluído/cancelado
    const timerHtml = pedido.status === 'concluido'
      ? `<span class="card-timer timer-concluido">✅ Concluído às ${formatarHora(pedido.concluido_em || pedido.atualizado_em)}</span>`
      : pedido.status === 'cancelado'
      ? `<span class="card-timer timer-cancelado">❌ Cancelado às ${formatarHora(pedido.cancelado_em || pedido.atualizado_em)}</span>`
      : `<span class="card-timer ${classeTimer(pedido.criado_em)}" data-timer="${escHtml(pedido.criado_em || '')}">⏱ ${formatarTimer(pedido.criado_em)}</span>`;

    const botoesHtml = renderizarBotoes(pedido.status, pedido.numero);

    // Entregador
    let entregadorHtml = '';
    if (pedido.status === 'em_entrega') {
      const opcoes = _entregadores.map(e => {
        const sel = (e.id === pedido.entregador?.id) ? ' selected' : '';
        return `<option value="${e.id}"${sel}>${escHtml(e.nome)}</option>`;
      }).join('');
      entregadorHtml = `
        <div class="card-entregador">
          <span class="entregador-label">🛵 ${escHtml(pedido.entregador?.nome || 'Sem entregador')}</span>
          <select class="entregador-select" onchange="mudarEntregador('${escHtml(pedido.numero)}',this.value)">
            <option value="">– trocar –</option>
            <option value="" ${!pedido.entregador ? 'selected' : ''}>Sem entregador</option>
            ${opcoes}
          </select>
        </div>`;
    } else if (pedido.entregador) {
      entregadorHtml = `<div class="card-entregador">🛵 ${escHtml(pedido.entregador.nome)}</div>`;
    }

    const card = document.createElement('div');
    card.className      = 'card';
    card.dataset.numero = pedido.numero;
    card.dataset.status = pedido.status;
    card.dataset.criado = pedido.criado_em || '';

    if (pedido.status === 'concluido') {
      // Card compacto: só informações essenciais
      card.innerHTML = `
        <div class="card-header">
          <span class="card-numero">${escHtml(pedido.numero)}</span>
          <div class="card-header-right">${pagamentoBadge}<span class="card-time">🕐 ${hora}</span></div>
        </div>
        <div class="card-mini-body">
          <span class="card-nome">👤 ${escHtml(pedido.nome)}</span>
          <span class="card-total-value">${total}</span>
        </div>
        <div style="padding:2px 12px 8px">
          <span class="card-timer timer-concluido">✅ Concluído às ${formatarHora(pedido.concluido_em || pedido.atualizado_em)}</span>
        </div>
        ${botoesHtml ? `<div class="card-actions">${botoesHtml}</div>` : ''}`;
    } else {
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
            ${ordemBadgeHtml}
            <span class="card-endereco">📍 ${escHtml(pedido.endereco)}</span>
          </div>
          <div class="card-itens">${itensHtml}${acompHtml}</div>
          ${entregadorHtml}
          <div class="card-total">
            <span class="card-total-label">Total do pedido</span>
            <span class="card-total-value">${total}</span>
          </div>
        </div>
        ${botoesHtml ? `<div class="card-actions">${botoesHtml}</div>` : ''}`;
    }

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

async function carregarEntregadores() {
  try {
    const r = await fetch('/api/entregadores');
    if (r.ok) _entregadores = await r.json();
  } catch (_) {}
}

async function mudarEntregador(numero, entregadorId) {
  await fetch(`/api/pedidos/${encodeURIComponent(numero)}/entregador`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ entregador_id: entregadorId ? parseInt(entregadorId, 10) : null }),
  }).catch(() => toast('❌ Erro ao atribuir entregador'));
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
  const brt = new Date(Date.now() - 3 * 60 * 60 * 1000); // força UTC-3 (Brasília)
  const pad = n => String(n).padStart(2, '0');
  const el  = document.getElementById('clock');
  if (el) el.textContent = `${pad(brt.getUTCHours())}:${pad(brt.getUTCMinutes())}:${pad(brt.getUTCSeconds())}`;
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

socket.on('entregadores_atualizados', () => { carregarEntregadores(); });

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

// Revelar links de admin/super_admin
(async () => {
  try {
    const r = await fetch('/api/auth/me');
    if (r.status === 401) { window.location.href = '/login'; return; }
    const me = await r.json();
    // Cardápio visível para operador, admin e super_admin
    if (['admin', 'super_admin', 'operador'].includes(me?.papel)) {
      const elCat = document.getElementById('nav-catalogo');
      if (elCat) elCat.style.display = '';
    }
    if (me?.papel === 'admin' || me?.papel === 'super_admin') {
      const elAdmin  = document.getElementById('nav-admin');
      const elCli    = document.getElementById('nav-clientes');
      const elConfig = document.getElementById('nav-config');
      const elEnt    = document.getElementById('nav-entregadores');
      const elCanc   = document.getElementById('nav-cancelados');
      if (elAdmin)  elAdmin.style.display  = '';
      if (elCli)    elCli.style.display    = '';
      if (elConfig) elConfig.style.display = '';
      if (elEnt)    elEnt.style.display    = '';
      if (elCanc)   elCanc.style.display   = '';
    }
  } catch (_) {}
})();

carregarPedidos();
carregarEntregadores();

/* ============================================================
   MODAL DE PEDIDO (novo / editar)
   ============================================================ */

let _catalogo      = null;  // catalog cache
let _pizzasModal   = [];    // pizzas já adicionadas no modal
let _modalModo     = 'new'; // 'new' | 'edit'
let _entregadores  = [];    // cache de entregadores ativos
let _modalNumero   = null;  // número do pedido sendo editado

async function _carregarCatalogo() {
  if (_catalogo) return _catalogo;
  const r = await fetch('/api/catalogo').catch(() => null);
  if (r && r.ok) _catalogo = await r.json();
  return _catalogo;
}

async function abrirNovoPedido() {
  _modalModo   = 'new';
  _modalNumero = null;
  _pizzasModal = [];
  await _abrirModalPedido();
  document.getElementById('mp-title').textContent   = '➕ Novo Pedido Manual';
  document.getElementById('btn-submit-pedido').textContent = '✅ Lançar Pedido';
  document.getElementById('mp-nome').value      = '';
  document.getElementById('mp-telefone').value  = '';
  document.getElementById('mp-endereco').value  = '';
  document.getElementById('mp-pagamento').value = 'entrega';
  _renderPizzasModal();
  calcularTotalModal();
  fecharFormPizza();
}

async function abrirEditarPedido(numero) {
  const card = document.querySelector(`[data-numero="${numero}"]`);
  if (!card) return;
  _modalModo   = 'edit';
  _modalNumero = numero;

  // Extrair dados do card via API para ter estrutura completa
  const r = await fetch('/api/pedidos').catch(() => null);
  if (!r || !r.ok) { toast('❌ Erro ao carregar pedido'); return; }
  const todos  = await r.json();
  const pedido = todos.find(p => p.numero === numero);
  if (!pedido) { toast('❌ Pedido não encontrado'); return; }

  _pizzasModal = JSON.parse(JSON.stringify(pedido.itens || []));
  await _abrirModalPedido();
  document.getElementById('mp-title').textContent   = `✏️ Editar Pedido ${numero}`;
  document.getElementById('btn-submit-pedido').textContent = '💾 Salvar Alterações';
  document.getElementById('mp-nome').value      = pedido.nome     || '';
  document.getElementById('mp-telefone').value  = pedido.telefone || '';
  document.getElementById('mp-endereco').value  = pedido.endereco || '';
  document.getElementById('mp-pagamento').value = pedido.pagamento || 'entrega';

  // Acompanhamento
  const acompEl = document.getElementById('mp-acompanhamento');
  if (pedido.acompanhamento && acompEl) {
    acompEl.value = pedido.acompanhamento.id || '';
  }

  _renderPizzasModal();
  calcularTotalModal();
  fecharFormPizza();
}

async function _abrirModalPedido() {
  const cat = await _carregarCatalogo();
  if (!cat) { toast('❌ Erro ao carregar cardápio'); return; }

  // Popular tamanhos
  const selTam = document.getElementById('mp-pizza-tamanho');
  selTam.innerHTML = (cat.TAMANHOS || []).map(t =>
    `<option value="${t.id}" data-preco="${t.preco}" data-nome="${escHtml(t.nome)}" data-fatias="${t.fatias}">
      ${escHtml(t.nome)} (${t.fatias} fatias) — R$${t.preco.toFixed(2).replace('.',',')}
    </option>`
  ).join('');

  // Popular bordas
  const selBorda = document.getElementById('mp-pizza-borda');
  selBorda.innerHTML = '<option value="">Sem borda</option>' +
    (cat.BORDAS || []).map(b =>
      `<option value="${b.id}" data-preco="${b.preco}" data-nome="${escHtml(b.nome)}">
        ${escHtml(b.nome)} (+R$${b.preco.toFixed(2).replace('.',',')})
      </option>`
    ).join('');

  // Popular acompanhamentos
  const selAcomp = document.getElementById('mp-acompanhamento');
  selAcomp.innerHTML = (cat.ACOMPANHAMENTOS || []).map(a =>
    `<option value="${a.id}" data-preco="${a.preco}" data-nome="${escHtml(a.nome)}">
      ${a.preco > 0 ? `🥤 ${escHtml(a.nome)} (+R$${a.preco.toFixed(2).replace('.',',')})` : `❌ ${escHtml(a.nome)}`}
    </option>`
  ).join('');

  filtrarSaboresModal();

  document.getElementById('fi-mp').style.display = 'none';
  document.getElementById('modal-pedido').classList.add('open');
}

function fecharModalPedido() {
  document.getElementById('modal-pedido').classList.remove('open');
  fecharFormPizza();
}

function filtrarSaboresModal() {
  if (!_catalogo) return;
  const tipo  = document.getElementById('mp-pizza-tipo').value;
  const lista = tipo === 'salgada' ? (_catalogo.PIZZAS?.salgadas || []) : (_catalogo.PIZZAS?.doces || []);
  const grid  = document.getElementById('mp-sabores-grid');
  grid.innerHTML = lista.map(s =>
    `<label class="mp-sabor-cb">
       <input type="checkbox" value="${escHtml(s.id)}" data-nome="${escHtml(s.nome)}" onchange="_limitarSabores()">
       ${escHtml(s.nome)}
     </label>`
  ).join('');
  // Mostrar/ocultar borda (somente para salgada)
  document.getElementById('mp-borda-wrap').style.display = tipo === 'salgada' ? '' : 'none';
  calcularTotalModal();
}

function _limitarSabores() {
  const cbs = [...document.querySelectorAll('#mp-sabores-grid input[type=checkbox]')];
  const marcados = cbs.filter(c => c.checked);
  if (marcados.length > 2) {
    // Desmarcar o último marcado
    const evt = window.event || {};
    if (evt.target && !evt.target.checked) return; // desmarcando, ok
    cbs.forEach(c => { if (c.checked && c !== marcados[0] && c !== marcados[1]) c.checked = false; });
  }
}

function abrirFormPizza() {
  document.getElementById('mp-pizza-form').style.display = '';
  document.getElementById('mp-pizza-tipo').value = 'salgada';
  filtrarSaboresModal();
  document.getElementById('mp-pizza-borda').value = '';
  document.querySelector('#mp-pizza-tamanho')?.querySelector('option')?.parentElement && null;
}

function fecharFormPizza() {
  document.getElementById('mp-pizza-form').style.display = 'none';
}

function confirmarPizzaModal() {
  if (!_catalogo) return;
  const tipo     = document.getElementById('mp-pizza-tipo').value;
  const tamSel   = document.getElementById('mp-pizza-tamanho');
  const tamOpt   = tamSel.options[tamSel.selectedIndex];
  const bordaSel = document.getElementById('mp-pizza-borda');
  const bordaOpt = bordaSel.value ? bordaSel.options[bordaSel.selectedIndex] : null;

  const saboresCbs = [...document.querySelectorAll('#mp-sabores-grid input[type=checkbox]:checked')];
  if (saboresCbs.length === 0) { toast('⚠️ Selecione pelo menos 1 sabor.'); return; }
  if (!tamOpt) { toast('⚠️ Selecione um tamanho.'); return; }

  const tamanho = {
    id:     tamSel.value,
    nome:   tamOpt.dataset.nome,
    fatias: parseInt(tamOpt.dataset.fatias),
    preco:  parseFloat(tamOpt.dataset.preco),
  };
  const sabores = saboresCbs.map(cb => ({ id: cb.value, nome: cb.dataset.nome }));
  const borda   = bordaOpt ? {
    id:   bordaSel.value,
    nome: bordaOpt.dataset.nome,
    preco: parseFloat(bordaOpt.dataset.preco),
  } : null;

  _pizzasModal.push({ tipo, tamanho, sabores, borda });
  _renderPizzasModal();
  calcularTotalModal();
  fecharFormPizza();
}

function _renderPizzasModal() {
  const lista = document.getElementById('mp-pizzas-lista');
  const empty = document.getElementById('mp-empty-pizzas');
  if (!_pizzasModal.length) {
    lista.innerHTML = '';
    if (empty) { lista.appendChild(empty); empty.style.display = ''; }
    return;
  }
  if (empty) empty.style.display = 'none';
  lista.innerHTML = _pizzasModal.map((p, i) => {
    const sabores = (p.sabores || []).map(s => s.nome).join(' / ');
    const borda   = p.borda ? ` + Borda ${p.borda.nome}` : '';
    const preco   = ((p.tamanho?.preco || 0) + (p.borda?.preco || 0)).toFixed(2).replace('.', ',');
    const tipo    = p.tipo === 'salgada' ? '🧀' : '🍓';
    return `<div class="mp-pizzas-lista-item">
      <div>
        <strong>${tipo} ${escHtml(p.tamanho?.nome || '')} — ${escHtml(sabores)}${escHtml(borda)}</strong>
        <br><span>R$ ${preco}</span>
      </div>
      <button class="mp-btn-remover" onclick="_removerPizza(${i})">✕ Remover</button>
    </div>`;
  }).join('');
}

function _removerPizza(idx) {
  _pizzasModal.splice(idx, 1);
  _renderPizzasModal();
  calcularTotalModal();
}

function calcularTotalModal() {
  let total = _pizzasModal.reduce((acc, p) =>
    acc + (p.tamanho?.preco || 0) + (p.borda?.preco || 0), 0);

  const acompSel = document.getElementById('mp-acompanhamento');
  const acompOpt = acompSel?.options[acompSel?.selectedIndex];
  const acompPreco = acompOpt ? parseFloat(acompOpt.dataset?.preco || 0) : 0;
  total += acompPreco;

  const el = document.getElementById('mp-total-val');
  if (el) el.textContent = total.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

async function submeterPedidoModal() {
  const fi  = document.getElementById('fi-mp');
  fi.style.display = 'none';

  const nome      = document.getElementById('mp-nome').value.trim();
  const telefone  = document.getElementById('mp-telefone').value.trim();
  const endereco  = document.getElementById('mp-endereco').value.trim();
  const pagamento = document.getElementById('mp-pagamento').value;

  if (!nome)     { _showFiMp('❌ Informe o nome do cliente.'); return; }
  if (!endereco) { _showFiMp('❌ Informe o endereço de entrega.'); return; }
  if (_pizzasModal.length === 0) { _showFiMp('❌ Adicione pelo menos uma pizza.'); return; }

  const acompSel  = document.getElementById('mp-acompanhamento');
  const acompOpt  = acompSel?.options[acompSel?.selectedIndex];
  const acompanhamento = acompOpt && _catalogo
    ? (_catalogo.ACOMPANHAMENTOS || []).find(a => a.id === acompSel.value) || null
    : null;

  const total = _pizzasModal.reduce((acc, p) =>
    acc + (p.tamanho?.preco || 0) + (p.borda?.preco || 0), 0)
    + (acompanhamento?.preco || 0);

  const btn = document.getElementById('btn-submit-pedido');
  btn.disabled    = true;
  btn.textContent = 'Salvando...';

  const url    = _modalModo === 'edit' ? `/api/pedidos/${encodeURIComponent(_modalNumero)}` : '/api/pedidos/manual';
  const method = _modalModo === 'edit' ? 'PUT' : 'POST';

  const r = await fetch(url, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ nome, telefone: telefone || null, endereco, itens: _pizzasModal, pizzas: _pizzasModal, acompanhamento, pagamento, total }),
  }).catch(() => null);

  btn.disabled    = false;
  btn.textContent = _modalModo === 'edit' ? '💾 Salvar Alterações' : '✅ Lançar Pedido';

  if (!r) { _showFiMp('❌ Erro de conexão.'); return; }
  if (r.status === 401) { window.location.href = '/login'; return; }
  const data = await r.json();
  if (r.ok) {
    fecharModalPedido();
    toast(_modalModo === 'edit' ? `✅ Pedido ${_modalNumero} atualizado!` : `✅ Pedido ${data.numero} criado!`);
  } else {
    _showFiMp(`❌ ${data.erro || 'Erro ao salvar pedido.'}`);
  }
}

function _showFiMp(msg) {
  const fi = document.getElementById('fi-mp');
  fi.className = 'feedback-inline fi-err';
  fi.textContent = msg;
  fi.style.display = 'block';
}

// Fechar modal ao clicar fora
document.getElementById('modal-pedido')?.addEventListener('click', function(e) {
  if (e.target === this) fecharModalPedido();
});
