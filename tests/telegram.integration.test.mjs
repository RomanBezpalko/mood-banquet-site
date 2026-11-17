import test from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { spawn } from "node:child_process";
import { setTimeout as delay } from "node:timers/promises";

const BOT_TOKEN = "MOOD_AUTOMATED_TEST_TOKEN";
const DATA_ENCRYPTION_KEY = "11".repeat(32);
const GROUP_ID = "-1001234567890";
const PERSONAL_ID = "123456789";
const MANAGER_ID = 701001;
const NON_MANAGER_ID = 701002;
const UNREGISTERED_ID = 701003;
const managerUser = {
  id: MANAGER_ID,
  is_bot: false,
  first_name: "Test",
  last_name: "Manager",
  username: "mood_test_manager",
};
const nonManagerUser = {
  id: NON_MANAGER_ID,
  is_bot: false,
  first_name: "Second",
  last_name: "Manager",
};
const unregisteredUser = {
  id: UNREGISTERED_ID,
  is_bot: false,
  first_name: "Unregistered",
  last_name: "User",
};

function json(res, statusCode, data) {
  res.writeHead(statusCode, {
    "content-type": "application/json; charset=utf-8",
  });
  res.end(JSON.stringify(data));
}

async function readBody(req) {
  let raw = "";
  for await (const chunk of req) raw += chunk;
  return raw ? JSON.parse(raw) : {};
}

function createFakeTelegramApi() {
  let nextMessageId = 100;
  let nextUpdateId = 1;
  const updates = [];
  const messages = new Map();
  const calls = [];
  const callbackAnswers = [];
  const deletedMessages = [];

  function chatType(chatId) {
    return String(chatId).startsWith("-") ? "supergroup" : "private";
  }
  function addMessage(chatId, payload, kind = "message") {
    const message = {
      message_id: nextMessageId++,
      date: Math.floor(Date.now() / 1000),
      chat: {
        id: Number(chatId),
        type: chatType(chatId),
        title:
          chatType(chatId) === "supergroup"
            ? "MOOD — Банкетні заявки"
            : undefined,
      },
      from: {
        id: 999000,
        is_bot: true,
        first_name: "MOOD Банкетні заявки",
        username: "MoodBanquet_bot",
      },
      ...payload,
      __kind: kind,
    };
    const key = String(chatId);
    if (!messages.has(key)) messages.set(key, []);
    messages.get(key).push(message);
    return message;
  }
  function enqueue(update) {
    const item = { update_id: nextUpdateId++, ...update };
    updates.push(item);
    return item.update_id;
  }
  const server = http.createServer(async (req, res) => {
    try {
      const url = new URL(req.url, "http://127.0.0.1");
      const parts = url.pathname.split("/").filter(Boolean);
      const method = parts.at(-1);
      const payload = req.method === "POST" ? await readBody(req) : {};
      calls.push({ method, payload });

      if (method === "getUpdates") {
        const offset = Number(url.searchParams.get("offset") || 0);
        for (let i = updates.length - 1; i >= 0; i--) {
          if (updates[i].update_id < offset) updates.splice(i, 1);
        }
        const result = updates.slice(0, 50);
        await delay(result.length ? 10 : 70);
        return json(res, 200, { ok: true, result });
      }
      if (method === "getChatMember") {
        return json(res, 200, {
          ok: true,
          result: { status: "member", user: { id: payload.user_id } },
        });
      }
      if (method === "sendMessage") {
        const message = addMessage(payload.chat_id, {
          text: payload.text,
          reply_markup: payload.reply_markup,
          reply_to_message_id: payload.reply_parameters?.message_id,
        });
        return json(res, 200, { ok: true, result: message });
      }
      if (method === "sendContact") {
        const message = addMessage(
          payload.chat_id,
          {
            contact: {
              phone_number: payload.phone_number,
              first_name: payload.first_name,
              last_name: payload.last_name,
            },
            reply_markup: payload.reply_markup,
            reply_to_message_id: payload.reply_parameters?.message_id,
          },
          "contact",
        );
        return json(res, 200, { ok: true, result: message });
      }
      if (method === "editMessageText") {
        const message = (messages.get(String(payload.chat_id)) || []).find(
          (item) => item.message_id === Number(payload.message_id),
        );
        if (!message)
          return json(res, 200, {
            ok: false,
            description: "message to edit not found",
          });
        message.text = payload.text;
        message.reply_markup = payload.reply_markup;
        return json(res, 200, { ok: true, result: message });
      }
      if (method === "editMessageReplyMarkup") {
        const message = (messages.get(String(payload.chat_id)) || []).find(
          (item) => item.message_id === Number(payload.message_id),
        );
        if (!message)
          return json(res, 200, {
            ok: false,
            description: "message to edit not found",
          });
        message.reply_markup = payload.reply_markup;
        return json(res, 200, { ok: true, result: message });
      }
      if (method === "deleteMessage") {
        const message = (messages.get(String(payload.chat_id)) || []).find(
          (item) => item.message_id === Number(payload.message_id),
        );
        if (!message)
          return json(res, 200, {
            ok: false,
            description: "message to delete not found",
          });
        message.deleted = true;
        deletedMessages.push({
          chatId: String(payload.chat_id),
          messageId: Number(payload.message_id),
        });
        return json(res, 200, { ok: true, result: true });
      }
      if (method === "answerCallbackQuery") {
        callbackAnswers.push(payload);
        return json(res, 200, { ok: true, result: true });
      }
      if (method === "getMe") {
        return json(res, 200, {
          ok: true,
          result: { id: 999000, is_bot: true, username: "MoodBanquet_bot" },
        });
      }
      return json(res, 200, { ok: true, result: true });
    } catch (error) {
      return json(res, 500, { ok: false, description: error.message });
    }
  });
  return {
    server,
    messages,
    calls,
    callbackAnswers,
    deletedMessages,
    enqueue,
    findMessages(chatId, predicate = () => true) {
      return (messages.get(String(chatId)) || []).filter(predicate);
    },
    latestMessage(chatId, predicate = () => true) {
      return this.findMessages(chatId, predicate).at(-1);
    },
    getCall(method) {
      return calls.filter((call) => call.method === method);
    },
  };
}

async function getFreePort() {
  const server = net.createServer();
  await new Promise((resolve, reject) =>
    server.listen(0, "127.0.0.1", resolve).once("error", reject),
  );
  const { port } = server.address();
  await new Promise((resolve) => server.close(resolve));
  return port;
}

async function waitFor(fn, description, timeoutMs = 7000) {
  const started = Date.now();
  let lastError;
  while (Date.now() - started < timeoutMs) {
    try {
      const value = await fn();
      if (value) return value;
    } catch (error) {
      lastError = error;
    }
    await delay(50);
  }
  throw new Error(
    `Timeout waiting for ${description}${lastError ? `: ${lastError.message}` : ""}`,
  );
}

async function postJson(url, payload, extraHeaders = {}) {
  const testPayload = {
    website: "",
    formStartedAt: Date.now() - 2000,
    ...payload,
  };
  const csrf = await fetch(`${new URL(url).origin}/api/csrf`);
  const { token } = await csrf.json();
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      origin: new URL(url).origin,
      "x-csrf-token": token,
      ...extraHeaders,
    },
    body: JSON.stringify(testPayload),
  });
  return { status: response.status, body: await response.json() };
}

function makeCallbackUpdate(fake, { id, user, message, data }) {
  fake.enqueue({ callback_query: { id, from: user, message, data } });
}
function makeMessageUpdate(fake, message) {
  fake.enqueue({ message });
}

const projectRoot = path.resolve(process.cwd());

test("MOOD Telegram module end-to-end (mock Telegram Bot API, no real messages)", async (t) => {
  const fake = createFakeTelegramApi();
  await new Promise((resolve, reject) =>
    fake.server.listen(0, "127.0.0.1", resolve).once("error", reject),
  );
  const telegramPort = fake.server.address().port;
  const appPort = await getFreePort();
  const tempDataDir = await mkdtemp(
    path.join(os.tmpdir(), "mood-automated-test-"),
  );
  const appBase = `http://127.0.0.1:${appPort}`;
  const serverLog = [];
  const child = spawn(process.execPath, ["server.mjs"], {
    cwd: projectRoot,
    env: {
      ...process.env,
      NODE_ENV: "development",
      HOST: "127.0.0.1",
      PORT: String(appPort),
      MOOD_TEST_MODE: "true",
      MOOD_DATA_DIR: tempDataDir,
      MOOD_DATA_ENCRYPTION_KEY: DATA_ENCRYPTION_KEY,
      TELEGRAM_API_BASE_URL: `http://127.0.0.1:${telegramPort}`,
      TELEGRAM_BOT_TOKEN: BOT_TOKEN,
      TELEGRAM_BOT_USERNAME: "MoodBanquet_bot",
      TELEGRAM_CHAT_ID: PERSONAL_ID,
      TELEGRAM_GROUP_CHAT_ID: GROUP_ID,
      TELEGRAM_FIRST_CALL_SLA_MINUTES: "1",
      TELEGRAM_CALLBACK_REMINDER_MINUTES: "5",
      TELEGRAM_MANAGER_IDS: "",
      TRUST_PROXY: "true",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  child.stdout.on("data", (chunk) => serverLog.push(chunk.toString()));
  child.stderr.on("data", (chunk) => serverLog.push(chunk.toString()));

  t.after(async () => {
    if (child.exitCode === null) {
      child.kill("SIGTERM");
      await Promise.race([
        new Promise((resolve) => child.once("exit", resolve)),
        delay(3000),
      ]);
      if (child.exitCode === null) child.kill("SIGKILL");
    }
    await new Promise((resolve) => fake.server.close(resolve));
    await rm(tempDataDir, { recursive: true, force: true });
  });

  await waitFor(async () => {
    if (child.exitCode !== null)
      throw new Error(`App exited: ${serverLog.join("")}`);
    const response = await fetch(`${appBase}/__test/state`).catch(() => null);
    return response?.ok;
  }, "test server startup");

  await t.test("home page and API validation", async () => {
    const page = await fetch(appBase);
    assert.equal(page.status, 200);
    const invalid = await postJson(`${appBase}/api/lead`, {
      source: "Test",
      name: "A",
      phone: "12",
    });
    assert.equal(invalid.status, 400);
    assert.equal(invalid.body.ok, false);
  });

  await t.test("lead API security boundaries", async () => {
    const getResponse = await fetch(`${appBase}/api/lead`);
    assert.equal(getResponse.status, 405);
    const csrfResponse = await fetch(`${appBase}/api/csrf`);
    assert.equal(csrfResponse.status, 200);
    const { token: csrfToken } = await csrfResponse.json();

    const missingToken = await fetch(`${appBase}/api/lead`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        origin: new URL(appBase).origin,
        "x-forwarded-for": "security-missing-token",
      },
      body: JSON.stringify({
        name: "No token",
        phone: "0671234567",
        website: "",
        formStartedAt: Date.now() - 2000,
      }),
    });
    assert.equal(missingToken.status, 403);

    const missingOrigin = await fetch(`${appBase}/api/lead`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-forwarded-for": "security-missing-origin",
      },
      body: JSON.stringify({
        name: "No origin",
        phone: "0671234567",
        website: "",
        formStartedAt: Date.now() - 2000,
      }),
    });
    assert.equal(missingOrigin.status, 403);

    const nullPayload = await fetch(`${appBase}/api/lead`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        origin: new URL(appBase).origin,
        "x-csrf-token": csrfToken,
        "x-forwarded-for": "security-null-payload",
      },
      body: "null",
    });
    assert.equal(nullPayload.status, 400);

    const foreignOrigin = await postJson(
      `${appBase}/api/lead`,
      { name: "Cross site", phone: "0671234567" },
      {
        origin: "https://evil.example",
        "x-forwarded-for": "security-csrf-origin",
      },
    );
    assert.equal(foreignOrigin.status, 403);

    const malformed = await fetch(`${appBase}/api/lead`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        origin: new URL(appBase).origin,
        "x-csrf-token": csrfToken,
        "x-forwarded-for": "security-malformed",
      },
      body: '{"name":',
    });
    assert.equal(malformed.status, 400);

    const oversized = await fetch(`${appBase}/api/lead`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        origin: new URL(appBase).origin,
        "x-csrf-token": csrfToken,
        "x-forwarded-for": "security-oversized",
      },
      body: JSON.stringify({
        name: "Test",
        phone: "0671234567",
        comment: "x".repeat(13_000),
      }),
    });
    assert.equal(oversized.status, 413);

    const invalidPayload = await postJson(
      `${appBase}/api/lead`,
      { name: "<script>alert(1)</script>", phone: "not-a-phone" },
      { "x-forwarded-for": "security-invalid-payload" },
    );
    assert.equal(invalidPayload.status, 400);
    assert.equal(invalidPayload.body.ok, false);

    const rateLimitedIp = "security-rate-limit";
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const response = await postJson(
        `${appBase}/api/lead`,
        { name: "A", phone: "12" },
        { "x-forwarded-for": rateLimitedIp },
      );
      assert.equal(response.status, 400);
    }
    const blocked = await postJson(
      `${appBase}/api/lead`,
      { name: "A", phone: "12" },
      { "x-forwarded-for": rateLimitedIp },
    );
    assert.equal(blocked.status, 429);

    const honeypot = await postJson(
      `${appBase}/api/lead`,
      {
        name: "Bot",
        phone: "0671234567",
        website: "filled",
        formStartedAt: Date.now() - 5000,
      },
      { "x-forwarded-for": "security-honeypot" },
    );
    assert.equal(honeypot.status, 400);

    const tooFast = await postJson(
      `${appBase}/api/lead`,
      { name: "Fast", phone: "0671234568", formStartedAt: Date.now() },
      { "x-forwarded-for": "security-too-fast" },
    );
    assert.equal(tooFast.status, 400);

    const tooOld = await postJson(
      `${appBase}/api/lead`,
      {
        name: "Old",
        phone: "0671234569",
        formStartedAt: Date.now() - 25 * 60 * 60 * 1000,
      },
      { "x-forwarded-for": "security-too-old" },
    );
    assert.equal(tooOld.status, 400);

    const auditLines = (
      await readFile(path.join(tempDataDir, "security-audit.jsonl"), "utf8")
    )
      .trim()
      .split("\n")
      .map((line) => JSON.parse(line));
    assert.ok(
      auditLines.some((event) => event.reason === "csrf-origin-rejected"),
    );
    assert.ok(
      auditLines.some((event) => event.reason === "form-bot-check-rejected"),
    );
    assert.ok(
      auditLines.every((event) => !("name" in event) && !("phone" in event)),
    );
  });

  await t.test(
    "concurrent lead submissions persist independently",
    async () => {
      const responses = await Promise.all([
        postJson(
          `${appBase}/api/lead`,
          { name: "Concurrent One", phone: "0671234501" },
          { "x-forwarded-for": "concurrent-one" },
        ),
        postJson(
          `${appBase}/api/lead`,
          { name: "Concurrent Two", phone: "0671234502" },
          { "x-forwarded-for": "concurrent-two" },
        ),
      ]);
      assert.deepEqual(
        responses.map((response) => response.status),
        [200, 200],
      );
      const leadIds = responses.map((response) => response.body.leadId);
      assert.notEqual(leadIds[0], leadIds[1]);

      await waitFor(async () => {
        const state = await (await fetch(`${appBase}/__test/state`)).json();
        return leadIds.every((id) =>
          state.leads[id]?.name?.startsWith("Concurrent"),
        );
      }, "concurrent leads persisted in memory");

      const diskLeads = await readFile(
        path.join(tempDataDir, "leads.json"),
        "utf8",
      );
      assert.match(diskLeads, /^mood-storage-v1:/);
      assert.doesNotMatch(diskLeads, /\+38067123450[12]/);
    },
  );

  await t.test(
    "manager registration with consent and own contact",
    async () => {
      makeMessageUpdate(fake, {
        message_id: 1,
        from: managerUser,
        chat: { id: MANAGER_ID, type: "private" },
        text: "/register",
      });
      const consentMessage = await waitFor(
        () =>
          fake.latestMessage(MANAGER_ID, (m) =>
            m.text?.includes("РЕЄСТРАЦІЯ МЕНЕДЖЕРА MOOD"),
          ),
        "manager consent message",
      );
      const consentButton = consentMessage.reply_markup.inline_keyboard[0][0];
      assert.equal(consentButton.callback_data, "managerconsent:accept");

      makeCallbackUpdate(fake, {
        id: "consent-1",
        user: managerUser,
        message: consentMessage,
        data: "managerconsent:accept",
      });
      const contactPrompt = await waitFor(
        () =>
          fake.latestMessage(
            MANAGER_ID,
            (m) => m.reply_markup?.keyboard?.[0]?.[0]?.request_contact,
          ),
        "request_contact keyboard",
      );
      assert.equal(
        contactPrompt.reply_markup.keyboard[0][0].request_contact,
        true,
      );

      // A contact belonging to another user must not complete registration.
      makeMessageUpdate(fake, {
        message_id: 3,
        from: managerUser,
        chat: { id: MANAGER_ID, type: "private" },
        contact: {
          user_id: NON_MANAGER_ID,
          phone_number: "+380971112233",
          first_name: "Someone",
          last_name: "Else",
        },
      });
      await waitFor(
        () =>
          fake.latestMessage(MANAGER_ID, (m) =>
            m.text?.includes("Потрібно надіслати саме власний контакт"),
          ),
        "foreign contact rejection",
      );

      makeMessageUpdate(fake, {
        message_id: 4,
        from: managerUser,
        chat: { id: MANAGER_ID, type: "private" },
        contact: {
          user_id: MANAGER_ID,
          phone_number: "+380971112233",
          first_name: "Test",
          last_name: "Manager",
        },
      });
      await waitFor(async () => {
        const state = await (await fetch(`${appBase}/__test/state`)).json();
        return state.managers[String(MANAGER_ID)]?.phone === "+380971112233";
      }, "manager profile saved");

      // Register a second manager to test ownership isolation.
      makeMessageUpdate(fake, {
        message_id: 5,
        from: nonManagerUser,
        chat: { id: NON_MANAGER_ID, type: "private" },
        text: "/register",
      });
      const secondConsent = await waitFor(
        () =>
          fake.latestMessage(NON_MANAGER_ID, (m) =>
            m.text?.includes("РЕЄСТРАЦІЯ МЕНЕДЖЕРА MOOD"),
          ),
        "second manager consent",
      );
      makeCallbackUpdate(fake, {
        id: "consent-2",
        user: nonManagerUser,
        message: secondConsent,
        data: "managerconsent:accept",
      });
      await waitFor(
        () =>
          fake.latestMessage(
            NON_MANAGER_ID,
            (m) => m.reply_markup?.keyboard?.[0]?.[0]?.request_contact,
          ),
        "second manager contact prompt",
      );
      makeMessageUpdate(fake, {
        message_id: 6,
        from: nonManagerUser,
        chat: { id: NON_MANAGER_ID, type: "private" },
        contact: {
          user_id: NON_MANAGER_ID,
          phone_number: "+380971119999",
          first_name: "Not",
          last_name: "Registered",
        },
      });
      await waitFor(async () => {
        const state = await (await fetch(`${appBase}/__test/state`)).json();
        return (
          state.managers[String(NON_MANAGER_ID)]?.phone === "+380971119999"
        );
      }, "second manager profile saved");
    },
  );

  let firstLead;
  let groupLeadMessage;
  let contact1;
  let contact2;
  let contact3;
  await t.test(
    "website lead delivery to personal and manager chats",
    async () => {
      const response = await postJson(`${appBase}/api/lead`, {
        source: "Калькулятор бенкету",
        name: "Тест MOOD",
        phone: "+380971234567",
        eventFormat: "Корпоратив",
        eventDate: "2026-12-20",
        guests: 20,
        menu: "Бенкетний формат",
        extras: ["Декорування зали"],
        comment: "Автоматичний тест",
      });
      assert.equal(response.status, 200);
      assert.equal(response.body.ok, true);
      firstLead = response.body.leadId;
      groupLeadMessage = await waitFor(
        () => fake.latestMessage(GROUP_ID, (m) => m.text?.includes(firstLead)),
        "group lead message",
      );
      const personalMessage = fake.latestMessage(PERSONAL_ID, (m) =>
        m.text?.includes(firstLead),
      );
      assert.ok(
        personalMessage,
        "personal lead notification should be delivered",
      );
      assert.match(groupLeadMessage.text, /НОВА ЗАЯВКА З САЙТУ MOOD/);
      assert.ok(
        groupLeadMessage.reply_markup.inline_keyboard
          .flat()
          .some(
            (button) => button.callback_data === `moodlead:${firstLead}:work`,
          ),
      );
    },
  );

  await t.test("unregistered manager cannot take the lead", async () => {
    makeCallbackUpdate(fake, {
      id: "unauthorized-work",
      user: unregisteredUser,
      message: groupLeadMessage,
      data: `moodlead:${firstLead}:work`,
    });
    await waitFor(
      () =>
        fake.callbackAnswers.some(
          (item) => item.callback_query_id === "unauthorized-work",
        ),
      "unauthorized callback answer",
    );
    const state = await (await fetch(`${appBase}/__test/state`)).json();
    assert.equal(state.leads[firstLead].status, "new");
  });

  await t.test(
    "rejects forged or unknown Telegram callback actions",
    async () => {
      makeCallbackUpdate(fake, {
        id: "unknown-lead-callback",
        user: managerUser,
        message: groupLeadMessage,
        data: "moodlead:MOOD-does-not-exist:work",
      });
      await waitFor(
        () =>
          fake.callbackAnswers.some(
            (item) => item.callback_query_id === "unknown-lead-callback",
          ),
        "unknown lead callback answer",
      );

      makeCallbackUpdate(fake, {
        id: "unknown-action-callback",
        user: managerUser,
        message: groupLeadMessage,
        data: `moodlead:${firstLead}:delete-all-data`,
      });
      await waitFor(
        () =>
          fake.callbackAnswers.some(
            (item) => item.callback_query_id === "unknown-action-callback",
          ),
        "unknown action callback answer",
      );

      const state = await (await fetch(`${appBase}/__test/state`)).json();
      assert.equal(state.leads[firstLead].status, "new");
    },
  );

  await t.test(
    "registered manager takes ownership and requests guest contact via sendContact",
    async () => {
      makeCallbackUpdate(fake, {
        id: "work-1",
        user: managerUser,
        message: groupLeadMessage,
        data: `moodlead:${firstLead}:work`,
      });
      await waitFor(async () => {
        const state = await (await fetch(`${appBase}/__test/state`)).json();
        return state.leads[firstLead]?.status === "in_progress";
      }, "lead moved to in_progress");

      groupLeadMessage = fake.latestMessage(
        GROUP_ID,
        (m) => m.message_id === groupLeadMessage.message_id,
      );
      makeCallbackUpdate(fake, {
        id: "duplicate-work",
        user: nonManagerUser,
        message: groupLeadMessage,
        data: `moodlead:${firstLead}:work`,
      });
      await waitFor(
        () =>
          fake.callbackAnswers.some(
            (item) => item.callback_query_id === "duplicate-work",
          ),
        "duplicate work callback answer",
      );
      const ownership = await (await fetch(`${appBase}/__test/state`)).json();
      assert.equal(
        ownership.leads[firstLead].workManagerId,
        String(MANAGER_ID),
      );

      groupLeadMessage = fake.latestMessage(
        GROUP_ID,
        (m) => m.message_id === groupLeadMessage.message_id,
      );
      makeCallbackUpdate(fake, {
        id: "call-1",
        user: managerUser,
        message: groupLeadMessage,
        data: `moodlead:${firstLead}:call`,
      });
      contact1 = await waitFor(
        () =>
          fake.latestMessage(
            GROUP_ID,
            (m) =>
              m.__kind === "contact" &&
              m.contact?.phone_number === "+380971234567",
          ),
        "sendContact first attempt",
      );
      assert.equal(contact1.contact.first_name, "Тест");
      assert.equal(contact1.contact.last_name, "MOOD");
      assert.equal(fake.getCall("sendContact").length, 1);
      const resultButtons = contact1.reply_markup.inline_keyboard
        .flat()
        .map((button) => button.callback_data);
      assert.ok(
        resultButtons.includes(`moodlead:${firstLead}:callresult:dialed`),
      );
      assert.ok(
        resultButtons.includes(`moodlead:${firstLead}:callresult:no_answer`),
      );
      assert.ok(
        resultButtons.includes(
          `moodlead:${firstLead}:callresult:callback_later`,
        ),
      );
      const contactLinks = contact1.reply_markup.inline_keyboard
        .flat()
        .filter((button) => button.url)
        .map((button) => button.url);
      assert.ok(contactLinks.includes("https://t.me/+380971234567"));
      assert.doesNotMatch(contactLinks.join("\n"), /^tel:/m);

      makeCallbackUpdate(fake, {
        id: "wrong-manager-result",
        user: nonManagerUser,
        message: contact1,
        data: `moodlead:${firstLead}:callresult:dialed`,
      });
      await waitFor(
        () =>
          fake.callbackAnswers.some(
            (item) => item.callback_query_id === "wrong-manager-result",
          ),
        "second manager denied for active call",
      );
      const stillPending = await (
        await fetch(`${appBase}/__test/state`)
      ).json();
      assert.equal(stillPending.leads[firstLead].calls.length, 0);
      assert.equal(
        stillPending.leads[firstLead].pendingCall.managerId,
        String(MANAGER_ID),
      );

      makeCallbackUpdate(fake, {
        id: "no-answer-1",
        user: managerUser,
        message: contact1,
        data: `moodlead:${firstLead}:callresult:no_answer`,
      });
      await waitFor(async () => {
        const state = await (await fetch(`${appBase}/__test/state`)).json();
        return (
          state.leads[firstLead]?.calls?.length === 1 &&
          !state.leads[firstLead]?.pendingCall
        );
      }, "no-answer result recorded");
      const afterNoAnswer = await (
        await fetch(`${appBase}/__test/state`)
      ).json();
      assert.equal(afterNoAnswer.leads[firstLead].calls[0].result, "no_answer");
      assert.ok(afterNoAnswer.leads[firstLead].followUpAt);
    },
  );

  await t.test(
    "retry replaces the previous guest contact instead of duplicating it",
    async () => {
      groupLeadMessage = fake.latestMessage(
        GROUP_ID,
        (m) => m.message_id === groupLeadMessage.message_id,
      );
      makeCallbackUpdate(fake, {
        id: "call-2",
        user: managerUser,
        message: groupLeadMessage,
        data: `moodlead:${firstLead}:call`,
      });
      await waitFor(
        () => fake.getCall("sendContact").length >= 2,
        "sendContact retry request",
      );
      await waitFor(
        () =>
          fake.deletedMessages.some(
            (item) => item.messageId === contact1.message_id,
          ),
        "previous contact deletion",
      );
      contact2 = await waitFor(
        () =>
          fake.latestMessage(
            GROUP_ID,
            (m) =>
              m.__kind === "contact" &&
              m.contact?.phone_number === "+380971234567" &&
              m.message_id !== contact1.message_id &&
              !m.deleted,
          ),
        "sendContact retry",
      );
      assert.equal(fake.getCall("sendContact").length, 2);
      assert.equal(contact1.deleted, true);

      makeCallbackUpdate(fake, {
        id: "callback-later-1",
        user: managerUser,
        message: contact2,
        data: `moodlead:${firstLead}:callresult:callback_later`,
      });
      await waitFor(async () => {
        const state = await (await fetch(`${appBase}/__test/state`)).json();
        return (
          state.leads[firstLead]?.calls?.length === 2 &&
          Boolean(state.leads[firstLead]?.followUpAt)
        );
      }, "callback later result recorded");
      const current = await (await fetch(`${appBase}/__test/state`)).json();
      assert.equal(current.leads[firstLead].calls[1].result, "callback_later");
    },
  );

  await t.test(
    "follow-up reminder fires and successful call can close the lead",
    async () => {
      const due = await postJson(`${appBase}/__test/expire-reminders`, {
        leadId: firstLead,
        mode: "followup",
      });
      assert.equal(due.status, 200);
      await waitFor(
        () =>
          fake.findMessages(
            GROUP_ID,
            (m) =>
              m.text?.includes("ЧАС ПОВТОРНОГО ДЗВІНКА MOOD") &&
              m.text.includes(firstLead),
          ).length > 0,
        "follow-up reminder",
      );
      await waitFor(
        () =>
          fake.findMessages(
            MANAGER_ID,
            (m) =>
              m.text?.includes("ЧАС ПОВТОРНОГО ДЗВІНКА MOOD") &&
              m.text.includes(firstLead),
          ).length > 0,
        "private follow-up reminder",
      );

      groupLeadMessage = fake.latestMessage(
        GROUP_ID,
        (m) => m.message_id === groupLeadMessage.message_id,
      );
      makeCallbackUpdate(fake, {
        id: "call-3",
        user: managerUser,
        message: groupLeadMessage,
        data: `moodlead:${firstLead}:call`,
      });
      contact3 = await waitFor(
        () =>
          fake.findMessages(
            GROUP_ID,
            (m) =>
              m.__kind === "contact" &&
              m.contact?.phone_number === "+380971234567",
          ).length >= 3
            ? fake.latestMessage(
                GROUP_ID,
                (m) =>
                  m.__kind === "contact" &&
                  m.contact?.phone_number === "+380971234567" &&
                  !m.deleted,
              )
            : null,
        "third contact card",
      );
      makeCallbackUpdate(fake, {
        id: "dialed-1",
        user: managerUser,
        message: contact3,
        data: `moodlead:${firstLead}:callresult:dialed`,
      });
      await waitFor(async () => {
        const state = await (await fetch(`${appBase}/__test/state`)).json();
        return (
          state.leads[firstLead]?.calls?.length === 3 &&
          !state.leads[firstLead]?.pendingCall
        );
      }, "dialed result recorded");
      groupLeadMessage = fake.latestMessage(
        GROUP_ID,
        (m) => m.message_id === groupLeadMessage.message_id,
      );
      makeCallbackUpdate(fake, {
        id: "confirmed-1",
        user: managerUser,
        message: groupLeadMessage,
        data: `moodlead:${firstLead}:confirmed`,
      });
      await waitFor(async () => {
        const state = await (await fetch(`${appBase}/__test/state`)).json();
        return state.leads[firstLead]?.status === "confirmed";
      }, "lead confirmed");
      groupLeadMessage = fake.latestMessage(
        GROUP_ID,
        (m) => m.message_id === groupLeadMessage.message_id,
      );
      await waitFor(
        () => contact3.deleted === true,
        "confirmed contact card deletion",
      );
      assert.equal(contact3.deleted, true);
      assert.ok(
        fake.deletedMessages.some(
          (item) => item.messageId === contact3.message_id,
        ),
      );

      makeCallbackUpdate(fake, {
        id: "closed-lead-mutation",
        user: managerUser,
        message: groupLeadMessage,
        data: `moodlead:${firstLead}:rejected`,
      });
      await waitFor(
        () =>
          fake.callbackAnswers.some(
            (item) => item.callback_query_id === "closed-lead-mutation",
          ),
        "closed lead callback answer",
      );
      const closedState = await (await fetch(`${appBase}/__test/state`)).json();
      assert.equal(closedState.leads[firstLead].status, "confirmed");
    },
  );

  await t.test(
    "callback form creates a lead and rejected status can close it",
    async () => {
      const response = await postJson(`${appBase}/api/lead`, {
        source: "Форма зворотного дзвінка",
        name: "Тест CALLBACK",
        phone: "+380971119999",
      });
      assert.equal(response.status, 200);
      const callbackLeadId = response.body.leadId;
      let callbackLeadMessage = await waitFor(
        () =>
          fake.latestMessage(GROUP_ID, (m) => m.text?.includes(callbackLeadId)),
        "callback form group notification",
      );
      const personal = fake.latestMessage(PERSONAL_ID, (m) =>
        m.text?.includes(callbackLeadId),
      );
      assert.ok(
        personal,
        "callback form notification should reach personal chat",
      );
      assert.match(callbackLeadMessage.text, /Форма зворотного дзвінка/);

      makeCallbackUpdate(fake, {
        id: "callback-work",
        user: managerUser,
        message: callbackLeadMessage,
        data: `moodlead:${callbackLeadId}:work`,
      });
      await waitFor(
        async () =>
          (await (await fetch(`${appBase}/__test/state`)).json()).leads[
            callbackLeadId
          ]?.status === "in_progress",
        "callback form lead assigned",
      );
      callbackLeadMessage = fake.latestMessage(
        GROUP_ID,
        (m) => m.message_id === callbackLeadMessage.message_id,
      );
      makeCallbackUpdate(fake, {
        id: "callback-call",
        user: managerUser,
        message: callbackLeadMessage,
        data: `moodlead:${callbackLeadId}:call`,
      });
      const callbackContact = await waitFor(
        () =>
          fake.latestMessage(
            GROUP_ID,
            (m) =>
              m.__kind === "contact" &&
              m.contact?.phone_number === "+380971119999" &&
              !m.deleted,
          ),
        "callback form contact sent",
      );
      makeCallbackUpdate(fake, {
        id: "callback-dialed",
        user: managerUser,
        message: callbackContact,
        data: `moodlead:${callbackLeadId}:callresult:dialed`,
      });
      await waitFor(
        async () =>
          (await (await fetch(`${appBase}/__test/state`)).json()).leads[
            callbackLeadId
          ]?.calls?.length === 1,
        "callback form call result",
      );
      callbackLeadMessage = fake.latestMessage(
        GROUP_ID,
        (m) => m.message_id === callbackLeadMessage.message_id,
      );
      makeCallbackUpdate(fake, {
        id: "callback-rejected",
        user: managerUser,
        message: callbackLeadMessage,
        data: `moodlead:${callbackLeadId}:rejected`,
      });
      await waitFor(
        async () =>
          (await (await fetch(`${appBase}/__test/state`)).json()).leads[
            callbackLeadId
          ]?.status === "rejected",
        "callback form lead rejected",
      );
      callbackLeadMessage = fake.latestMessage(
        GROUP_ID,
        (m) => m.message_id === callbackLeadMessage.message_id,
      );
      await waitFor(
        () => callbackContact.deleted === true,
        "rejected contact card deletion",
      );
      assert.equal(callbackContact.deleted, true);
      assert.ok(
        fake.deletedMessages.some(
          (item) => item.messageId === callbackContact.message_id,
        ),
      );
    },
  );

  await t.test(
    "SLA reminder fires once for a lead without a first call",
    async () => {
      const response = await postJson(`${appBase}/api/lead`, {
        source: "Форма зворотного дзвінка",
        name: "Тест SLA",
        phone: "+380971112233",
      });
      assert.equal(response.status, 200);
      const secondLeadId = response.body.leadId;
      const result = await postJson(`${appBase}/__test/expire-reminders`, {
        leadId: secondLeadId,
        mode: "sla",
      });
      assert.equal(result.status, 200);
      await waitFor(
        () =>
          fake.findMessages(
            GROUP_ID,
            (m) =>
              m.text?.includes("SLA 1 ХВ") && m.text.includes(secondLeadId),
          ).length === 1,
        "SLA reminder once",
      );
      const state = await (await fetch(`${appBase}/__test/state`)).json();
      assert.ok(state.leads[secondLeadId].slaReminderSentAt);
      assert.ok(
        state.leads[secondLeadId].history.some(
          (event) => event.type === "sla_reminder",
        ),
      );
      await postJson(`${appBase}/__test/expire-reminders`, { mode: "run" });
      const matchingSla = fake.findMessages(
        GROUP_ID,
        (m) => m.text?.includes("SLA 1 ХВ") && m.text.includes(secondLeadId),
      );
      assert.equal(
        matchingSla.length,
        1,
        "SLA reminder must not be duplicated",
      );
    },
  );

  await t.test(
    "history expands and paginates without losing event data",
    async () => {
      const state = await (await fetch(`${appBase}/__test/state`)).json();
      const lead = state.leads[firstLead];
      assert.ok(lead.history.length >= 4);
      const mainMessage = fake.latestMessage(
        GROUP_ID,
        (m) => m.message_id === lead.groupMessageId,
      );
      assert.doesNotMatch(mainMessage.text, /Історія дій:/);
      assert.doesNotMatch(mainMessage.text, /Спроби зв’язку:/);
      const detailButtons = mainMessage.reply_markup.inline_keyboard
        .flat()
        .map((button) => button.text);
      assert.ok(
        detailButtons.some((text) =>
          text.includes("Відобразити всі спроби зв’язку"),
        ),
      );
      assert.ok(
        detailButtons.some((text) =>
          text.includes("Відобразити всю історію дій"),
        ),
      );
      const toggleHistory = mainMessage.reply_markup.inline_keyboard
        .flat()
        .find(
          (button) =>
            button.callback_data === `moodlead:${firstLead}:toggle_history`,
        );
      assert.ok(toggleHistory, "history expand control exists");
      makeCallbackUpdate(fake, {
        id: "history-toggle",
        user: managerUser,
        message: mainMessage,
        data: toggleHistory.callback_data,
      });
      await waitFor(async () => {
        const current = await fake.latestMessage(
          GROUP_ID,
          (m) => m.message_id === lead.groupMessageId,
        );
        return (
          current?.text?.includes("Історія дій:") &&
          current.text.includes("сторінка")
        );
      }, "history expanded");
      const expanded = fake.latestMessage(
        GROUP_ID,
        (m) => m.message_id === lead.groupMessageId,
      );
      assert.match(expanded.text, /Заявку підтверджено/);
    },
  );

  await t.test("lead and manager records are persisted to disk", async () => {
    const persisted = await (await fetch(`${appBase}/__test/state`)).json();
    assert.equal(persisted.leads[firstLead].status, "confirmed");
    assert.equal(persisted.managers[String(MANAGER_ID)].phone, "+380971112233");
    const diskLeads = await readFile(
      path.join(tempDataDir, "leads.json"),
      "utf8",
    );
    const diskManagers = await readFile(
      path.join(tempDataDir, "managers.json"),
      "utf8",
    );
    assert.match(diskLeads, /^mood-storage-v1:/);
    assert.match(diskManagers, /^mood-storage-v1:/);
    assert.doesNotMatch(diskLeads, /\+380971112233/);
    assert.doesNotMatch(diskManagers, /\+380971112233/);
  });
});
