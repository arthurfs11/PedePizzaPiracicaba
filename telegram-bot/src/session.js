// Armazenamento em memória de sessões por chat_id
const sessions = new Map();

function getSession(chatId) {
  if (!sessions.has(chatId)) {
    sessions.set(chatId, { step: 'idle' });
  }
  return sessions.get(chatId);
}

function setSession(chatId, data) {
  sessions.set(chatId, data);
}

function clearSession(chatId) {
  sessions.set(chatId, { step: 'idle' });
}

module.exports = { getSession, setSession, clearSession };
