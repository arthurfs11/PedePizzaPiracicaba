const { PIZZAS, TAMANHOS, ACOMPANHAMENTOS, BORDAS } = require('./menu');

function kbTipoPizza() {
  return {
    inline_keyboard: [
      [
        { text: '🧀 Salgada', callback_data: 't_s' },
        { text: '🍓 Doce',    callback_data: 't_d' },
      ],
    ],
  };
}

function kbTamanho() {
  return {
    inline_keyboard: [
      TAMANHOS.map((t) => ({
        text: `${t.nome} (${t.fatias} fatias) R$${t.preco.toFixed(2)}`,
        callback_data: `sz_${t.id}`,
      })),
    ],
  };
}

function kbQuantidadeSabores() {
  return {
    inline_keyboard: [
      [
        { text: '1️⃣  Um sabor',                   callback_data: 'fc_1' },
        { text: '2️⃣  Metade a metade',             callback_data: 'fc_2' },
      ],
    ],
  };
}

function kbSabores(tipo, excluirId = null) {
  const lista = tipo === 'salgada' ? PIZZAS.salgadas : PIZZAS.doces;
  const filtrada = excluirId ? lista.filter((s) => s.id !== excluirId) : lista;
  const rows = [];
  for (let i = 0; i < filtrada.length; i += 2) {
    const row = [{ text: filtrada[i].nome, callback_data: `fl_${filtrada[i].id}` }];
    if (filtrada[i + 1]) {
      row.push({ text: filtrada[i + 1].nome, callback_data: `fl_${filtrada[i + 1].id}` });
    }
    rows.push(row);
  }
  return { inline_keyboard: rows };
}

function kbAcompanhamento() {
  return {
    inline_keyboard: ACOMPANHAMENTOS.map(a => [{
      text: a.preco > 0
        ? `🥤 ${a.nome} (+R$${a.preco.toFixed(2).replace('.', ',')})`
        : `❌ ${a.nome}`,
      callback_data: `ac_${a.id}`,
    }]),
  };
}

function kbMaisPizza() {
  return {
    inline_keyboard: [
      [
        { text: '🍕 Sim, mais uma pizza!', callback_data: 'mp_y' },
        { text: '🛒 Não, finalizar',       callback_data: 'mp_n' },
      ],
    ],
  };
}

function kbConfirmar() {
  return {
    inline_keyboard: [
      [
        { text: '✅ Confirmar pedido', callback_data: 'cf_y' },
        { text: '❌ Cancelar tudo',    callback_data: 'cf_n' },
      ],
    ],
  };
}

function kbPagamento() {
  return {
    inline_keyboard: [
      [{ text: '🏦 Pagar com Pix',      callback_data: 'pgt_pix' }],
      [{ text: '💵 Pagar na entrega',   callback_data: 'pgt_ent' }],
    ],
  };
}

function kbIniciar() {
  return {
    inline_keyboard: [
      [{ text: '🍕 Fazer pedido', callback_data: 'start_order' }],
    ],
  };
}

function kbBorda() {
  return {
    inline_keyboard: [
      [
        { text: '✅ Sim, quero borda!', callback_data: 'bd_y' },
        { text: '❌ Não, obrigado',     callback_data: 'bd_n' },
      ],
    ],
  };
}

function kbBordaSabor() {
  return {
    inline_keyboard: BORDAS.map(b => [{
      text: `${b.nome} (+R$${b.preco.toFixed(2).replace('.', ',')})`,
      callback_data: `bds_${b.id}`,
    }]),
  };
}

function kbConfirmarEndereco() {
  return {
    inline_keyboard: [[
      { text: '✅ Sim, usar este endereço', callback_data: 'addr_y' },
      { text: '❌ Não, informar novo',      callback_data: 'addr_n' },
    ]],
  };
}

module.exports = {
  kbTipoPizza,
  kbTamanho,
  kbQuantidadeSabores,
  kbSabores,
  kbAcompanhamento,
  kbMaisPizza,
  kbConfirmar,
  kbPagamento,
  kbIniciar,
  kbBorda,
  kbBordaSabor,
  kbConfirmarEndereco,
};
