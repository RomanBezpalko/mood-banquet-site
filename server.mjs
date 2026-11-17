import http from 'node:http';
import path from 'node:path';
import { createCipheriv, createDecipheriv, randomBytes, randomUUID } from 'node:crypto';
import { normalizeUaPhone } from './shared/ua-phone.js';
import { appendFile, mkdir, readFile, readdir, rename, stat, unlink, writeFile } from 'node:fs/promises';
import { createServer as createViteServer, loadEnv } from 'vite';

const isProduction = process.env.NODE_ENV === 'production' || process.argv.includes('--production');
const mode = isProduction ? 'production' : 'development';
const env = loadEnv(mode, process.cwd(), '');
const setting = name => process.env[name] || env[name];
const port = Number(process.env.PORT || env.PORT || 5173);
const TEST_MODE = process.env.MOOD_TEST_MODE === 'true';
const host = process.env.HOST || '0.0.0.0';
if (TEST_MODE && !['127.0.0.1', 'localhost', '::1'].includes(host)) {
  throw new Error('MOOD_TEST_MODE is allowed only on localhost. Set HOST=127.0.0.1.');
}
const rateLimits = new Map();
const TEN_MINUTES = 10 * 60 * 1000;
const MAX_RATE_LIMIT_KEYS = 10_000;
const MAX_BODY = 12 * 1024;
const MIN_FORM_TIME_MS = 1200;
const configuredAppOrigin = String(setting('APP_ORIGIN') || '').replace(/\/$/, '');
const trustProxy = setting('TRUST_PROXY') === 'true';
if (isProduction && !configuredAppOrigin) {
  throw new Error('APP_ORIGIN must be configured in production, for example https://mood.example.');
}
const TELEGRAM_API_BASE_URL = String(setting('TELEGRAM_API_BASE_URL') || 'https://api.telegram.org').replace(/\/$/, '');
const DATA_DIR = path.resolve(process.env.MOOD_DATA_DIR || path.join(process.cwd(), 'data'));
const LEADS_FILE = path.join(DATA_DIR, 'leads.json');
const BOT_STATE_FILE = path.join(DATA_DIR, 'telegram-state.json');
const MANAGERS_FILE = path.join(DATA_DIR, 'managers.json');
const SECURITY_AUDIT_FILE = path.join(DATA_DIR, 'security-audit.jsonl');
const SECURITY_AUDIT_MAX_BYTES = 1024 * 1024;
const SECURITY_AUDIT_RETENTION_MS = 30 * 24 * 60 * 60 * 1000;
const STORAGE_TEMP_RETENTION_MS = 24 * 60 * 60 * 1000;
const STORAGE_ENCRYPTION_PREFIX = 'mood-storage-v1:';
const botToken = setting('TELEGRAM_BOT_TOKEN');
const storageEncryptionKey = (() => {
  const configuredKey = String(setting('MOOD_DATA_ENCRYPTION_KEY') || '').trim();
  if (!configuredKey) {
    if (isProduction) throw new Error('MOOD_DATA_ENCRYPTION_KEY must be configured in production.');
    return null;
  }
  if (/^[0-9a-f]{64}$/i.test(configuredKey)) return Buffer.from(configuredKey, 'hex');
  try {
    const decoded = Buffer.from(configuredKey, 'base64');
    if (decoded.length === 32) return decoded;
  } catch {
    // Fall through to the clear configuration error below.
  }
  throw new Error('MOOD_DATA_ENCRYPTION_KEY must be a 64-character hex or 32-byte base64 key.');
})();
const configuredGroupChatId = setting('TELEGRAM_GROUP_CHAT_ID');
const botUsername = String(setting('TELEGRAM_BOT_USERNAME') || 'MoodBanquet_bot').replace(/^@/, '');
const managerIds = new Set(String(setting('TELEGRAM_MANAGER_IDS') || '').split(',').map(value => value.trim()).filter(Boolean));
const SLA_MINUTES = Math.max(1, Math.min(60, Number(setting('TELEGRAM_FIRST_CALL_SLA_MINUTES') || 5)));
const CALLBACK_REMINDER_MINUTES = Math.max(5, Math.min(1440, Number(setting('TELEGRAM_CALLBACK_REMINDER_MINUTES') || 30)));
const leads = new Map();
const registeredManagers = new Map();
const registrationSessions = new Map();
const csrfTokens = new Map();
const CSRF_TOKEN_TTL_MS = 10 * 60 * 1000;
const MAX_CSRF_TOKENS = 10_000;
let persistQueue = Promise.resolve();
let updateOffset = 0;
let pollingController = null;
let pollingStopped = false;
let reminderInterval = null;
let reminderRunActive = false;

const securityHeaders = {
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
  'Content-Security-Policy': [
    "default-src 'self'",
    "base-uri 'self'",
    "object-src 'none'",
    "frame-ancestors 'none'",
    "script-src 'self'",
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "font-src 'self' https://fonts.gstatic.com",
    "img-src 'self' data: https://images.unsplash.com",
    "connect-src 'self'",
    "form-action 'self'"
  ].join('; ')
};

function sendJson(res, status, body) {
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    ...securityHeaders
  });
  res.end(JSON.stringify(body));
}

function getClientIp(req) {
  if (trustProxy) return String(req.headers['x-forwarded-for'] || req.socket.remoteAddress || 'unknown').split(',')[0].trim();
  return req.socket.remoteAddress || 'unknown';
}

function issueCsrfToken() {
  pruneCsrfTokens();
  while (csrfTokens.size >= MAX_CSRF_TOKENS) {
    const oldestToken = csrfTokens.keys().next().value;
    if (oldestToken === undefined) break;
    csrfTokens.delete(oldestToken);
  }
  const token = randomUUID();
  csrfTokens.set(token, Date.now() + CSRF_TOKEN_TTL_MS);
  return token;
}

function pruneCsrfTokens() {
  const now = Date.now();
  for (const [token, expiresAt] of csrfTokens) {
    if (expiresAt <= now) csrfTokens.delete(token);
  }
}

let securityAuditQueue = Promise.resolve();

async function rotateSecurityAudit() {
  try {
    const current = await stat(SECURITY_AUDIT_FILE);
    if (current.size >= SECURITY_AUDIT_MAX_BYTES) {
      const rotated = path.join(DATA_DIR, `security-audit-${new Date().toISOString().replace(/[:.]/g, '-')}.jsonl`);
      await rename(SECURITY_AUDIT_FILE, rotated);
    }
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }

  const now = Date.now();
  const files = await readdir(DATA_DIR);
  await Promise.all(files
    .filter(file => /^security-audit-.*\.jsonl$/.test(file))
    .map(async file => {
      const fullPath = path.join(DATA_DIR, file);
      const fileStat = await stat(fullPath);
      if (now - fileStat.mtimeMs > SECURITY_AUDIT_RETENTION_MS) await unlink(fullPath);
    }));
}

function logSecurityEvent(req, reason, details = {}) {
  const ip = getClientIp(req);
  const event = {
    timestamp: new Date().toISOString(),
    reason,
    ip: cleanText(ip, 80),
    userAgent: cleanText(req.headers['user-agent'] || '', 200),
    path: cleanText(req.url || '', 200),
    ...details
  };
  securityAuditQueue = securityAuditQueue
    .catch(() => {})
    .then(async () => {
      await mkdir(DATA_DIR, { recursive: true });
      await rotateSecurityAudit();
      await appendFile(SECURITY_AUDIT_FILE, `${JSON.stringify(event)}\n`, 'utf8');
    });
  return securityAuditQueue.catch(error => console.error('Security audit write failed:', error.message));
}

async function readJson(req) {
  let raw = '';
  for await (const chunk of req) {
    raw += chunk;
    if (Buffer.byteLength(raw, 'utf8') > MAX_BODY) {
      const error = new Error('Завеликий запит.');
      error.status = 413;
      throw error;
    }
  }
  try {
    return JSON.parse(raw || '{}');
  } catch {
    const error = new Error('Некоректний формат даних.');
    error.status = 400;
    throw error;
  }
}

function cleanText(value, max = 500) {
  if (typeof value !== 'string') return '';
  return value.trim().replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '').slice(0, max);
}

function isValidPhone(value) {
  const digits = value.replace(/\D/g, '');
  return digits.length >= 7 && digits.length <= 15;
}

function makeLeadMessage(data) {
  const extras = Array.isArray(data.extras)
    ? data.extras.slice(0, 20).map(item => cleanText(item, 80)).filter(Boolean).join(', ')
    : cleanText(data.extras, 500);
  const guestsValue = data.guests === undefined || data.guests === null || data.guests === ''
    ? ''
    : (Number.isFinite(Number(data.guests)) ? String(Math.max(0, Math.min(1000, Number(data.guests)))) : '');
  const receivedAt = new Intl.DateTimeFormat('uk-UA', {
    dateStyle: 'medium', timeStyle: 'short', timeZone: 'Europe/Kyiv'
  }).format(new Date());

  // Keep every field in the agreed template, even for short callback requests.
  // Missing values remain blank so managers can distinguish unknown data from assumptions.
  const lines = [
    '🔔 НОВА ЗАЯВКА З САЙТУ MOOD',
    `Тип звернення: ${cleanText(data.source, 80)}`,
    '',
    `Ім’я: ${cleanText(data.name, 80)}`,
    `Телефон: ${cleanText(data.phone, 25)}`,
    `Подія: ${cleanText(data.eventFormat || data.event, 100)}`,
    `Дата: ${cleanText(data.eventDate || data.date, 30)}`,
    `Кількість гостей: ${guestsValue}`,
    '',
    `Меню: ${cleanText(data.menu, 120)}`,
    '',
    `Додаткові побажання: ${extras}`,
    `Коментар: ${cleanText(data.comment, 1000)}`,
    '',
    `Час отримання: ${receivedAt}`,
    'Джерело: сайт ресторану MOOD'
  ];
  return lines.join('\n').slice(0, 4000);
}

const STATUS_LABELS = {
  new: '🆕 Нова заявка',
  in_progress: '🟡 У роботі',
  confirmed: '✅ Підтверджена',
  rejected: '❌ Відхилена'
};

const CALL_RESULT_LABELS = {
  dialed: '✅ Дзвінок здійснено (підтверджено менеджером)',
  no_answer: '📵 Не відповів',
  callback_later: '🔁 Потрібно передзвонити пізніше'
};

function managerName(user) {
  const registered = registeredManagers.get(String(user?.id || ''));
  if (registered?.displayName) return registered.displayName;
  const fullName = [user?.first_name, user?.last_name].filter(Boolean).join(' ').trim();
  return user?.username ? `${fullName || 'Менеджер'} (@${user.username})` : (fullName || `Менеджер ${user?.id || ''}`.trim());
}

function isManagerMemberStatus(member) {
  return ['creator', 'administrator', 'member'].includes(member?.status) || (member?.status === 'restricted' && member?.is_member === true);
}

async function checkManagerGroupMembership(userId) {
  if (!botToken || !configuredGroupChatId) return false;
  try {
    const member = await telegramApi('getChatMember', { chat_id: configuredGroupChatId, user_id: Number(userId) });
    return isManagerMemberStatus(member);
  } catch (error) {
    console.error('Could not verify manager group membership:', error.message);
    return false;
  }
}

async function sendTelegramMessage(chatId, text, extra = {}) {
  return telegramApi('sendMessage', { chat_id: chatId, text, ...extra });
}

function managerRegistrationUrl() {
  return `https://t.me/${botUsername}?start=manager_register`;
}

async function sendManagerRegistrationLink(chatId, text = 'Щоб отримати доступ до керування заявками, кожен менеджер має пройти коротку реєстрацію в особистому чаті з ботом.') {
  return sendTelegramMessage(chatId, text, {
    reply_markup: { inline_keyboard: [[{ text: '📝 Зареєструватися в боті', url: managerRegistrationUrl() }]] }
  });
}

async function beginManagerRegistration(message, allowUpdate = false) {
  const user = message.from;
  const userId = String(user?.id || '');
  const chatId = message.chat.id;
  if (!userId || message.chat.type !== 'private') return;
  if (!configuredGroupChatId) {
    return sendTelegramMessage(chatId, 'Реєстрація менеджерів ще не налаштована. Повідомте адміністратора MOOD.');
  }
  if (registeredManagers.has(userId) && !allowUpdate) {
    const manager = registeredManagers.get(userId);
    return sendTelegramMessage(chatId, `Ви вже зареєстровані в MOOD.\nІм’я: ${manager.displayName}\nТелефон: ${manager.phone}\n\nЩоб оновити реєстрацію, надішліть /register. Щоб видалити свої реєстраційні дані, надішліть /delete_my_data.`);
  }
  const isMember = await checkManagerGroupMembership(userId);
  if (!isMember) {
    return sendTelegramMessage(chatId, 'Реєстрація доступна лише учасникам групи «MOOD — Банкетні заявки». Спочатку приєднайтеся до групи, а потім поверніться сюди та надішліть /register.');
  }
  const consentText = [
    'РЕЄСТРАЦІЯ МЕНЕДЖЕРА MOOD',
    '',
    'Для реєстрації бот збере:',
    '• ім’я та прізвище з вашого профілю Telegram;',
    '• номер телефону, який ви самостійно надішлете кнопкою Telegram;',
    '• Telegram ID та username (якщо він є).',
    '',
    'Мета обробки: ідентифікація менеджера, призначення відповідального за заявку та облік дій із бенкетними заявками MOOD.',
    '',
    'Дані зберігатимуться у файлі data/managers.json на сервері MOOD і будуть доступні особам із доступом до серверної системи. Дані не використовуються для рекламних розсилок. Ви можете видалити реєстраційний профіль командою /delete_my_data; історія дій у заявках залишиться знеособленою для збереження аудиту.',
    '',
    'Натискаючи «Надаю згоду», ви підтверджуєте, що ознайомилися з цією інформацією та добровільно погоджуєтеся на зазначену обробку даних.'
  ].join('\n');
  await sendTelegramMessage(chatId, consentText, {
    reply_markup: { inline_keyboard: [[{ text: '✅ Надаю згоду', callback_data: 'managerconsent:accept' }]] }
  });
}

async function processManagerConsent(callback) {
  if (callback.message?.chat?.type !== 'private') return answerCallback(callback.id, 'Реєстрація доступна в особистому чаті з ботом.');
  const userId = String(callback.from?.id || '');
  const isMember = await checkManagerGroupMembership(userId);
  if (!isMember) return answerCallback(callback.id, 'Вас не знайдено серед учасників групи заявок MOOD.');
  registrationSessions.set(userId, { consentAt: new Date().toISOString(), state: 'awaiting_contact' });
  await answerCallback(callback.id, 'Згоду зафіксовано. Надішліть свій контакт.');
  await sendTelegramMessage(callback.message.chat.id, 'Тепер натисніть кнопку нижче, щоб поділитися власним номером телефону. Telegram передасть контакт безпосередньо боту.', {
    reply_markup: { keyboard: [[{ text: '📱 Надіслати мій номер телефону', request_contact: true }]], resize_keyboard: true, one_time_keyboard: true, input_field_placeholder: 'Поділіться власним контактом' }
  });
}

async function saveManagerContact(message) {
  const user = message.from;
  const userId = String(user?.id || '');
  const session = registrationSessions.get(userId);
  const contact = message.contact;
  if (!session || session.state !== 'awaiting_contact') {
    return sendTelegramMessage(message.chat.id, 'Спочатку розпочніть реєстрацію командою /register та надайте згоду на обробку даних.');
  }
  if (!contact || !contact.user_id || String(contact.user_id) !== userId) {
    return sendTelegramMessage(message.chat.id, 'Потрібно надіслати саме власний контакт через кнопку «Надіслати мій номер телефону». Контакт іншої людини не підходить.');
  }
  const isMember = await checkManagerGroupMembership(userId);
  if (!isMember) {
    registrationSessions.delete(userId);
    return sendTelegramMessage(message.chat.id, 'Не вдалося підтвердити ваше членство в групі MOOD. Реєстрацію зупинено.');
  }
  const firstName = cleanText(user.first_name || contact.first_name, 80);
  const lastName = cleanText(user.last_name || contact.last_name || '', 80);
  const displayName = [firstName, lastName].filter(Boolean).join(' ') || `Менеджер ${userId}`;
  const record = {
    telegramUserId: userId, firstName, lastName, displayName,
    username: cleanText(user.username || '', 80),
    phone: cleanText(contact.phone_number, 25),
    consentAt: session.consentAt, registeredAt: new Date().toISOString(),
    groupChatId: String(configuredGroupChatId)
  };
  registeredManagers.set(userId, record);
  registrationSessions.delete(userId);
  await persistManagers();
  await sendTelegramMessage(message.chat.id, `✅ Реєстрацію завершено.\n\nМенеджер: ${displayName}\nТелефон: ${record.phone}\n\nТепер ви можете керувати заявками в групі «MOOD — Банкетні заявки». Ваші дії фіксуватимуться за вашим Telegram-акаунтом.\n\nДля видалення реєстраційних даних надішліть /delete_my_data.`, { reply_markup: { remove_keyboard: true } });
  await sendTelegramMessage(configuredGroupChatId, `✅ Зареєстровано менеджера: ${displayName}${record.username ? ` (@${record.username})` : ''}.`);
}

async function handlePrivateBotMessage(message) {
  const text = String(message.text || '').trim();
  const command = text.match(/^\/([a-z_]+)(?:@\w+)?(?:\s+(.+))?$/i);
  if (message.contact) return saveManagerContact(message);
  if (!command) return;
  const name = command[1].toLowerCase();
  const userId = String(message.from?.id || '');
  if (name === 'start') return beginManagerRegistration(message, false);
  if (name === 'register') return beginManagerRegistration(message, true);
  if (name === 'delete_my_data') {
    const profile = registeredManagers.get(userId);
    if (registeredManagers.delete(userId)) {
      await persistManagers();
      registrationSessions.delete(userId);
      let historyChanged = false;
      for (const lead of leads.values()) {
        if (lead.workManagerId === userId || (profile?.displayName && lead.workBy === profile.displayName)) {
          lead.workBy = 'Менеджер (реєстраційні дані видалено)';
          delete lead.workManagerId;
          historyChanged = true;
        }
        if (lead.finalManagerId === userId || (profile?.displayName && lead.finalBy === profile.displayName)) {
          lead.finalBy = 'Менеджер (реєстраційні дані видалено)';
          delete lead.finalManagerId;
          historyChanged = true;
        }
        for (const call of lead.calls || []) {
          if (call.managerId === userId || (profile?.displayName && call.by === profile.displayName)) {
            call.by = 'Менеджер (реєстраційні дані видалено)';
            delete call.managerId;
            historyChanged = true;
          }
        }
        for (const event of lead.history || []) {
          if (event.managerId === userId) {
            event.by = 'Менеджер (реєстраційні дані видалено)';
            delete event.managerId;
            historyChanged = true;
          }
        }
      }
      if (historyChanged) await persistLeads();
      return sendTelegramMessage(message.chat.id, 'Ваш реєстраційний профіль видалено. Історія дій у заявках збережена у знеособленому вигляді для аудиту. Для повторної реєстрації надішліть /register.');
    }
    registrationSessions.delete(userId);
    return sendTelegramMessage(message.chat.id, 'Ваших реєстраційних даних менеджера не знайдено.');
  }
}

async function handleGroupBotMessage(message) {
  const text = String(message.text || '').trim();
  const command = text.match(/^\/([a-z_]+)(?:@\w+)?(?:\s+.*)?$/i);
  if (command && command[1].toLowerCase() === 'register' && String(message.chat.id) === String(configuredGroupChatId)) {
    return sendManagerRegistrationLink(message.chat.id);
  }
  const newMembers = Array.isArray(message.new_chat_members) ? message.new_chat_members.filter(member => !member.is_bot) : [];
  if (newMembers.length && String(message.chat.id) === String(configuredGroupChatId)) {
    return sendManagerRegistrationLink(message.chat.id, 'Вітаємо в групі MOOD! Щоб отримати доступ до керування бенкетними заявками, кожен менеджер має пройти особисту реєстрацію з підтвердженням номера телефону.');
  }
}

async function processTelegramMessage(message) {
  if (!message?.chat) return;
  if (message.chat.type === 'private') return handlePrivateBotMessage(message);
  if (message.chat.type === 'group' || message.chat.type === 'supergroup') return handleGroupBotMessage(message);
}

function formatKyivTime(value) {
  return new Intl.DateTimeFormat('uk-UA', {
    dateStyle: 'medium', timeStyle: 'short', timeZone: 'Europe/Kyiv'
  }).format(new Date(value));
}

const DETAIL_PAGE_SIZE = 10;

function getDetailPage(items, expanded, page) {
  const indexed = items.map((item, index) => ({ item, index }));
  if (!expanded) return indexed.slice(-2).reverse();
  const totalPages = Math.max(1, Math.ceil(indexed.length / DETAIL_PAGE_SIZE));
  const safePage = Math.max(0, Math.min(totalPages - 1, Number(page) || 0));
  const end = indexed.length - safePage * DETAIL_PAGE_SIZE;
  const begin = Math.max(0, end - DETAIL_PAGE_SIZE);
  return indexed.slice(begin, end).reverse();
}

function renderManagedLead(lead) {
  const details = [
    lead.baseMessage,
    '',
    `🆔 Номер заявки: ${lead.id}`,
    `📌 Статус заявки: ${STATUS_LABELS[lead.status] || STATUS_LABELS.new}`
  ];
  if (lead.workAt) details.push(`👤 Відповідальний: ${lead.workBy}`, `🕒 Взято в роботу: ${formatKyivTime(lead.workAt)}`);
  if (lead.pendingCall) details.push(`📤 Картку контакту надіслано: ${formatKyivTime(lead.pendingCall.startedAt)}`, `👤 Очікуємо результат від: ${lead.pendingCall.managerName}`);

  const calls = Array.isArray(lead.calls) ? lead.calls : [];
  if (calls.length && lead.showAllCalls) {
    const totalPages = Math.max(1, Math.ceil(calls.length / DETAIL_PAGE_SIZE));
    const page = lead.showAllCalls ? Math.max(0, Math.min(totalPages - 1, Number(lead.callsPage) || 0)) : 0;
    const visibleCalls = getDetailPage(calls, Boolean(lead.showAllCalls), page);
    details.push('', lead.showAllCalls
      ? `📞 Спроби зв’язку: ${calls.length} (сторінка ${page + 1}/${totalPages})`
      : `📞 Спроби зв’язку: ${calls.length} (останні 2)`);
    for (const { item: call, index } of visibleCalls) {
      details.push(`   ${index + 1}. ${formatKyivTime(call.at)} — ${CALL_RESULT_LABELS[call.result] || call.resultLabel || 'Результат зафіксовано'} — ${call.by || 'Менеджер'}`);
    }
  }
  if (lead.firstCallAt) details.push(`⏱ Перша спроба зв’язку: ${formatKyivTime(lead.firstCallAt)}`);
  if (lead.slaReminderSentAt) details.push(`⚠️ SLA-нагадування: ${formatKyivTime(lead.slaReminderSentAt)}`);
  if (lead.followUpAt && !lead.followUpReminderSentAt) details.push(`🔁 Наступне нагадування: ${formatKyivTime(lead.followUpAt)}`);
  if (lead.followUpReminderSentAt) details.push(`🔔 Нагадування про повторний дзвінок: ${formatKyivTime(lead.followUpReminderSentAt)}`);
  if (lead.status === 'confirmed' || lead.status === 'rejected') {
    details.push(`✍️ Рішення: ${lead.finalBy}`, `🕒 Час рішення: ${formatKyivTime(lead.finalAt)}`);
  }

  const history = Array.isArray(lead.history) ? lead.history : [];
  if (history.length && lead.showAllHistory) {
    const totalPages = Math.max(1, Math.ceil(history.length / DETAIL_PAGE_SIZE));
    const page = lead.showAllHistory ? Math.max(0, Math.min(totalPages - 1, Number(lead.historyPage) || 0)) : 0;
    const visibleHistory = getDetailPage(history, Boolean(lead.showAllHistory), page);
    details.push('', lead.showAllHistory
      ? `🗂 Історія дій: ${history.length} (сторінка ${page + 1}/${totalPages})`
      : `🗂 Історія дій: ${history.length} (останні 2)`);
    for (const { item: event } of visibleHistory) {
      details.push(`• ${formatKyivTime(event.at)} — ${event.label}${event.by ? ` (${event.by})` : ''}`);
    }
  }
  return details.join('\n').slice(0, 3900);
}

function appendDetailControls(rows, lead, type, items, expanded, page) {
  if (!items.length) return;
  const isCalls = type === 'calls';
  const title = isCalls ? 'спроби зв’язку' : 'історію дій';
  const toggleAction = isCalls ? 'toggle_calls' : 'toggle_history';
  const pageAction = isCalls ? 'calls_page' : 'history_page';
  if (!expanded) {
    rows.push([{ text: `${isCalls ? '📞 Відобразити всі спроби зв’язку' : '🗂 Відобразити всю історію дій'} (${items.length})`, callback_data: `moodlead:${lead.id}:${toggleAction}` }]);
    return;
  }
  const totalPages = Math.max(1, Math.ceil(items.length / DETAIL_PAGE_SIZE));
  const safePage = Math.max(0, Math.min(totalPages - 1, Number(page) || 0));
  const navigation = [];
  if (safePage < totalPages - 1) navigation.push({ text: '⬅️ Старіші', callback_data: `moodlead:${lead.id}:${pageAction}:${safePage + 1}` });
  if (safePage > 0) navigation.push({ text: 'Новіші ➡️', callback_data: `moodlead:${lead.id}:${pageAction}:${safePage - 1}` });
  if (navigation.length) rows.push(navigation);
  rows.push([{ text: `Згорнути ${title}`, callback_data: `moodlead:${lead.id}:${toggleAction}` }]);
}

function leadKeyboard(lead) {
  const rows = [];
  if (lead.status === 'new') {
    rows.push([{ text: '🟡 Взяти в роботу', callback_data: `moodlead:${lead.id}:work` }]);
  } else if (lead.status === 'in_progress' && !lead.pendingCall) {
    rows.push([{ text: '📞 Зателефонувати гостю', callback_data: `moodlead:${lead.id}:call` }]);
    if ((lead.calls?.length || 0) > 0) {
      rows.push([
        { text: '✅ Підтверджена', callback_data: `moodlead:${lead.id}:confirmed` },
        { text: '❌ Відхилена', callback_data: `moodlead:${lead.id}:rejected` }
      ]);
    }
  }
  const calls = Array.isArray(lead.calls) ? lead.calls : [];
  const history = Array.isArray(lead.history) ? lead.history : [];
  appendDetailControls(rows, lead, 'calls', calls, Boolean(lead.showAllCalls), lead.callsPage);
  appendDetailControls(rows, lead, 'history', history, Boolean(lead.showAllHistory), lead.historyPage);
  return { inline_keyboard: rows };
}

function callResultKeyboard(lead) {
  return {
    inline_keyboard: [
      [{ text: '💬 Відкрити контакт у Telegram', url: `https://t.me/+${String(lead.phone || '').replace(/^\+/, '')}` }],
      [{ text: '✅ Дзвінок здійснено', callback_data: `moodlead:${lead.id}:callresult:dialed` }],
      [{ text: '📵 Не відповів', callback_data: `moodlead:${lead.id}:callresult:no_answer` }],
      [{ text: '🔁 Передзвонити пізніше', callback_data: `moodlead:${lead.id}:callresult:callback_later` }]
    ]
  };
}

function pushLeadHistory(lead, event) {
  lead.history = Array.isArray(lead.history) ? lead.history : [];
  lead.history.push(event);
  if (lead.history.length > 100) lead.history = lead.history.slice(-100);
}

function getContactName(lead) {
  const fullName = cleanText(lead.contactName || lead.name || 'Гість MOOD', 120);
  const parts = fullName.split(/\s+/).filter(Boolean);
  return { firstName: cleanText(parts.shift() || 'Гість', 64), lastName: cleanText(parts.join(' '), 64) };
}

async function sendLeadContact(lead) {
  if (!lead.groupChatId || !lead.groupMessageId) throw new Error('Не знайдено групове повідомлення заявки.');
  if (!lead.phone || !isValidPhone(lead.phone)) throw new Error('У заявці немає коректного номера телефону.');
  const { firstName, lastName } = getContactName(lead);
  const previousContactMessageId = Number(lead.lastContactMessageId || 0) || null;
  const payload = {
    chat_id: lead.groupChatId,
    phone_number: lead.phone,
    first_name: firstName,
    reply_parameters: { message_id: lead.groupMessageId, allow_sending_without_reply: true },
    reply_markup: callResultKeyboard(lead)
  };
  if (lastName) payload.last_name = lastName;
  // Send the replacement first. If Telegram accepts it, remove the previous
  // contact card so only one guest contact remains visible per lead.
  const sent = await telegramApi('sendContact', payload);
  const sentAt = new Date().toISOString();
  lead.lastContactMessageId = sent.message_id;
  lead.followUpAt = null;
  lead.followUpReminderSentAt = null;
  lead.pendingCall = {
    contactMessageId: sent.message_id,
    startedAt: sentAt,
    managerId: lead.workManagerId,
    managerName: lead.workBy
  };
  pushLeadHistory(lead, { at: sentAt, type: 'contact_sent', label: 'Менеджеру надіслано актуальну картку контакту гостя', by: lead.workBy, managerId: lead.workManagerId });
  await persistLeads();
  if (previousContactMessageId && previousContactMessageId !== sent.message_id) {
    try {
      await telegramApi('deleteMessage', { chat_id: lead.groupChatId, message_id: previousContactMessageId });
      pushLeadHistory(lead, { at: new Date().toISOString(), type: 'old_contact_removed', label: 'Попередню картку контакту замінено новою', by: 'Бот MOOD' });
      await persistLeads();
    } catch (error) {
      console.error(`Could not delete previous contact card for ${lead.id}:`, error.message);
      try {
        await telegramApi('editMessageReplyMarkup', { chat_id: lead.groupChatId, message_id: previousContactMessageId, reply_markup: { inline_keyboard: [] } });
      } catch (cleanupError) {
        console.error(`Could not disable previous contact card controls for ${lead.id}:`, cleanupError.message);
      }
    }
  }
  await updateManagedMessage(lead);
  return sent;
}

async function saveJson(file, value) {
  await mkdir(DATA_DIR, { recursive: true });
  const temporary = `${file}.${process.pid}.${randomUUID()}.tmp`;
  try {
    const serialized = JSON.stringify(value, null, 2);
    let contents = serialized;
    if (storageEncryptionKey) {
      const iv = randomBytes(12);
      const cipher = createCipheriv('aes-256-gcm', storageEncryptionKey, iv);
      const encrypted = Buffer.concat([cipher.update(serialized, 'utf8'), cipher.final()]);
      contents = [
        STORAGE_ENCRYPTION_PREFIX,
        iv.toString('base64'),
        '|',
        cipher.getAuthTag().toString('base64'),
        '|',
        encrypted.toString('base64')
      ].join('');
    }
    await writeFile(temporary, contents, 'utf8');
    await renameWithRetry(temporary, file);
  } finally {
    await unlink(temporary).catch(() => {});
  }
}

async function renameWithRetry(source, target, attempts = 5) {
  let lastError;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      await rename(source, target);
      return;
    } catch (error) {
      lastError = error;
      if (!['EPERM', 'EBUSY', 'EACCES'].includes(error.code) || attempt === attempts - 1) throw error;
      await new Promise(resolve => setTimeout(resolve, 100 * (attempt + 1)));
    }
  }
  throw lastError;
}

async function readStorageJson(file) {
  const raw = await readFile(file, 'utf8');
  if (!raw.startsWith(STORAGE_ENCRYPTION_PREFIX)) {
    return { value: JSON.parse(raw), legacy: true };
  }
  if (!storageEncryptionKey) throw new Error('Encrypted storage requires MOOD_DATA_ENCRYPTION_KEY.');

  const encoded = raw.slice(STORAGE_ENCRYPTION_PREFIX.length);
  const separator = encoded.indexOf('|');
  const secondSeparator = encoded.indexOf('|', separator + 1);
  if (separator < 1 || secondSeparator < separator + 2) throw new Error('Invalid encrypted storage format.');

  const iv = Buffer.from(encoded.slice(0, separator), 'base64');
  const authTag = Buffer.from(encoded.slice(separator + 1, secondSeparator), 'base64');
  const encrypted = Buffer.from(encoded.slice(secondSeparator + 1), 'base64');
  if (iv.length !== 12 || authTag.length !== 16 || encrypted.length === 0) {
    throw new Error('Invalid encrypted storage payload.');
  }

  const decipher = createDecipheriv('aes-256-gcm', storageEncryptionKey, iv);
  decipher.setAuthTag(authTag);
  const plaintext = Buffer.concat([decipher.update(encrypted), decipher.final()]).toString('utf8');
  return { value: JSON.parse(plaintext), legacy: false };
}

function persistLeads() {
  const snapshot = Object.fromEntries(leads.entries());
  persistQueue = persistQueue.catch(() => {}).then(() => saveJson(LEADS_FILE, snapshot));
  return persistQueue;
}

async function persistBotState() {
  await saveJson(BOT_STATE_FILE, { updateOffset });
}

async function persistManagers() {
  await saveJson(MANAGERS_FILE, Object.fromEntries(registeredManagers.entries()));
}

async function telegramApi(method, payload, timeout = 15000) {
  const response = await fetch(`${TELEGRAM_API_BASE_URL}/bot${botToken}/${method}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(timeout)
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok || !result.ok) throw new Error(result.description || `Telegram HTTP ${response.status}`);
  return result.result;
}

async function answerCallback(callbackId, text) {
  try { await telegramApi('answerCallbackQuery', { callback_query_id: callbackId, text, show_alert: false }); }
  catch (error) { console.error('Telegram callback answer failed:', error.message); }
}

async function updateManagedMessage(lead) {
  if (!lead.groupChatId || !lead.groupMessageId) return;
  const payload = {
    chat_id: lead.groupChatId,
    message_id: lead.groupMessageId,
    text: renderManagedLead(lead),
    reply_markup: leadKeyboard(lead) || { inline_keyboard: [] }
  };
  await telegramApi('editMessageText', payload);
}

async function processLeadCallback(callback) {
  const parts = String(callback.data || '').split(':');
  const [prefix, leadId, action, resultCode] = parts;
  if (prefix !== 'moodlead' || !leadId || !action) return answerCallback(callback.id, 'Невідома дія.');
  const lead = leads.get(leadId);
  if (!lead) return answerCallback(callback.id, 'Заявку не знайдено в історії сервера.');

  const callbackChatId = String(callback.message?.chat?.id || '');
  if (!lead.groupChatId || callbackChatId !== String(lead.groupChatId)) {
    return answerCallback(callback.id, 'Ця дія доступна лише в групі заявок MOOD.');
  }

  const actorId = String(callback.from?.id || '');
  const registered = registeredManagers.get(actorId);
  if (!registered) return answerCallback(callback.id, 'Спочатку пройдіть реєстрацію менеджера через бота: /register.');
  if (managerIds.size && !managerIds.has(actorId)) return answerCallback(callback.id, 'Ваш Telegram ID не входить до списку дозволених менеджерів. Зверніться до адміністратора MOOD.');
  const isStillGroupMember = await checkManagerGroupMembership(actorId);
  if (!isStillGroupMember) return answerCallback(callback.id, 'Ви більше не є учасником групи заявок MOOD. Доступ до керування закрито.');
  const actor = registered.displayName || managerName(callback.from);
  const now = new Date().toISOString();

  if (action === 'pending') return answerCallback(callback.id, 'Очікуємо, поки відповідальний менеджер зафіксує результат дзвінка.');

  if (action === 'callresult') {
    if (!lead.pendingCall || Number(callback.message?.message_id) !== Number(lead.pendingCall.contactMessageId)) {
      return answerCallback(callback.id, 'Ця картка контакту вже опрацьована або застаріла.');
    }
    if (String(lead.pendingCall.managerId) !== actorId) {
      return answerCallback(callback.id, `Заявку опрацьовує ${lead.pendingCall.managerName}. Результат може зафіксувати відповідальний менеджер.`);
    }
    if (!['dialed', 'no_answer', 'callback_later'].includes(resultCode)) return answerCallback(callback.id, 'Невідомий результат дзвінка.');
    lead.calls = Array.isArray(lead.calls) ? lead.calls : [];
    const callRecord = {
      at: now,
      contactSentAt: lead.pendingCall.startedAt,
      contactMessageId: lead.pendingCall.contactMessageId,
      result: resultCode,
      resultLabel: CALL_RESULT_LABELS[resultCode],
      by: actor,
      managerId: actorId
    };
    lead.calls.push(callRecord);
    lead.lastContactMessageId = lead.pendingCall.contactMessageId || lead.lastContactMessageId || null;
    if (!lead.firstCallAt) lead.firstCallAt = now;
    lead.pendingCall = null;
    if (resultCode === 'no_answer' || resultCode === 'callback_later') {
      lead.followUpAt = new Date(Date.now() + CALLBACK_REMINDER_MINUTES * 60 * 1000).toISOString();
      lead.followUpReminderSentAt = null;
    } else {
      lead.followUpAt = null;
      lead.followUpReminderSentAt = null;
    }
    pushLeadHistory(lead, { at: now, type: 'call_result', label: CALL_RESULT_LABELS[resultCode], by: actor, managerId: actorId });
    await persistLeads();
    try {
      await telegramApi('editMessageReplyMarkup', {
        chat_id: lead.groupChatId,
        message_id: callback.message.message_id,
        reply_markup: { inline_keyboard: [] }
      });
    } catch (error) {
      console.error(`Could not clear contact card buttons for ${lead.id}:`, error.message);
    }
    try {
      await updateManagedMessage(lead);
      let response = resultCode === 'dialed'
        ? 'Дзвінок зафіксовано. Менеджер підтвердив, що здійснив дзвінок.'
        : resultCode === 'no_answer'
          ? `Зафіксовано «Не відповів». Нагадування про повторний дзвінок — через ${CALLBACK_REMINDER_MINUTES} хв.`
          : `Повторний дзвінок заплановано через ${CALLBACK_REMINDER_MINUTES} хв.`;
      await answerCallback(callback.id, response);
    } catch (error) {
      console.error(`Не вдалося оновити повідомлення заявки ${lead.id}:`, error.message);
      await answerCallback(callback.id, 'Результат збережено, але картку заявки не вдалося оновити.');
    }
    return;
  }

  if (Number(callback.message?.message_id) !== Number(lead.groupMessageId)) {
    return answerCallback(callback.id, 'Використовуйте актуальні кнопки в основній картці заявки.');
  }

  if (action === 'toggle_calls') {
    lead.showAllCalls = !lead.showAllCalls;
    lead.callsPage = 0;
    await persistLeads();
    try { await updateManagedMessage(lead); await answerCallback(callback.id, lead.showAllCalls ? 'Показано всі спроби зв’язку.' : 'Показано дві останні спроби зв’язку.'); }
    catch (error) { console.error(error.message); await answerCallback(callback.id, 'Не вдалося оновити список спроб.'); }
    return;
  }

  if (action === 'toggle_history') {
    lead.showAllHistory = !lead.showAllHistory;
    lead.historyPage = 0;
    await persistLeads();
    try { await updateManagedMessage(lead); await answerCallback(callback.id, lead.showAllHistory ? 'Показано історію дій. Для перегляду старіших записів використовуйте навігацію.' : 'Показано дві останні дії.'); }
    catch (error) { console.error(error.message); await answerCallback(callback.id, 'Не вдалося оновити історію дій.'); }
    return;
  }

  if (action === 'calls_page' || action === 'history_page') {
    const isCalls = action === 'calls_page';
    const items = isCalls ? (lead.calls || []) : (lead.history || []);
    const maxPage = Math.max(0, Math.ceil(items.length / DETAIL_PAGE_SIZE) - 1);
    const requestedPage = Number(resultCode);
    if (!Number.isInteger(requestedPage) || requestedPage < 0 || requestedPage > maxPage) {
      return answerCallback(callback.id, 'Ця сторінка вже недоступна. Оновіть картку заявки.');
    }
    if (isCalls) { lead.showAllCalls = true; lead.callsPage = requestedPage; }
    else { lead.showAllHistory = true; lead.historyPage = requestedPage; }
    await persistLeads();
    try { await updateManagedMessage(lead); await answerCallback(callback.id, `Відкрито сторінку ${requestedPage + 1} з ${maxPage + 1}.`); }
    catch (error) { console.error(error.message); await answerCallback(callback.id, 'Не вдалося відкрити сторінку.'); }
    return;
  }

  if (action === 'work') {
    if (lead.status !== 'new') return answerCallback(callback.id, lead.workBy ? `Заявку вже взяв(ла) в роботу ${lead.workBy}.` : 'Заявка вже опрацьовується або закрита.');
    lead.status = 'in_progress';
    lead.workAt = now;
    lead.workBy = actor;
    lead.workManagerId = actorId;
    pushLeadHistory(lead, { at: now, type: 'work', label: 'Заявку взято в роботу', by: actor, managerId: actorId });
    await persistLeads();
    try { await updateManagedMessage(lead); await answerCallback(callback.id, 'Заявку закріплено за вами. Тепер натисніть «Зателефонувати гостю».'); }
    catch (error) { console.error(error.message); await answerCallback(callback.id, 'Заявку взято в роботу, але не вдалося оновити картку.'); }
    return;
  }

  if (String(lead.workManagerId || '') !== actorId) {
    return answerCallback(callback.id, `Цю заявку веде ${lead.workBy || 'інший менеджер'}. Змінювати її може лише відповідальний менеджер.`);
  }

  if (action === 'call') {
    if (lead.status !== 'in_progress') return answerCallback(callback.id, 'Спочатку візьміть заявку в роботу.');
    if (lead.pendingCall) return answerCallback(callback.id, 'Картку контакту вже надіслано. Спочатку зафіксуйте результат цієї спроби.');
    try {
      await sendLeadContact(lead);
      await answerCallback(callback.id, 'Картку контакту гостя надіслано в групу. Після дзвінка зафіксуйте результат під карткою контакту.');
    } catch (error) {
      console.error(`Не вдалося надіслати контакт гостя для ${lead.id}:`, error.message);
      await answerCallback(callback.id, `Не вдалося надіслати контакт: ${error.message}`);
    }
    return;
  }

  if (action === 'confirmed' || action === 'rejected') {
    if (lead.status !== 'in_progress') return answerCallback(callback.id, 'Заявка вже має фінальний статус.');
    if (lead.pendingCall) return answerCallback(callback.id, 'Спочатку зафіксуйте результат поточного дзвінка.');
    if (!lead.calls?.length) return answerCallback(callback.id, 'Спочатку зафіксуйте хоча б одну спробу зв’язку.');
    lead.status = action;
    lead.finalAt = now;
    lead.finalBy = actor;
    lead.finalManagerId = actorId;
    lead.followUpAt = null;
    lead.followUpReminderSentAt = null;
    pushLeadHistory(lead, { at: now, type: 'final', label: action === 'confirmed' ? 'Заявку підтверджено' : 'Заявку відхилено', by: actor, managerId: actorId });
    await persistLeads();
    if (lead.lastContactMessageId) {
      try {
        await telegramApi('deleteMessage', { chat_id: lead.groupChatId, message_id: lead.lastContactMessageId });
        lead.lastContactMessageId = null;
        await persistLeads();
      } catch (error) {
        console.error(`Could not delete final contact card for ${lead.id}:`, error.message);
      }
    }
    try { await updateManagedMessage(lead); await answerCallback(callback.id, action === 'confirmed' ? 'Заявку підтверджено. Картку контакту видалено.' : 'Заявку відхилено. Картку контакту видалено.'); }
    catch (error) { console.error(error.message); await answerCallback(callback.id, 'Статус збережено, але картку не вдалося оновити.'); }
    return;
  }

  await answerCallback(callback.id, 'Невідома дія.');
}

async function runLeadReminders() {
  if (!configuredGroupChatId || !botToken) return;
  const now = Date.now();
  for (const lead of leads.values()) {
    if (lead.status === 'confirmed' || lead.status === 'rejected') continue;
    const createdAtMs = Date.parse(lead.createdAt || '');
    if (!lead.firstCallAt && !lead.slaReminderSentAt && Number.isFinite(createdAtMs) && now >= createdAtMs + SLA_MINUTES * 60 * 1000) {
      const assigned = lead.workBy ? `\nВідповідальний: ${lead.workBy}` : '\nВідповідального ще не призначено.';
      const text = `⏰ НАГАДУВАННЯ MOOD — SLA ${SLA_MINUTES} ХВ\n\nДля заявки ${lead.id} ще не зафіксовано першої спроби дзвінка.${assigned}\n\nБудь ласка, опрацюйте заявку якнайшвидше.`;
      try {
        await sendTelegramMessage(lead.groupChatId || configuredGroupChatId, text, lead.groupMessageId ? { reply_parameters: { message_id: lead.groupMessageId, allow_sending_without_reply: true } } : {});
        lead.slaReminderSentAt = new Date().toISOString();
        pushLeadHistory(lead, { at: lead.slaReminderSentAt, type: 'sla_reminder', label: `Надіслано SLA-нагадування через ${SLA_MINUTES} хв`, by: 'Бот MOOD' });
        await persistLeads();
      } catch (error) {
        console.error(`SLA reminder failed for ${lead.id}:`, error.message);
      }
    }

    const followUpAtMs = Date.parse(lead.followUpAt || '');
    if (lead.status === 'in_progress' && lead.followUpAt && !lead.followUpReminderSentAt && Number.isFinite(followUpAtMs) && now >= followUpAtMs) {
      const reminderAt = new Date().toISOString();
      const text = `🔁 ЧАС ПОВТОРНОГО ДЗВІНКА MOOD\n\nЗаявка: ${lead.id}\nГість: ${lead.name || 'Не вказано'}\nТелефон: ${lead.phone || 'Не вказано'}\nВідповідальний: ${lead.workBy || 'Не призначено'}\n\nПотрібно повторно зв’язатися з гостем. Відкрийте картку заявки в групі «MOOD — Банкетні заявки».`;
      try {
        if (lead.workManagerId) {
          try { await sendTelegramMessage(lead.workManagerId, text); }
          catch (dmError) { console.error(`Private follow-up reminder failed for ${lead.id}:`, dmError.message); }
        }
        await sendTelegramMessage(lead.groupChatId || configuredGroupChatId, text, lead.groupMessageId ? { reply_parameters: { message_id: lead.groupMessageId, allow_sending_without_reply: true } } : {});
        lead.followUpReminderSentAt = reminderAt;
        pushLeadHistory(lead, { at: reminderAt, type: 'follow_up_reminder', label: 'Надіслано нагадування про повторний дзвінок', by: 'Бот MOOD' });
        await persistLeads();
      } catch (error) {
        console.error(`Follow-up reminder failed for ${lead.id}:`, error.message);
      }
    }
  }
}

function startLeadReminderScheduler() {
  if (reminderInterval || !configuredGroupChatId || !botToken) return;
  reminderInterval = setInterval(async () => {
    if (reminderRunActive) return;
    reminderRunActive = true;
    try { await runLeadReminders(); }
    catch (error) { console.error('Lead reminder scheduler failed:', error.message); }
    finally { reminderRunActive = false; }
  }, 15000);
  reminderInterval.unref?.();
  console.log(`MOOD lead reminders started (first-call SLA ${SLA_MINUTES} min; callback reminder ${CALLBACK_REMINDER_MINUTES} min).`);
}

async function pollTelegramCallbacks() {
  if (!botToken || !configuredGroupChatId || pollingStopped) return;
  console.log('Telegram lead controls: polling started.');
  while (!pollingStopped) {
    try {
      pollingController = new AbortController();
      const query = new URLSearchParams({ timeout: '25', allowed_updates: JSON.stringify(['message', 'callback_query']) });
      if (updateOffset) query.set('offset', String(updateOffset));
      const response = await fetch(`${TELEGRAM_API_BASE_URL}/bot${botToken}/getUpdates?${query}`, {
        signal: AbortSignal.any([pollingController.signal, AbortSignal.timeout(35000)])
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok || !result.ok) {
        const description = result.description || `HTTP ${response.status}`;
        console.error('Telegram polling error:', description);
        if (response.status === 409 || /webhook/i.test(description)) {
          console.error('Telegram callback polling stopped. Remove the webhook or ensure only one bot polling process is running.');
          pollingStopped = true;
          break;
        }
        await new Promise(resolve => setTimeout(resolve, 3000));
        continue;
      }
      for (const update of result.result || []) {
        updateOffset = Math.max(updateOffset, Number(update.update_id) + 1);
        if (update.callback_query) {
          try {
            if (String(update.callback_query.data || '') === 'managerconsent:accept') await processManagerConsent(update.callback_query);
            else await processLeadCallback(update.callback_query);
          } catch (error) { console.error('Telegram callback processing failed:', error.message); }
        }
        if (update.message) {
          try { await processTelegramMessage(update.message); }
          catch (error) { console.error('Telegram message processing failed:', error.message); }
        }
        await persistBotState();
      }
    } catch (error) {
      if (pollingStopped || error.name === 'AbortError') break;
      console.error('Telegram polling request failed:', error.message);
      await new Promise(resolve => setTimeout(resolve, 2500));
    } finally {
      pollingController = null;
    }
  }
  console.log('Telegram lead controls: polling stopped.');
}

async function initializeTelegramStorage() {
  await mkdir(DATA_DIR, { recursive: true });
  await cleanupStorageTempFiles();
  try {
    const storedLeads = await readStorageJson(LEADS_FILE);
    const savedLeads = storedLeads.value;
    for (const [id, lead] of Object.entries(savedLeads || {})) leads.set(id, lead);
    if (storedLeads.legacy && storageEncryptionKey) await saveJson(LEADS_FILE, savedLeads);
  } catch (error) {
    if (error.code !== 'ENOENT') {
      console.error('Could not load saved leads:', error.message);
      await quarantineCorruptFile(LEADS_FILE);
    }
  }
  try {
    const storedManagers = await readStorageJson(MANAGERS_FILE);
    const savedManagers = storedManagers.value;
    for (const [id, manager] of Object.entries(savedManagers || {})) registeredManagers.set(id, manager);
    if (storedManagers.legacy && storageEncryptionKey) await saveJson(MANAGERS_FILE, savedManagers);
  } catch (error) {
    if (error.code !== 'ENOENT') {
      console.error('Could not load registered managers:', error.message);
      await quarantineCorruptFile(MANAGERS_FILE);
    }
  }
  try {
    const storedState = await readStorageJson(BOT_STATE_FILE);
    const state = storedState.value;
    updateOffset = Number(state.updateOffset) || 0;
    if (storedState.legacy && storageEncryptionKey) await saveJson(BOT_STATE_FILE, state);
  } catch (error) {
    if (error.code !== 'ENOENT') {
      console.error('Could not load Telegram polling state:', error.message);
      await quarantineCorruptFile(BOT_STATE_FILE);
    }
  }
  await cleanupFinalizedLeadContacts();
}

async function cleanupFinalizedLeadContacts() {
  if (!botToken) return;
  let changed = false;
  for (const lead of leads.values()) {
    if (!['confirmed', 'rejected'].includes(lead.status) || !lead.lastContactMessageId) continue;
    try {
      await telegramApi('deleteMessage', {
        chat_id: lead.groupChatId || configuredGroupChatId,
        message_id: lead.lastContactMessageId
      });
      lead.lastContactMessageId = null;
      changed = true;
      console.log(`Removed stale contact card for finalized lead ${lead.id}.`);
    } catch (error) {
      console.error(`Could not remove stale contact card for ${lead.id}:`, error.message);
    }
  }
  if (changed) await persistLeads();
}

async function quarantineCorruptFile(file) {
  const quarantine = `${file}.corrupt-${new Date().toISOString().replace(/[:.]/g, '-')}-${randomUUID().slice(0, 8)}`;
  try {
    await rename(file, quarantine);
    console.error(`Corrupt storage moved to ${quarantine}`);
  } catch (quarantineError) {
    console.error(`Could not quarantine corrupt storage ${file}:`, quarantineError.message);
  }
}

async function cleanupStorageTempFiles() {
  const now = Date.now();
  const files = await readdir(DATA_DIR);
  await Promise.all(files
    .filter(file => /^(leads|managers|telegram-state)\.json\.\d+\.[0-9a-f-]+\.tmp$/i.test(file))
    .map(async file => {
      const fullPath = path.join(DATA_DIR, file);
      const fileStat = await stat(fullPath);
      if (now - fileStat.mtimeMs > STORAGE_TEMP_RETENTION_MS) await unlink(fullPath);
    }));
}

async function handleLead(req, res) {
  if (req.method !== 'POST') return sendJson(res, 405, { ok: false, message: 'Метод не підтримується.' });

  const requestOrigin = req.headers.origin;
  if (!requestOrigin) {
    await logSecurityEvent(req, 'csrf-origin-missing');
    return sendJson(res, 403, { ok: false, message: 'Потрібно підтвердити джерело запиту.' });
  }
  {
    const forwardedProto = String(req.headers['x-forwarded-proto'] || '').split(',')[0].trim();
    const protocol = forwardedProto || (req.socket.encrypted ? 'https' : 'http');
    const sameOrigin = configuredAppOrigin || `${protocol}://${req.headers.host}`;
    if (requestOrigin !== sameOrigin) {
      await logSecurityEvent(req, 'csrf-origin-rejected', { origin: cleanText(requestOrigin, 200) });
      return sendJson(res, 403, { ok: false, message: 'Недозволене джерело запиту.' });
    }
  }

  pruneCsrfTokens();
  const csrfToken = String(req.headers['x-csrf-token'] || '');
  if (!csrfToken || !csrfTokens.has(csrfToken)) {
    await logSecurityEvent(req, 'csrf-token-rejected');
    return sendJson(res, 403, { ok: false, message: 'Недійсний токен безпеки.' });
  }

  const personalChatId = setting('TELEGRAM_CHAT_ID');
  const groupChatId = configuredGroupChatId;
  const chatIds = [...new Set([personalChatId, groupChatId].filter(Boolean).map(String))];
  if (!botToken || chatIds.length === 0) {
    return sendJson(res, 503, {
      ok: false,
      message: 'Прийом заявок ще не налаштований. Будь ласка, зателефонуйте до ресторану: +38 (097) 935-17-46.'
    });
  }

  const ip = getClientIp(req);
  const now = Date.now();
  for (const [knownIp, knownBucket] of rateLimits) {
    if (now - knownBucket.started >= TEN_MINUTES) rateLimits.delete(knownIp);
  }
  const bucket = rateLimits.get(ip);
  if (bucket && now - bucket.started < TEN_MINUTES && bucket.count >= 5) {
    await logSecurityEvent(req, 'rate-limit-rejected');
    return sendJson(res, 429, { ok: false, message: 'Забагато спроб. Будь ласка, зачекайте кілька хвилин або зателефонуйте нам.' });
  }
  if (!bucket || now - bucket.started >= TEN_MINUTES) {
    while (rateLimits.size >= MAX_RATE_LIMIT_KEYS) {
      const oldestIp = rateLimits.keys().next().value;
      if (oldestIp === undefined) break;
      rateLimits.delete(oldestIp);
    }
    rateLimits.set(ip, { started: now, count: 1 });
  }
  else bucket.count += 1;

  let data;
  try {
    data = await readJson(req);
  } catch (error) {
    return sendJson(res, error.status || 400, { ok: false, message: error.message || 'Не вдалося прочитати заявку.' });
  }

  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    return sendJson(res, 400, { ok: false, message: 'Очікується об’єкт даних форми.' });
  }

  const name = cleanText(data.name, 80);
  const phone = normalizeUaPhone(cleanText(data.phone, 40));
  const formStartedAt = Number(data.formStartedAt);
  const formAge = Date.now() - formStartedAt;
  if (String(data.website || '').trim() || !Number.isFinite(formStartedAt) || formAge < MIN_FORM_TIME_MS || formAge > 24 * 60 * 60 * 1000) {
    await logSecurityEvent(req, 'form-bot-check-rejected', { formAge: Number.isFinite(formAge) ? formAge : null });
    return sendJson(res, 400, { ok: false, message: 'Не вдалося перевірити форму.' });
  }
  if (name.length < 2 || !phone) {
    return sendJson(res, 400, { ok: false, message: 'Перевірте ім’я та номер телефону.' });
  }

  try {
    const baseMessage = makeLeadMessage({ ...data, name, phone });
    const leadId = `MOOD-${Date.now()}-${randomUUID().slice(0, 6).toUpperCase()}`;
    const lead = {
      id: leadId,
      baseMessage,
      name,
      phone,
      contactName: name,
      status: 'new',
      createdAt: new Date().toISOString(),
      calls: [],
      history: [{ at: new Date().toISOString(), type: 'created', label: 'Нова заявка отримана', by: 'Сайт MOOD' }],
      lastContactMessageId: null,
      showAllCalls: false,
      showAllHistory: false,
      firstCallAt: null,
      slaReminderSentAt: null,
      followUpAt: null,
      followUpReminderSentAt: null,
      pendingCall: null,
      groupChatId: groupChatId ? String(groupChatId) : null,
      groupMessageId: null
    };
    leads.set(leadId, lead);
    await persistLeads();

    const deliveries = await Promise.all(chatIds.map(async chatId => {
      try {
        const isGroup = Boolean(groupChatId) && String(chatId) === String(groupChatId);
        const payload = {
          chat_id: chatId,
          text: isGroup ? renderManagedLead(lead) : `${baseMessage}\n\n🆔 Номер заявки: ${leadId}\n📌 Статус заявки: ${STATUS_LABELS.new}`,
          disable_web_page_preview: true
        };
        if (isGroup) payload.reply_markup = leadKeyboard(lead);
        const sent = await telegramApi('sendMessage', payload);
        if (isGroup) {
          lead.groupMessageId = sent.message_id;
          await persistLeads();
        }
        return { chatId, ok: true };
      } catch (error) {
        return { chatId, ok: false, error: error.message || 'Network error' };
      }
    }));
    const failed = deliveries.filter(item => !item.ok);
    if (failed.length) {
      console.error('Telegram delivery failed:', failed.map(item => `${item.chatId}: ${item.error}`).join('; '));
    }
    if (deliveries.every(item => !item.ok)) {
      return sendJson(res, 502, { ok: false, message: 'Не вдалося доставити заявку в Telegram. Спробуйте ще раз або зателефонуйте до ресторану.' });
    }
    return sendJson(res, 200, {
      ok: true,
      leadId,
      delivered: deliveries.filter(item => item.ok).length,
      total: deliveries.length,
      partialDelivery: failed.length > 0
    });
  } catch (error) {
    console.error('Telegram request failed:', error.message);
    return sendJson(res, 502, { ok: false, message: 'Telegram тимчасово недоступний. Спробуйте ще раз або зателефонуйте до ресторану.' });
  }
}

const contentTypes = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
  '.webp': 'image/webp', '.ico': 'image/x-icon', '.woff': 'font/woff',
  '.woff2': 'font/woff2', '.pdf': 'application/pdf'
};

async function serveProductionFile(req, res) {
  if (!['GET', 'HEAD'].includes(req.method || 'GET')) {
    res.writeHead(405, securityHeaders); res.end('Method not allowed'); return;
  }
  const dist = path.resolve(process.cwd(), 'dist');
  let pathname;
  try { pathname = decodeURIComponent(new URL(req.url || '/', 'http://localhost').pathname); }
  catch { res.writeHead(400, securityHeaders); res.end('Bad request'); return; }
  let requested = path.resolve(dist, `.${pathname}`);
  if (!requested.startsWith(dist + path.sep) && requested !== dist) {
    res.writeHead(403, securityHeaders); res.end('Forbidden'); return;
  }
  try {
    const info = await stat(requested);
    if (info.isDirectory()) requested = path.join(requested, 'index.html');
    const file = await readFile(requested);
    res.writeHead(200, {
      'Content-Type': contentTypes[path.extname(requested).toLowerCase()] || 'application/octet-stream',
      ...securityHeaders
    });
    res.end(req.method === 'HEAD' ? undefined : file);
  } catch {
    if (path.extname(pathname)) { res.writeHead(404, securityHeaders); res.end('Not found'); return; }
    try {
      const index = await readFile(path.join(dist, 'index.html'));
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', ...securityHeaders });
      res.end(index);
    } catch {
      res.writeHead(500, securityHeaders); res.end('Build the app first with npm run build.');
    }
  }
}

await initializeTelegramStorage();

let vite;
const server = http.createServer(async (req, res) => {
  const pathname = new URL(req.url || '/', 'http://localhost').pathname;
  // Test-only diagnostics are disabled unless MOOD_TEST_MODE=true is explicitly set.
  // Run the test server bound to 127.0.0.1; never enable this mode in production.
  if (TEST_MODE && pathname === '/__test/state' && req.method === 'GET') {
    return sendJson(res, 200, {
      leads: Object.fromEntries(leads.entries()),
      managers: Object.fromEntries(registeredManagers.entries()),
      updateOffset
    });
  }
  if (TEST_MODE && pathname === '/__test/expire-reminders' && req.method === 'POST') {
    try {
      const body = await readJson(req);
      if (body.mode === 'run') {
        await runLeadReminders();
        return sendJson(res, 200, { ok: true, mode: 'run' });
      }
      const lead = leads.get(String(body.leadId || ''));
      if (!lead) return sendJson(res, 404, { ok: false, message: 'Test lead not found.' });
      const past = new Date(Date.now() - (SLA_MINUTES + 2) * 60 * 1000).toISOString();
      if (body.mode === 'sla') {
        lead.createdAt = past;
        lead.firstCallAt = null;
        lead.slaReminderSentAt = null;
      } else if (body.mode === 'followup') {
        lead.status = 'in_progress';
        lead.followUpAt = past;
        lead.followUpReminderSentAt = null;
      } else {
        return sendJson(res, 400, { ok: false, message: 'Mode must be sla, followup or run.' });
      }
      await persistLeads();
      await runLeadReminders();
      return sendJson(res, 200, { ok: true, leadId: lead.id, mode: body.mode });
    } catch (error) {
      return sendJson(res, 400, { ok: false, message: error.message || 'Test reminder trigger failed.' });
    }
  }
  if (pathname === '/api/csrf') {
    if (req.method !== 'GET') return sendJson(res, 405, { ok: false, message: 'Метод не підтримується.' });
    return sendJson(res, 200, { ok: true, token: issueCsrfToken() });
  }
  if (pathname === '/api/lead') return handleLead(req, res);
  if (pathname.startsWith('/api/') || pathname.startsWith('/__test/')) return sendJson(res, 404, { ok: false, message: 'API endpoint not found.' });
  if (isProduction) return serveProductionFile(req, res);
  if (vite) return vite.middlewares(req, res, error => {
    if (error) { console.error(error); res.writeHead(500); res.end('Internal server error'); }
  });
  res.writeHead(503); res.end('Server starting');
});

if (!isProduction) {
  vite = await createViteServer({
    server: { middlewareMode: true, hmr: { server } },
    appType: 'spa'
  });
} else {
  try { await stat(path.resolve(process.cwd(), 'dist/index.html')); }
  catch { console.error('Production build not found. Run npm run build first.'); process.exit(1); }
}

server.listen(port, host, () => {
  console.log(`MOOD site server running at http://localhost:${port}`);
  const personalConfigured = setting('TELEGRAM_CHAT_ID');
  const groupConfigured = setting('TELEGRAM_GROUP_CHAT_ID');
  console.log(`Telegram integration: ${botToken && (personalConfigured || groupConfigured) ? 'configured' : 'not configured yet'}`);
  console.log(`Telegram destinations: ${[personalConfigured ? 'personal' : null, groupConfigured ? 'group' : null].filter(Boolean).join(', ') || 'none'}`);
  console.log(`Registered managers loaded: ${registeredManagers.size}`);
  if (botToken && groupConfigured) {
    void pollTelegramCallbacks();
    if (!TEST_MODE) startLeadReminderScheduler();
    else console.log('MOOD test mode: automatic reminder scheduler disabled; use test diagnostics to trigger reminders.');
  } else console.log('Telegram lead controls: disabled (set TELEGRAM_BOT_TOKEN and TELEGRAM_GROUP_CHAT_ID).');
  if (!isProduction) console.log('Development mode: edits are reloaded by Vite.');
});

async function shutdown() {
  pollingStopped = true;
  pollingController?.abort();
  if (reminderInterval) clearInterval(reminderInterval);
  server.close();
  if (vite) await vite.close();
  process.exit(0);
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
