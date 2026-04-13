/**
 * Gerador de payload Pix Copia e Cola (EMV/TLV - padrão Banco Central do Brasil)
 */

function crc16(str) {
  let crc = 0xFFFF;
  for (let i = 0; i < str.length; i++) {
    crc ^= str.charCodeAt(i) << 8;
    for (let j = 0; j < 8; j++) {
      crc = (crc & 0x8000) ? ((crc << 1) ^ 0x1021) : (crc << 1);
      crc &= 0xFFFF;
    }
  }
  return crc.toString(16).toUpperCase().padStart(4, '0');
}

function campo(id, valor) {
  const v = String(valor);
  return `${id}${String(v.length).padStart(2, '0')}${v}`;
}

/**
 * Normaliza string para os campos do Pix (sem acentos, sem caracteres especiais)
 */
function normalizar(str, maxLen) {
  return String(str || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^A-Za-z0-9 ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .substring(0, maxLen);
}

/**
 * Gera o payload Pix Copia e Cola (static QR)
 * @param {Object} opts
 * @param {string} opts.chave      - Chave Pix (email, CPF, CNPJ, telefone ou chave aleatória)
 * @param {string} opts.nome       - Nome do beneficiário (max 25 chars)
 * @param {string} opts.cidade     - Cidade do beneficiário (max 15 chars)
 * @param {number} opts.valor      - Valor da transação (ex: 57.00)
 * @param {string} opts.txid       - ID da transação (número do pedido, max 25 chars)
 * @returns {string} Payload Pix para copiar e colar
 */
function gerarPixCopiaECola({ chave, nome, cidade, valor, txid }) {
  const nomeNorm   = normalizar(nome,   25);
  const cidadeNorm = normalizar(cidade, 15);
  const txidNorm   = normalizar(txid || 'PEDIDO', 25).replace(/\s/g, '');
  const valorStr   = Number(valor).toFixed(2);

  const merchantInfo   = campo('00', 'br.gov.bcb.pix') + campo('01', chave);
  const additionalData = campo('05', txidNorm);

  let payload =
    campo('00', '01') +
    campo('26', merchantInfo) +
    campo('52', '0000') +
    campo('53', '986') +
    campo('54', valorStr) +
    campo('58', 'BR') +
    campo('59', nomeNorm) +
    campo('60', cidadeNorm) +
    campo('62', additionalData) +
    '6304'; // placeholder para o CRC

  return payload + crc16(payload);
}

module.exports = { gerarPixCopiaECola };
