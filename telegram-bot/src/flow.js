const axios = require('axios');
const { PIZZAS, TAMANHOS, ACOMPANHAMENTOS, BORDAS } = require('./menu');
const {
  kbTipoPizza, kbTamanho, kbQuantidadeSabores, kbSabores,
  kbAcompanhamento, kbMaisPizza, kbConfirmar, kbPagamento, kbIniciar,
  kbBorda, kbBordaSabor,
} = require('./keyboards');
const { getSession, setSession, clearSession } = require('./session');
const { gerarPixCopiaECola } = require('./pix');

const N8N_WEBHOOK_URL  = process.env.N8N_WEBHOOK_URL  || 'http://localhost:5678/webhook/direciona-pedido';

// Lidas dinamicamente para garantir que o dotenv já carregou
function pixConfig() {
  return {
    key:    process.env.PIX_KEY    || '',
    nome:   process.env.PIX_NOME   || 'Pede Pizza Piracicaba',
    cidade: process.env.PIX_CIDADE || 'Piracicaba',
  };
}

// ── Helpers ────────────────────────────────────────────────

function novaPizzaAtual() {
  return { tipo: null, tamanho: null, quantidadeSabores: 1, sabores: [] };
}

function calcularTotal(sessao) {
  const pizzas = (sessao.pizzas || []).reduce((acc, p) => acc + (p.tamanho?.preco || 0) + (p.borda?.preco || 0), 0);
  const acomp  = sessao.acompanhamento?.preco || 0;
  return pizzas + acomp;
}

function formatarResumo(sessao) {
  const linhas = [];
  linhas.push(`👤 *Nome:* ${sessao.nome}`);
  if (sessao.telefone) linhas.push(`📱 *Telefone:* ${sessao.telefone}`);
  linhas.push(`📍 *Endereço:* ${sessao.endereco}`);
  linhas.push('');

  (sessao.pizzas || []).forEach((p, i) => {
    const tipo    = p.tipo === 'salgada' ? '🧀' : '🍓';
    const sabores = p.sabores.map((s) => s.nome).join(' / ');
    const preco   = ((p.tamanho?.preco || 0) + (p.borda?.preco || 0)).toFixed(2);
    const borda   = p.borda ? ` + Borda ${p.borda.nome}` : '';
    linhas.push(`🍕 *Pizza ${i + 1}:* ${tipo} ${p.tamanho?.nome} — ${sabores}${borda} — *R$${preco}*`);
  });

  if (sessao.acompanhamento?.preco > 0) {
    const preco = sessao.acompanhamento.preco.toFixed(2);
    linhas.push(`🥤 *Acompanhamento:* ${sessao.acompanhamento.nome} — *R$${preco}*`);
  }

  linhas.push('');
  linhas.push(`💰 *Total: R$${calcularTotal(sessao).toFixed(2)}*`);
  return linhas.join('\n');
}

// ── Envio para n8n ─────────────────────────────────────────

async function enviarPedidoParaN8n(sessao, chatId) {
  const total = calcularTotal(sessao);
  const payload = {
    nome:            sessao.nome,
    telefone:        sessao.telefone  || null,
    endereco:        sessao.endereco,
    pizzas:          sessao.pizzas,
    acompanhamento:  sessao.acompanhamento || null,
    pagamento:       sessao.pagamento || 'entrega',
    total,
    telegram_chat_id: String(chatId),
  };
  const { data } = await axios.post(N8N_WEBHOOK_URL, payload, { timeout: 10000 });
  return data;
}

// ── Orientação contextual (quando usuário digita fora de hora) ──

async function enviarMensagemDeEstado(ctx, sessao) {
  const { kbIniciar } = require('./keyboards');
  const msgs = {
    idle:                  () => ctx.reply('Olá! Use /start para iniciar um pedido. 🍕'),
    waiting_name:          () => ctx.reply('Por favor, me diga seu *nome* para continuar:', { parse_mode: 'Markdown' }),
    waiting_phone:         () => ctx.reply('Qual é o seu *número de celular* com DDD? (ex: 19 91234-5678)', { parse_mode: 'Markdown' }),
    waiting_address:       () => ctx.reply('Me diga seu *endereço de entrega*:', { parse_mode: 'Markdown' }),
    choosing_type:         () => ctx.reply('*Que tipo de pizza você deseja?*', { parse_mode: 'Markdown', reply_markup: kbTipoPizza() }),
    choosing_size:         () => ctx.reply('*Qual tamanho?*', { parse_mode: 'Markdown', reply_markup: kbTamanho() }),
    choosing_flavor_count: () => ctx.reply('*Quantos sabores?*', { parse_mode: 'Markdown', reply_markup: kbQuantidadeSabores() }),
    choosing_flavor1:      () => ctx.reply('*Escolha o sabor:*', { parse_mode: 'Markdown', reply_markup: kbSabores(sessao.pizzaAtual?.tipo) }),
    choosing_flavor2:      () => ctx.reply('*Escolha o 2º sabor:*', { parse_mode: 'Markdown', reply_markup: kbSabores(sessao.pizzaAtual?.tipo, sessao.pizzaAtual?.sabores[0]?.id) }),
    asking_more_pizza:     () => ctx.reply('*Deseja adicionar mais uma pizza?*', { parse_mode: 'Markdown', reply_markup: kbMaisPizza() }),
    choosing_crust:         () => ctx.reply('*Quer borda recheada nessa pizza?*', { parse_mode: 'Markdown', reply_markup: kbBorda() }),
    choosing_crust_sabor:   () => ctx.reply('*Qual sabor de borda?*', { parse_mode: 'Markdown', reply_markup: kbBordaSabor() }),
    choosing_accompaniment:() => ctx.reply('*Deseja algum acompanhamento?*', { parse_mode: 'Markdown', reply_markup: kbAcompanhamento() }),
    confirming:            () => ctx.reply(`*Resumo do pedido:*\n\n${formatarResumo(sessao)}\n\n_Confirma?_`, { parse_mode: 'Markdown', reply_markup: kbConfirmar() }),
    choosing_payment:      () => ctx.reply(`💰 *Total: R$${calcularTotal(sessao).toFixed(2)}*\n\n*Como deseja pagar?*`, { parse_mode: 'Markdown', reply_markup: kbPagamento() }),
  };
  const fn = msgs[sessao.step];
  if (fn) await fn();
}

// ── Handler de texto ───────────────────────────────────────

async function handleText(ctx) {
  const chatId = ctx.chat.id;
  const sessao = getSession(chatId);
  const texto  = ctx.message.text.trim();

  if (sessao.step === 'waiting_name') {
    sessao.nome = texto;
    sessao.step = 'waiting_phone';
    setSession(chatId, sessao);
    await ctx.reply(`Oi, *${texto}*! 😊\n\nQual é o seu *número de celular com DDD* para contato? (ex: 19 91234-5678)`, { parse_mode: 'Markdown' });
    return;
  }

  if (sessao.step === 'waiting_phone') {
    const digits = texto.replace(/\D/g, '');
    if (digits.length < 10 || digits.length > 11) {
      await ctx.reply('📱 Por favor, informe um número válido com DDD (10 ou 11 dígitos).\n\nExemplo: *19 91234-5678*', { parse_mode: 'Markdown' });
      return;
    }
    sessao.telefone = texto;
    sessao.step     = 'waiting_address';
    setSession(chatId, sessao);
    await ctx.reply('Perfeito! 📍 Agora me diga o seu *endereço de entrega* (rua, número, bairro):', { parse_mode: 'Markdown' });
    return;
  }

  if (sessao.step === 'waiting_address') {
    sessao.endereco  = texto;
    sessao.step      = 'choosing_type';
    sessao.pizzaAtual = novaPizzaAtual();
    setSession(chatId, sessao);
    await ctx.reply(
      `Ótimo! Endereço anotado. 📝\n\nVamos montar sua pizza! 🍕\n\n*Que tipo de pizza você deseja?*`,
      { parse_mode: 'Markdown', reply_markup: kbTipoPizza() }
    );
    return;
  }

  await enviarMensagemDeEstado(ctx, sessao);
}

// ── Handler de callback query ──────────────────────────────

async function handleCallback(ctx) {
  const chatId = ctx.chat.id;
  const data   = ctx.callbackQuery.data;
  const sessao = getSession(chatId);

  await ctx.answerCbQuery();

  // ── Iniciar pedido ────────────────────────────────────────
  if (data === 'start_order') {
    setSession(chatId, {
      step:           'waiting_name',
      pizzas:         [],
      telefone:       null,
      acompanhamento: null,
      pagamento:      null,
      pizzaAtual:     null,
    });
    await ctx.reply('Perfeito! Vamos começar. 😊\n\nPrimeiro, me diga o seu *nome completo*:', { parse_mode: 'Markdown' });
    return;
  }

  // ── Tipo de pizza ─────────────────────────────────────────
  if (data === 't_s' || data === 't_d') {
    if (sessao.step !== 'choosing_type') return;
    sessao.pizzaAtual.tipo = data === 't_s' ? 'salgada' : 'doce';
    sessao.step = 'choosing_size';
    setSession(chatId, sessao);
    const label = data === 't_s' ? '🧀 Salgada' : '🍓 Doce';
    await ctx.reply(`${label} — boa escolha! 😋\n\n*Qual tamanho você prefere?*`, { parse_mode: 'Markdown', reply_markup: kbTamanho() });
    return;
  }

  // ── Tamanho ───────────────────────────────────────────────
  if (data.startsWith('sz_')) {
    if (sessao.step !== 'choosing_size') return;
    const tamanho = TAMANHOS.find((t) => t.id === data.replace('sz_', ''));
    sessao.pizzaAtual.tamanho = tamanho;
    sessao.step = 'choosing_flavor_count';
    setSession(chatId, sessao);
    await ctx.reply(`*${tamanho.nome}* selecionada! 🍕\n\n*Quantos sabores você quer nessa pizza?*`, { parse_mode: 'Markdown', reply_markup: kbQuantidadeSabores() });
    return;
  }

  // ── Quantidade de sabores ─────────────────────────────────
  if (data === 'fc_1' || data === 'fc_2') {
    if (sessao.step !== 'choosing_flavor_count') return;
    sessao.pizzaAtual.quantidadeSabores = data === 'fc_1' ? 1 : 2;
    sessao.pizzaAtual.sabores = [];
    sessao.step = 'choosing_flavor1';
    setSession(chatId, sessao);
    const plural = data === 'fc_2' ? ' *(1º sabor)*' : '';
    await ctx.reply(`*Escolha o sabor${plural}:*`, { parse_mode: 'Markdown', reply_markup: kbSabores(sessao.pizzaAtual.tipo) });
    return;
  }

  // ── Sabores ───────────────────────────────────────────────
  if (data.startsWith('fl_')) {
    if (sessao.step !== 'choosing_flavor1' && sessao.step !== 'choosing_flavor2') return;
    const id    = data.replace('fl_', '');
    const tipo  = sessao.pizzaAtual.tipo;
    const lista = tipo === 'salgada' ? PIZZAS.salgadas : PIZZAS.doces;
    const sabor = lista.find((s) => s.id === id);

    sessao.pizzaAtual.sabores.push(sabor);

    // Ainda falta o 2º sabor?
    if (sessao.step === 'choosing_flavor1' && sessao.pizzaAtual.quantidadeSabores === 2) {
      sessao.step = 'choosing_flavor2';
      setSession(chatId, sessao);
      await ctx.reply(`*${sabor.nome}* escolhido! 👌\n\nAgora escolha o *2º sabor:*`, { parse_mode: 'Markdown', reply_markup: kbSabores(tipo, id) });
      return;
    }

    // Pizza completa → se salgada, pergunta sobre borda; se doce, pergunta mais pizza
    if (sessao.pizzaAtual.tipo === 'salgada') {
      sessao.step = 'choosing_crust';
      setSession(chatId, sessao);
      const saboresStr = sessao.pizzaAtual.sabores.map((s) => s.nome).join(' / ');
      await ctx.reply(
        `*${saboresStr}* ✅\n\n🍕 Sabor(es) selecionado(s)!\n\n*Deseja borda recheada nessa pizza?* (+R$6,00)`,
        { parse_mode: 'Markdown', reply_markup: kbBorda() }
      );
    } else {
      sessao.pizzaAtual.borda = null;
      sessao.pizzas.push({ ...sessao.pizzaAtual });
      const numPizzas = sessao.pizzas.length;
      sessao.step = 'asking_more_pizza';
      sessao.pizzaAtual = novaPizzaAtual();
      setSession(chatId, sessao);
      const saboresStr = sessao.pizzas[numPizzas - 1].sabores.map((s) => s.nome).join(' / ');
      await ctx.reply(
        `*${saboresStr}* ✅\n\n🍕 *Pizza ${numPizzas}* adicionada ao pedido!\n\n*Deseja adicionar mais uma pizza?*`,
        { parse_mode: 'Markdown', reply_markup: kbMaisPizza() }
      );
    }
    return;
  }

  // ── Borda (sim/não) ───────────────────────────────────────
  if (data === 'bd_y' || data === 'bd_n') {
    if (sessao.step !== 'choosing_crust') return;
    if (data === 'bd_n') {
      sessao.pizzaAtual.borda = null;
      sessao.pizzas.push({ ...sessao.pizzaAtual });
      const numPizzas = sessao.pizzas.length;
      sessao.step = 'asking_more_pizza';
      sessao.pizzaAtual = novaPizzaAtual();
      setSession(chatId, sessao);
      const saboresStr = sessao.pizzas[numPizzas - 1].sabores.map((s) => s.nome).join(' / ');
      await ctx.reply(
        `Sem borda. ✅\n\n🍕 *Pizza ${numPizzas}* adicionada ao pedido!\n\n*Deseja adicionar mais uma pizza?*`,
        { parse_mode: 'Markdown', reply_markup: kbMaisPizza() }
      );
    } else {
      sessao.step = 'choosing_crust_sabor';
      setSession(chatId, sessao);
      await ctx.reply('*Qual sabor de borda você prefere?*', { parse_mode: 'Markdown', reply_markup: kbBordaSabor() });
    }
    return;
  }

  // ── Sabor da borda ────────────────────────────────────────
  if (data.startsWith('bds_')) {
    if (sessao.step !== 'choosing_crust_sabor') return;
    const id    = data.replace('bds_', '');
    const borda = BORDAS.find((b) => b.id === id);
    sessao.pizzaAtual.borda = borda;
    sessao.pizzas.push({ ...sessao.pizzaAtual });
    const numPizzas = sessao.pizzas.length;
    sessao.step = 'asking_more_pizza';
    sessao.pizzaAtual = novaPizzaAtual();
    setSession(chatId, sessao);
    const saboresStr = sessao.pizzas[numPizzas - 1].sabores.map((s) => s.nome).join(' / ');
    await ctx.reply(
      `Borda de *${borda.nome}* selecionada! 🤤\n\n🍕 *Pizza ${numPizzas}* adicionada ao pedido!\n\n*Deseja adicionar mais uma pizza?*`,
      { parse_mode: 'Markdown', reply_markup: kbMaisPizza() }
    );
    return;
  }

  // ── Mais pizza? ───────────────────────────────────────────
  if (data === 'mp_y') {
    if (sessao.step !== 'asking_more_pizza') return;
    sessao.step = 'choosing_type';
    sessao.pizzaAtual = novaPizzaAtual();
    setSession(chatId, sessao);
    await ctx.reply('Boa! Vamos montar mais uma. 🍕\n\n*Que tipo de pizza desta vez?*', { parse_mode: 'Markdown', reply_markup: kbTipoPizza() });
    return;
  }

  if (data === 'mp_n') {
    if (sessao.step !== 'asking_more_pizza') return;
    sessao.step = 'choosing_accompaniment';
    setSession(chatId, sessao);
    const qtd = sessao.pizzas.length;
    await ctx.reply(
      `Ótimo! ${qtd} pizza${qtd > 1 ? 's' : ''} adicionada${qtd > 1 ? 's' : ''} ao pedido. 🍕\n\n*Deseja algum acompanhamento?*`,
      { parse_mode: 'Markdown', reply_markup: kbAcompanhamento() }
    );
    return;
  }

  // ── Acompanhamento (uma vez para o pedido todo) ───────────
  if (data.startsWith('ac_')) {
    if (sessao.step !== 'choosing_accompaniment') return;
    const id    = data.replace('ac_', '');
    const acomp = ACOMPANHAMENTOS.find((a) => a.id === id);
    sessao.acompanhamento = acomp;
    sessao.step = 'confirming';
    setSession(chatId, sessao);
    await ctx.reply(
      `📋 *Resumo do seu pedido:*\n\n${formatarResumo(sessao)}\n\n_Tudo certo? Deseja confirmar?_`,
      { parse_mode: 'Markdown', reply_markup: kbConfirmar() }
    );
    return;
  }

  // ── Confirmar pedido ──────────────────────────────────────
  if (data === 'cf_y') {
    if (sessao.step !== 'confirming') return;
    sessao.step = 'choosing_payment';
    setSession(chatId, sessao);
    const total = calcularTotal(sessao).toFixed(2).replace('.', ',');
    await ctx.reply(
      `💰 *Total do pedido: R$${total}*\n\nComo você deseja realizar o pagamento?`,
      { parse_mode: 'Markdown', reply_markup: kbPagamento() }
    );
    return;
  }

  if (data === 'cf_n') {
    if (sessao.step !== 'confirming') return;
    clearSession(chatId);
    await ctx.reply('❌ Pedido cancelado.\n\nUse /start para fazer um novo pedido. 🍕');
    return;
  }

  // ── Pagamento ─────────────────────────────────────────────
  if (data === 'pgt_pix' || data === 'pgt_ent') {
    if (sessao.step !== 'choosing_payment') return;
    const isPix = data === 'pgt_pix';
    sessao.pagamento = isPix ? 'pix' : 'entrega';
    sessao.step = 'processing';
    setSession(chatId, sessao);

    await ctx.reply('⏳ Processando seu pedido, aguarde...');

    let numero = 'N/A';
    try {
      const resp = await enviarPedidoParaN8n(sessao, chatId);
      numero = resp?.numero || 'N/A';
    } catch (err) {
      console.error('[BOT] Falha ao enviar para n8n:', err.message);
    }

    if (isPix) {
      const total = calcularTotal(sessao);
      const { key, nome: pixNome, cidade: pixCidade } = pixConfig();

      if (!key) {
        // Chave Pix não configurada no .env
        await ctx.reply(
          `✅ *Pedido #${numero} confirmado!*\n\n🏦 *Pagamento via Pix*\n\nEm breve enviaremos o código Pix pelo chat. 😊\n\n🕐 Tempo estimado: *40–50 min* após confirmação do pagamento.`,
          { parse_mode: 'Markdown' }
        );
      } else {
        const txid = numero.replace(/[^A-Za-z0-9]/g, '').substring(0, 25);
        const pixCode = gerarPixCopiaECola({ chave: key, nome: pixNome, cidade: pixCidade, valor: total, txid });

        await ctx.reply(
          `✅ *Pedido #${numero} confirmado!*\n\n🏦 *Pague via Pix — R$${total.toFixed(2).replace('.', ',')}*\n\nCopie o código abaixo e cole no seu banco ou carteira digital:`,
          { parse_mode: 'Markdown' }
        );
        // Texto simples para cópia sem risco de formatação Markdown quebrar o código
        await ctx.reply(pixCode);
        await ctx.reply(
          `⏳ Assim que o pagamento for identificado, seu pedido entra para preparo!\n🕐 Tempo estimado: *40–50 minutos* após confirmação.`,
          { parse_mode: 'Markdown' }
        );
      }
    } else {
      await ctx.reply(
        `✅ *Pedido #${numero} confirmado!*\n\n💵 Pagamento: *na entrega*\n\n🕐 Tempo estimado: *40–50 minutos*\n\nEm breve entraremos em contato. Obrigado pela preferência! 🍕`,
        { parse_mode: 'Markdown' }
      );
    }

    clearSession(chatId);
    await ctx.reply('Para fazer um novo pedido é só usar /start. 😊');
    return;
  }
}

module.exports = { handleText, handleCallback };
