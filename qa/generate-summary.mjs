import { readFile, writeFile, mkdir, readdir } from 'node:fs/promises';
import path from 'node:path';

const root = process.cwd();
const reportDir = path.join(root, 'qa-report');
await mkdir(reportDir, { recursive: true });
let results;
try {
  results = JSON.parse(await readFile(path.join(reportDir, 'playwright-results.json'), 'utf8'));
} catch {
  console.error('Не знайдено qa-report/playwright-results.json. Спочатку виконайте npm run qa:site.');
  process.exit(1);
}
const stats = results.stats || {};
const passed = Number(stats.expected || 0);
const failed = Number(stats.unexpected || 0);
const flaky = Number(stats.flaky || 0);
const skipped = Number(stats.skipped || 0);
const total = passed + failed + flaky + skipped;
let auditFiles = [];
try { auditFiles = (await readdir(path.join(reportDir, 'site-audits'))).filter(name => name.endsWith('.json')); } catch {}
const audits = await Promise.all(auditFiles.map(async name => {
  try { return JSON.parse(await readFile(path.join(reportDir, 'site-audits', name), 'utf8')); }
  catch { return {}; }
}));
const smallTextCount = audits.reduce((sum, audit) => sum + (audit.smallCopy?.length || 0), 0);
const smallControlCount = audits.reduce((sum, audit) => sum + (audit.smallControls?.length || 0), 0);
const axeCount = audits.reduce((sum, audit) => sum + (audit.accessibility?.violationCount || 0), 0);
const axeCriticalCount = audits.reduce((sum, audit) => sum + (audit.accessibility?.criticalCount || 0), 0);
const brokenImageCount = audits.reduce((sum, audit) => sum + (audit.brokenImages?.length || 0), 0);
const performanceWarningCount = audits.reduce((sum, audit) => sum + (audit.performanceWarnings?.length || 0), 0);
const lines = [
  '# MOOD QA — звіт автоматизованої перевірки',
  '',
  `Дата: ${new Date().toLocaleString('uk-UA', { timeZone: 'Europe/Kyiv' })}`,
  '',
  '## Підсумок',
  '',
  `- Усього: ${total}`,
  `- Успішно: ${passed}`,
  `- Помилки: ${failed + flaky}`,
  `- Пропущено: ${skipped}`,
  `- Тривалість: ${Math.round(Number(stats.duration || 0) / 1000)} с`,
  '',
  '## Аудит відображення (сума для всіх viewport)',
  '',
  `- Текстові елементи менше 14px: ${smallTextCount}`,
  `- Елементи керування з текстом менше 12px: ${smallControlCount}`,
  `- Axe-порушення: ${axeCount} (критичних: ${axeCriticalCount})`,
  `- Зображення, які не завантажилися: ${brokenImageCount}`,
  `- Попередження продуктивності (FCP/LCP/CLS): ${performanceWarningCount}`,
  '',
  '## Середовище',
  '',
  '- Браузер: Chromium через Playwright.',
  '- Екрани: 1366×900, 820×1180, 390×844, 360×800.',
  '- Форми: `/api/lead` імітується на рівні браузера; реальні Telegram-повідомлення не надсилаються.',
  '- Доступність: axe-core за WCAG 2.0/2.1 A/AA; критичні порушення блокують тест.',
  '- Продуктивність: TTFB, DOMContentLoaded, load, FCP, LCP та CLS з Performance API.',
  '',
  '## Артефакти',
  '',
  '- `qa-report/site-audits/` — JSON-звіти про адаптивність, текст, доступність і продуктивність.',
  '- `qa-report/test-results/` — скриншоти, відео та trace для невдалих сценаріїв.',
  '- `qa-report/playwright-html/` — інтерактивний HTML-звіт Playwright.',
  '- `qa-report/playwright-results.json` — машинозчитуваний результат.',
  '',
  'Ці показники є діагностикою; перевіряйте відповідні JSON-файли та скриншоти перед випуском.'
];
await writeFile(path.join(reportDir, 'MOOD-QA-SUMMARY.md'), lines.join('\n'), 'utf8');
console.log(`Звіт створено: ${path.join(reportDir, 'MOOD-QA-SUMMARY.md')}`);
