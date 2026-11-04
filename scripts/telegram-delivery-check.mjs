import { loadEnv } from 'vite';
const env = loadEnv(process.env.NODE_ENV === 'production' ? 'production' : 'development', process.cwd(), '');
const token = env.TELEGRAM_BOT_TOKEN || process.env.TELEGRAM_BOT_TOKEN;
const personalChatId = env.TELEGRAM_CHAT_ID || process.env.TELEGRAM_CHAT_ID;
const groupChatId = env.TELEGRAM_GROUP_CHAT_ID || process.env.TELEGRAM_GROUP_CHAT_ID;
const chatIds = [...new Set([personalChatId, groupChatId].filter(Boolean).map(String))];
if (!token || chatIds.length === 0) {
  console.error('Для тесту потрібні TELEGRAM_BOT_TOKEN і хоча б один отримувач: TELEGRAM_CHAT_ID або TELEGRAM_GROUP_CHAT_ID у файлі .env.');
  process.exit(1);
}
let failures = 0;
for (const chatId of chatIds) {
  try {
    const response = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, text: '✅ Тестове повідомлення. Telegram-сповіщення сайту MOOD налаштовано.' }),
      signal: AbortSignal.timeout(15000)
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok || !result.ok) {
      failures += 1;
      console.error(`Не вдалося надіслати в чат ${chatId}: ${result.description || response.status}`);
    } else {
      console.log(`Тестове повідомлення надіслано в чат ${chatId}.`);
    }
  } catch (error) {
    failures += 1;
    console.error(`Помилка для чату ${chatId}: ${error.message}`);
  }
}
if (failures) process.exit(1);
console.log(`Успішно перевірено отримувачів: ${chatIds.length}.`);
