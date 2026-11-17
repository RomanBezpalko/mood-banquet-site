import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

const reportDir = path.resolve("qa-report/site-audits");

async function preparePage(page) {
  const browserErrors = [];
  const consoleErrors = [];
  page.on("pageerror", (error) => browserErrors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(message.text());
  });
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await page.evaluate(() => document.fonts?.ready);
  await expect(page.locator("#top")).toBeVisible();
  return { browserErrors, consoleErrors };
}

async function saveAudit(name, data) {
  await mkdir(reportDir, { recursive: true });
  await writeFile(
    path.join(reportDir, `${name}.json`),
    JSON.stringify(data, null, 2),
    "utf8",
  );
}

async function stubLeadApi(page, capture = {}) {
  await page.route("**/api/csrf", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json; charset=utf-8",
      body: JSON.stringify({ ok: true, token: "qa-csrf-token" }),
    });
  });
  await page.route("**/api/lead", async (route) => {
    const request = route.request();
    capture.payload = request.postDataJSON();
    await route.fulfill({
      status: 200,
      contentType: "application/json; charset=utf-8",
      body: JSON.stringify({ ok: true, leadId: "MOOD-QA-TEST" }),
    });
  });
}

async function stubLeadApiWithCsrfRefresh(page, capture = {}) {
  let csrfRequests = 0;
  await page.route("**/api/csrf", async (route) => {
    csrfRequests += 1;
    await route.fulfill({
      status: 200,
      contentType: "application/json; charset=utf-8",
      body: JSON.stringify({
        ok: true,
        token: csrfRequests === 1 ? "stale-csrf-token" : "fresh-csrf-token",
      }),
    });
  });
  await page.route("**/api/lead", async (route) => {
    const request = route.request();
    if (request.headers()["x-csrf-token"] === "stale-csrf-token") {
      await route.fulfill({
        status: 403,
        contentType: "application/json; charset=utf-8",
        body: JSON.stringify({
          ok: false,
          message: "Недійсний токен безпеки.",
        }),
      });
      return;
    }
    capture.payload = request.postDataJSON();
    await route.fulfill({
      status: 200,
      contentType: "application/json; charset=utf-8",
      body: JSON.stringify({ ok: true, leadId: "MOOD-QA-CSRF-REFRESH" }),
    });
  });
}

test("головна сторінка, секції, зображення та зовнішні посилання", async ({
  page,
}, testInfo) => {
  const { browserErrors, consoleErrors } = await preparePage(page);

  await expect(page).toHaveTitle(/Ресторан MOOD/i);
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  for (const id of [
    "about",
    "spaces",
    "menu",
    "events",
    "gallery",
    "contact",
  ]) {
    await expect(page.locator(`#${id}`)).toBeAttached();
  }
  const menuLink = page.locator('a[href*="expz.menu"]').first();
  await expect(menuLink).toBeAttached();
  await expect(menuLink).toHaveAttribute("target", "_blank");
  await expect(menuLink).toHaveAttribute(
    "href",
    "https://expz.menu/52b4c563-f3dd-4fb2-89b6-f556135d32a3",
  );
  expect(
    await page.locator('a[href*="expz.menu"]').count(),
  ).toBeGreaterThanOrEqual(2);
  await expect(
    page.locator('a[aria-label="Instagram MOOD"]').first(),
  ).toHaveAttribute("href", /instagram\.com\/mood\.restaurant\.dnipro/);
  await expect(page.locator('a[href^="tel:"]').first()).toHaveAttribute(
    "href",
    "tel:+380979351746",
  );

  const layout = await page.evaluate(() => ({
    viewportWidth: document.documentElement.clientWidth,
    documentWidth: document.documentElement.scrollWidth,
    viewportHeight: document.documentElement.clientHeight,
    title: document.title,
    sectionCount: [...document.querySelectorAll("main section[id]")].length,
    performance: (() => {
      const navigation = performance.getEntriesByType("navigation")[0];
      const paints = performance.getEntriesByType("paint");
      const lcpEntries = performance.getEntriesByType(
        "largest-contentful-paint",
      );
      const shifts = performance
        .getEntriesByType("layout-shift")
        .filter((entry) => !entry.hadRecentInput);
      const metric = (name) =>
        paints.find((entry) => entry.name === name)?.startTime ?? null;
      return {
        ttfbMs: navigation
          ? Math.round(navigation.responseStart - navigation.requestStart)
          : null,
        domContentLoadedMs: navigation
          ? Math.round(navigation.domContentLoadedEventEnd)
          : null,
        loadEventMs: navigation?.loadEventEnd
          ? Math.round(navigation.loadEventEnd)
          : null,
        fcpMs:
          metric("first-contentful-paint") === null
            ? null
            : Math.round(metric("first-contentful-paint")),
        lcpMs: lcpEntries.length
          ? Math.round(lcpEntries[lcpEntries.length - 1].startTime)
          : null,
        cls: Number(
          shifts.reduce((sum, entry) => sum + entry.value, 0).toFixed(4),
        ),
        resourceCount: performance.getEntriesByType("resource").length,
      };
    })(),
    images: [...document.images].map((img) => ({
      src: img.currentSrc || img.src,
      alt: img.alt,
      loading: img.loading,
      complete: img.complete,
      naturalWidth: img.naturalWidth,
      naturalHeight: img.naturalHeight,
    })),
  }));
  expect(
    layout.documentWidth,
    "Сторінка не повинна мати горизонтального переповнення",
  ).toBeLessThanOrEqual(layout.viewportWidth + 1);
  const brokenImages = layout.images.filter(
    (img) =>
      img.loading !== "lazy" && (!img.complete || img.naturalWidth === 0),
  );

  await page.screenshot({
    path: path.join(
      testInfo.outputDir,
      `${testInfo.project.name}-home-full.png`,
    ),
    fullPage: true,
    animations: "disabled",
  });
  const perf = layout.performance || {};
  const performanceWarnings = [
    ...(perf.fcpMs && perf.fcpMs > 2500 ? ["FCP > 2.5s"] : []),
    ...(perf.lcpMs && perf.lcpMs > 4000 ? ["LCP > 4s"] : []),
    ...(perf.cls > 0.1 ? ["CLS > 0.1"] : []),
  ];
  await saveAudit(`${testInfo.project.name}-layout`, {
    ...layout,
    brokenImages,
    browserErrors,
    consoleErrors,
    performanceWarnings,
  });

  expect(
    browserErrors,
    `Помилки браузера: ${browserErrors.join(" | ")}`,
  ).toEqual([]);
  if (performanceWarnings.length)
    console.warn(
      `[${testInfo.project.name}] Performance warnings: ${performanceWarnings.join(", ")}. Метрики: ${JSON.stringify(perf)}`,
    );
  // Image URLs are hosted externally. Report failures separately so a temporary
  // image CDN outage is visible but does not hide functional test results.
  await testInfo.attach("layout-and-images.json", {
    body: Buffer.from(
      JSON.stringify(
        {
          ...layout,
          brokenImages,
          browserErrors,
          consoleErrors,
          performanceWarnings,
        },
        null,
        2,
      ),
    ),
    contentType: "application/json",
  });
});

test("адаптивність, читабельність і цілі доступності", async ({
  page,
}, testInfo) => {
  await preparePage(page);
  const audit = await page.evaluate(() => {
    const visible = (element) => {
      const style = getComputedStyle(element);
      const rect = element.getBoundingClientRect();
      return (
        style.display !== "none" &&
        style.visibility !== "hidden" &&
        Number(style.opacity) > 0 &&
        rect.width > 0 &&
        rect.height > 0
      );
    };
    const targets = [
      ...document.querySelectorAll(
        "main p, main button, main label, .main-nav a, .header-booking, .hero h1, main h2, main h3, .callback-form input, .calculator-dialog input",
      ),
    ]
      .filter(visible)
      .map((element) => {
        const style = getComputedStyle(element);
        const rect = element.getBoundingClientRect();
        return {
          tag: element.tagName.toLowerCase(),
          text: (
            element.innerText ||
            element.getAttribute("aria-label") ||
            element.getAttribute("placeholder") ||
            ""
          )
            .trim()
            .replace(/\s+/g, " ")
            .slice(0, 100),
          fontSize: Number.parseFloat(style.fontSize),
          lineHeight: style.lineHeight,
          width: Math.round(rect.width),
          height: Math.round(rect.height),
        };
      });
    const bodyCopy = targets.filter((item) =>
      ["p", "label", "input"].includes(item.tag),
    );
    const smallCopy = bodyCopy.filter((item) => item.fontSize < 14);
    const controlsCopy = targets.filter((item) =>
      ["button", "a"].includes(item.tag),
    );
    const smallControls = controlsCopy.filter((item) => item.fontSize < 12);
    const criticallySmall = bodyCopy.filter((item) => item.fontSize < 10);
    const interactive = [
      ...document.querySelectorAll(
        "button, a.button, .menu-toggle, .contact-trigger, .contact-method",
      ),
    ]
      .filter(visible)
      .map((element) => {
        const rect = element.getBoundingClientRect();
        return {
          text: (element.innerText || element.getAttribute("aria-label") || "")
            .trim()
            .slice(0, 70),
          width: Math.round(rect.width),
          height: Math.round(rect.height),
        };
      });
    const undersizedTargets = interactive.filter(
      (item) => item.width < 40 || item.height < 40,
    );
    return {
      viewport: {
        width: document.documentElement.clientWidth,
        height: document.documentElement.clientHeight,
      },
      documentWidth: document.documentElement.scrollWidth,
      smallCopy,
      smallControls,
      criticallySmall,
      undersizedTargets,
      interactive,
      textElements: targets,
    };
  });

  expect(audit.documentWidth).toBeLessThanOrEqual(audit.viewport.width + 1);
  expect(
    audit.criticallySmall,
    "Критично дрібний текст (менше 10px) у основному контенті",
  ).toEqual([]);
  expect(
    audit.undersizedTargets,
    "Основні інтерактивні елементи мають бути не менше 40×40px",
  ).toEqual([]);

  const axe = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
    .analyze();
  const criticalViolations = axe.violations.filter(
    (item) => item.impact === "critical",
  );
  const accessibilitySummary = {
    violationCount: axe.violations.length,
    criticalCount: criticalViolations.length,
    violations: axe.violations.map((item) => ({
      id: item.id,
      impact: item.impact,
      help: item.help,
      nodes: item.nodes.slice(0, 8).map((node) => ({
        target: node.target,
        failureSummary: node.failureSummary,
      })),
    })),
  };
  await saveAudit(`${testInfo.project.name}-readability-accessibility`, {
    ...audit,
    accessibility: accessibilitySummary,
  });
  await testInfo.attach("readability-and-accessibility.json", {
    body: Buffer.from(
      JSON.stringify(
        { ...audit, accessibility: accessibilitySummary },
        null,
        2,
      ),
    ),
    contentType: "application/json",
  });
  expect(criticalViolations, "Критичні порушення доступності").toEqual([]);

  if (
    audit.smallCopy.length ||
    audit.smallControls.length ||
    axe.violations.length
  ) {
    console.warn(
      `[${testInfo.project.name}] QA warnings: ${audit.smallCopy.length} текстових елементів менше 14px; ${audit.smallControls.length} елементів керування менше 12px; ${axe.violations.length} axe-порушень.`,
    );
  }
});

test("кнопки зв’язку, телефон, Viber та Telegram", async ({ page }) => {
  await preparePage(page);
  const trigger = page.getByRole("button", {
    name: /відкрити способи зв’язку/i,
  });
  await expect(trigger).toBeVisible();
  await trigger.click();
  await expect(
    page.getByRole("link", { name: /зателефонувати/i }),
  ).toHaveAttribute("href", "tel:+380979351746");
  await expect(
    page.getByRole("link", { name: /написати у viber/i }),
  ).toHaveAttribute("href", /viber\.me\/380979351746/);
  await expect(page.getByRole("link", { name: /telegram/i })).toHaveAttribute(
    "href",
    /t\.me\/\+380979351746/,
  );
  await page.keyboard.press("Escape");
  await expect(trigger).toBeVisible();
});

test("клієнтські ресурси не містять Telegram-токена", async ({ page }) => {
  await preparePage(page);
  const result = await page.evaluate(async () => {
    const scripts = [...document.scripts]
      .map((script) => script.src)
      .filter(Boolean);
    const contents = await Promise.all(
      scripts.map(async (src) => {
        try {
          return await (await fetch(src)).text();
        } catch {
          return "";
        }
      }),
    );
    const bundle = contents.join("\n");
    return {
      scriptCount: scripts.length,
      hasTokenPattern: /\b\d{7,}:([A-Za-z0-9_-]{25,})\b/.test(bundle),
      exposesBotTokenSetting: /TELEGRAM_BOT_TOKEN/.test(bundle),
    };
  });
  expect(result.scriptCount).toBeGreaterThan(0);
  expect(
    result.hasTokenPattern,
    "Telegram bot token не повинен потрапляти в клієнтські JavaScript-файли",
  ).toBe(false);
  expect(result.exposesBotTokenSetting).toBe(false);
});

test("мобільна навігація відкривається та переходить до секцій", async ({
  page,
}, testInfo) => {
  test.skip(
    !testInfo.project.name.includes("mobile") &&
      !testInfo.project.name.includes("tablet"),
    "Перевірка меню призначена для вузьких екранів.",
  );
  await preparePage(page);
  const toggle = page.getByRole("button", { name: "Відкрити меню" });
  await expect(toggle).toBeVisible();
  await toggle.click();
  await expect(
    page.getByRole("navigation", { name: "Головна навігація" }),
  ).toBeVisible();
  await page
    .getByRole("navigation", { name: "Головна навігація" })
    .getByRole("link", { name: "Контакти" })
    .click();
  await expect(page).toHaveURL(/#contact$/);
  await expect(page.locator("#contact")).toBeInViewport();
});

test("калькулятор: усі кроки, валідація номера та надсилання без Telegram", async ({
  page,
}) => {
  const capture = {};
  await stubLeadApi(page, capture);
  await preparePage(page);
  await page
    .getByRole("button", { name: /розрахувати вартість бенкету/i })
    .first()
    .click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();

  await dialog.getByRole("button", { name: /далі/i }).click();
  await expect(dialog.getByText(/оберіть бажаний формат меню/i)).toBeVisible();
  await dialog.getByRole("button", { name: /далі/i }).click();
  await expect(
    dialog.getByRole("heading", { name: /додаткові побажання/i }),
  ).toBeVisible();
  await dialog.getByRole("button", { name: /далі/i }).click();
  await expect(dialog.getByText(/залиште контактні дані/i)).toBeVisible();

  await dialog.locator('input[autocomplete="name"]').fill("Тест MOOD");
  const phone = dialog.locator("#calculator-phone");
  await phone.fill("abc067123456789");
  await expect(phone).toHaveValue("671234567"); // літери відкинуто, 0 як trunk prefix прибрано, зайві цифри обрізано
  await phone.fill("97123456");
  await expect(dialog.getByRole("button", { name: /далі/i })).toBeVisible();
  await dialog.getByRole("button", { name: /далі/i }).click();
  await expect(dialog.getByRole("alert")).toContainText(/рівно 9 цифр/i);
  await expect(dialog.getByText(/залиште контактні дані/i)).toBeVisible();

  await phone.fill("971234567");
  await dialog.getByRole("button", { name: /далі/i }).click();
  await expect(dialog.getByText(/перевірте ваш запит/i)).toBeVisible();
  await expect(dialog.getByText(/Тест MOOD/)).toBeVisible();
  await dialog.getByRole("button", { name: /надіслати заявку/i }).click();
  await expect(dialog.getByText(/запит сформовано/i)).toBeVisible();
  expect(capture.payload).toMatchObject({
    name: "Тест MOOD",
    phone: "+380971234567",
    source: "Калькулятор бенкету",
  });
});

test("калькулятор утримує клавіатурний фокус усередині діалогу", async ({
  page,
}) => {
  await preparePage(page);
  await page
    .getByRole("button", { name: /розрахувати вартість бенкету/i })
    .first()
    .click();
  const dialog = page.getByRole("dialog");
  const firstFocusable = dialog
    .locator(
      "button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), a[href]",
    )
    .first();
  const lastFocusable = dialog
    .locator(
      "button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), a[href]",
    )
    .last();

  await lastFocusable.focus();
  await page.keyboard.press("Tab");
  await expect(firstFocusable).toBeFocused();

  await page.keyboard.press("Shift+Tab");
  await expect(lastFocusable).toBeFocused();
});

test("форма зворотного дзвінка: валідний номер та успішне підтвердження", async ({
  page,
}) => {
  const capture = {};
  await stubLeadApi(page, capture);
  await preparePage(page);
  const form = page.locator("#contact form");
  await form.scrollIntoViewIfNeeded();
  await form.locator('input[autocomplete="name"]').fill("Тест MOOD");
  await form.locator("#callback-phone").fill("0671234567");
  await form
    .getByRole("button", { name: /замовити зворотний дзвінок/i })
    .click();
  await expect(form.getByText(/дякуємо за звернення/i)).toBeVisible();
  expect(capture.payload).toMatchObject({
    name: "Тест MOOD",
    phone: "+380671234567",
    source: "Форма зворотного дзвінка",
  });
});

test("форма оновлює протермінований CSRF-токен і повторює заявку", async ({
  page,
}) => {
  const capture = {};
  await stubLeadApiWithCsrfRefresh(page, capture);
  await preparePage(page);
  const form = page.locator("#contact form");
  await form.scrollIntoViewIfNeeded();
  await form.locator('input[autocomplete="name"]').fill("Тест CSRF");
  await form.locator("#callback-phone").fill("971112234");
  await form.locator('button[type="submit"]').click();
  await expect(form.locator(".callback-success")).toBeVisible();
  expect(capture.payload.phone).toBe("+380971112234");
});
