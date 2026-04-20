const axios = require('axios');

const BASE_URL = 'https://api.abacatepay.com/v1';

function isConfigurado() {
  return !!(process.env.ABACATEPAY_API_KEY);
}

/**
 * Cria uma cobrança Pix via AbacatePay e retorna { id, url }.
 * Ativa apenas quando ABACATEPAY_API_KEY estiver definida no .env.
 *
 * @param {object} opts
 * @param {string} opts.tempId       - ID temporário único (chatId+timestamp)
 * @param {string} opts.nome         - Nome do cliente
 * @param {string} opts.telefone     - Telefone do cliente (ex: "19 91234-5678")
 * @param {number} opts.total        - Valor total em reais (ex: 52.00)
 * @param {string} opts.descricao    - Descrição resumida do pedido
 */
async function criarCobrancaPix({ tempId, nome, telefone, total, descricao }) {
  if (!isConfigurado()) throw new Error('ABACATEPAY_API_KEY não configurada');

  const valorCentavos = Math.round(total * 100);

  // Formata celular para +55XXXXXXXXXX (AbacatePay exige formato internacional)
  let celular;
  if (telefone) {
    const digits = telefone.replace(/\D/g, '');
    celular = digits.startsWith('55') ? `+${digits}` : `+55${digits}`;
  }

  const payload = {
    frequency: 'ONE_TIME',
    methods: ['PIX'],
    products: [
      {
        externalId: tempId,
        name: `Pedido Pede Pizza`,
        description: descricao || 'Pedido via Telegram',
        quantity: 1,
        price: valorCentavos,
      },
    ],
    customer: {
      name: nome,
      ...(celular && { cellphone: celular }),
    },
    // returnUrl e completionUrl opcionais — configure ABACATEPAY_RETURN_URL no .env se tiver domínio
    ...(process.env.ABACATEPAY_RETURN_URL && {
      returnUrl:     process.env.ABACATEPAY_RETURN_URL,
      completionUrl: process.env.ABACATEPAY_RETURN_URL,
    }),
  };

  const { data: resp } = await axios.post(`${BASE_URL}/billing/create`, payload, {
    headers: {
      Authorization: `Bearer ${process.env.ABACATEPAY_API_KEY}`,
      'Content-Type': 'application/json',
    },
    timeout: 12000,
  });

  if (!resp?.data?.id) throw new Error('AbacatePay não retornou ID de cobrança');

  return { id: resp.data.id, url: resp.data.url };
}

module.exports = { isConfigurado, criarCobrancaPix };
