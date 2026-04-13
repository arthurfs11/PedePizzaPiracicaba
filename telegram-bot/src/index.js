require('dotenv').config({ path: require('path').join(__dirname, '../../.env') });
const { Telegraf } = require('telegraf');
const { handleText, handleCallback } = require('./flow');
const { kbIniciar } = require('./keyboards');

const BOT_TOKEN = process.env.BOT_TOKEN;
if (!BOT_TOKEN) {
  console.error('❌ BOT_TOKEN não definido no .env');
  process.exit(1);
}

const bot = new Telegraf(BOT_TOKEN);

// ── /start ──
bot.start(async (ctx) => {
  const nome = ctx.from.first_name || 'visitante';
  await ctx.reply(
    `🍕 *Bem-vindo à Pede Pizza Piracicaba!*\n\nOlá, ${nome}! Aqui você faz seu pedido de pizza de forma rápida e fácil, sem precisar ligar.\n\n👇 Clique no botão abaixo para começar:`,
    {
      parse_mode: 'Markdown',
      reply_markup: kbIniciar(),
    }
  );
});

// ── /ajuda ──
bot.command('ajuda', async (ctx) => {
  await ctx.reply(
    `ℹ️ *Ajuda*\n\n/start — Iniciar novo pedido\n/ajuda — Mostrar esta mensagem\n/cancelar — Cancelar pedido atual`,
    { parse_mode: 'Markdown' }
  );
});

// ── /cancelar ──
bot.command('cancelar', async (ctx) => {
  const { clearSession } = require('./session');
  clearSession(ctx.chat.id);
  await ctx.reply('❌ Pedido cancelado. Use /start para fazer um novo pedido.');
});

// ── Mensagens de texto ──
bot.on('text', handleText);

// ── Callback queries (botões inline) ──
bot.on('callback_query', handleCallback);

// ── Erro global ──
bot.catch((err, ctx) => {
  console.error(`[BOT] Erro no chat ${ctx?.chat?.id}:`, err.message);
});

// ── Inicializar ──
bot.launch()
  .then(() => console.log('🍕 Bot iniciado com sucesso!'))
  .catch((err) => {
    console.error('❌ Falha ao iniciar bot:', err.message);
    process.exit(1);
  });

process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));
