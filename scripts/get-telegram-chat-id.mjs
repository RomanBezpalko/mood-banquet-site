import { loadEnv } from 'vite';
const env = loadEnv(process.env.NODE_ENV === 'production' ? 'production' : 'development', process.cwd(), '');
const token = env.TELEGRAM_BOT_TOKEN || process.env.TELEGRAM_BOT_TOKEN;
if (!token) {
  console.error('Не знайдено TELEGRAM_BOT_TOKEN. Спочатку створіть файл .env і додайте токен бота.');
  process.exit(1);
}
const response = await fetch(`https://api.telegram.org/bot${token}/getUpdates`, { signal: AbortSignal.timeout(12000) });
const result = await response.json().catch(() => ({}));
if (!response.ok || !result.ok) {
  console.error(`Telegram API повернув помилку: ${result.description || response.status}`);
  console.error('Переконайтеся, що ви написали боту /start. Якщо налаштований webhook, getUpdates не працюватиме одночасно з ним.');
  process.exit(1);
}
const chats = new Map();
for (const update of result.result || []) {
  const message = update.message || update.edited_message || update.channel_post;
  const chat = message?.chat;
  if (chat) chats.set(String(chat.id), { id: chat.id, type: chat.type, title: chat.title || [chat.first_name, chat.last_name].filter(Boolean).join(' '), username: chat.username || '', lastText: message.text || '' });
}
if (!chats.size) {
  console.log('Поки немає повідомлень від вас. Відкрийте свого бота в Telegram, натисніть Start або надішліть /start, потім повторіть команду.');
} else {
  console.log('Знайдені чати. Скопіюйте потрібний chat_id у файл .env:');
  for (const chat of chats.values()) {
    console.log(`\nchat_id: ${chat.id}\nТип: ${chat.type}\nНазва: ${chat.title || '(без назви)'}\nUsername: ${chat.username || '(немає)'}\nОстаннє повідомлення: ${chat.lastText}`);
  }
}
