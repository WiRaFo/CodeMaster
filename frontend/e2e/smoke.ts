/**
 * Сквозная проверка каркаса в настоящем браузере (Chromium через Playwright):
 * axe (включая контраст) на страницах во всех темах, отсутствие горизонтальной прокрутки на 10 ширинах,
 * текст 200 % с интервалами WCAG 1.4.12 на 320 px, клавиатура и мобильное меню, сценарий 1 (главная → поиск → выдача).
 * Запуск: npm run e2e -w frontend (собирает и поднимает vite preview). Нужен API на :3000 с сидами migrated, synthetic, demo.
 */
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { chromium, type Page } from 'playwright';

const require = createRequire(import.meta.url);
const AXE_PATH = require.resolve('axe-core/axe.min.js');
const PORT = 4174;
const BASE = `http://127.0.0.1:${PORT}`;
const WIDTHS = [320, 360, 375, 390, 430, 768, 1024, 1280, 1440, 1920];
const PAGES = ['/kk', '/ru', '/en/accessibility', '/ru/catalog?q=протокол', '/ru/news', '/en/news/demo-catalog-search', '/kk/nonexistent'];
const THEMES: Array<[string, Record<string, unknown>]> = [
  ['light', { scheme: 'light' }],
  ['dark', { scheme: 'dark' }],
  ['alt', { scheme: 'alt' }],
  ['high-contrast light', { scheme: 'light', highContrast: true }],
  ['high-contrast dark', { scheme: 'dark', highContrast: true }],
];

const failures: string[] = [];
let checks = 0;
const check = (ok: boolean, message: string) => {
  checks += 1;
  if (!ok) failures.push(message);
};

async function waitForServer(url: string): Promise<void> {
  for (let i = 0; i < 50; i++) {
    try {
      if ((await fetch(url)).ok) return;
    } catch {
      // сервер ещё стартует
    }
    await new Promise((r) => setTimeout(r, 200));
  }
  throw new Error(`Сервер ${url} не запустился`);
}

async function openWithPrefs(page: Page, path: string, prefs: Record<string, unknown>) {
  // Начальные настройки записываются один раз, чтобы перезагрузка проверяла их сохранение, а не повторную запись.
  if (Object.keys(prefs).length) {
    await page.addInitScript((p: Record<string, unknown>) => {
      if (!sessionStorage.getItem('e2e-prefs-set')) {
        localStorage.setItem('archive-vko:a11y', JSON.stringify(p));
        sessionStorage.setItem('e2e-prefs-set', '1');
      }
    }, prefs);
  }
  await page.goto(BASE + path);
  await page.locator('h1').waitFor();
  await page.waitForLoadState('networkidle');
}

async function axe(page: Page): Promise<string[]> {
  await page.addScriptTag({ path: AXE_PATH });
  return page.evaluate(async () => {
    const w = window as unknown as { axe: { run: (ctx: Document, opts: object) => Promise<{ violations: Array<{ id: string; nodes: Array<{ target: string[] }> }> }> } };
    const result = await w.axe.run(document, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa', 'best-practice'] } });
    return result.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).slice(0, 3).join(', ')}`);
  });
}

async function main() {
  const server = spawn('npx', ['vite', 'preview', '--port', String(PORT), '--strictPort'], { stdio: 'ignore' });
  try {
    await waitForServer(BASE);
    const browser = await chromium.launch();

    for (const [name, prefs] of THEMES) {
      for (const path of PAGES) {
        const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
        await openWithPrefs(page, path, prefs);
        const violations = await axe(page);
        check(violations.length === 0, `axe ${name} ${path}: ${violations.join('; ')}`);
        await page.close();
      }
    }

    for (const width of WIDTHS) {
      for (const path of ['/kk', '/ru/accessibility']) {
        const page = await browser.newPage({ viewport: { width, height: 800 } });
        await openWithPrefs(page, path, {});
        const [scroll, client] = await page.evaluate(() => [document.documentElement.scrollWidth, document.documentElement.clientWidth]);
        check(scroll <= client, `горизонтальная прокрутка ${path} на ${width}px: ${scroll} > ${client}`);
        const searchVisible = await page.locator('#site-search').evaluate((el: Element) => {
          const r = el.getBoundingClientRect();
          return r.left >= 0 && r.right <= window.innerWidth;
        });
        check(searchVisible, `поиск за краем экрана на ${width}px`);
        await page.close();
      }
    }

    {
      const page = await browser.newPage({ viewport: { width: 320, height: 800 } });
      await openWithPrefs(page, '/kk', { fontScale: 200, lineHeight: '2', letterSpacing: '0.16' });
      const [scroll, client] = await page.evaluate(() => [document.documentElement.scrollWidth, document.documentElement.clientWidth]);
      check(scroll <= client, `текст 200 % и интервалы 1.4.12 на 320px: прокрутка ${scroll} > ${client}`);
      await page.close();
    }

    {
      const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
      await openWithPrefs(page, '/ru', {});
      await page.keyboard.press('Tab');
      const first = await page.evaluate(() => ({
        text: document.activeElement?.textContent,
        outline: getComputedStyle(document.activeElement as Element).outlineWidth,
        visible: (document.activeElement as HTMLElement).getBoundingClientRect().width > 1,
      }));
      check(first.text === 'Перейти к основному содержимому', `первый Tab: ${first.text}`);
      check(first.visible && first.outline === '3px', `ссылка пропуска видима и с фокусом 3px: ${JSON.stringify(first)}`);
      await page.keyboard.press('Enter');
      check((await page.evaluate(() => document.activeElement?.id)) === 'main', 'Enter на ссылке пропуска переводит фокус в main');
      await page.close();
    }

    {
      const page = await browser.newPage({ viewport: { width: 360, height: 780 } });
      await openWithPrefs(page, '/ru', {});
      const menuButton = page.getByRole('button', { name: 'Меню' });
      await menuButton.click();
      const dialog = page.getByRole('dialog', { name: 'Разделы сайта' });
      check(await dialog.isVisible(), 'мобильное меню открывается');
      check((await dialog.getByRole('link').count()) === 10, 'в мобильном меню 10 разделов');
      const violations = await axe(page);
      check(violations.length === 0, `axe мобильное меню: ${violations.join('; ')}`);
      await page.keyboard.press('Escape');
      check(!(await dialog.isVisible()), 'Esc закрывает меню');
      check(await menuButton.evaluate((el: Element) => el === document.activeElement), 'фокус возвращается на кнопку меню');
      await page.close();
    }

    {
      const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
      await openWithPrefs(page, '/en', {});
      await page.getByRole('button', { name: 'Accessibility' }).click();
      const panel = page.getByRole('dialog', { name: 'Accessibility settings' });
      await panel.getByRole('radio', { name: '150 %' }).check();
      const fontSize = await page.evaluate(() => getComputedStyle(document.documentElement).fontSize);
      check(fontSize === '24px', `текст 150 % даёт 24px: ${fontSize}`);
      const violations = await axe(page);
      check(violations.length === 0, `axe панель доступности: ${violations.join('; ')}`);
      await page.reload();
      await page.locator('h1').waitFor();
      check((await page.evaluate(() => getComputedStyle(document.documentElement).fontSize)) === '24px', 'настройка сохраняется после перезагрузки');
      await page.close();
    }

    {
      // Сценарий 1 (docs/development-roadmap.md, ЭТАП 4): с главной только клавиатурой найти документ в каталоге.
      const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
      await openWithPrefs(page, '/ru', {});
      for (const block of ['Электронный каталог', 'История в документах', 'Онлайн-выставки', 'Наши филиалы', 'Новости и события']) {
        check(await page.getByRole('heading', { level: 2, name: block }).isVisible(), `главная: блок «${block}»`);
      }
      check((await page.getByText('Демо', { exact: true }).count()) > 0, 'главная: демо-записи помечены');
      const input = page.getByRole('searchbox', { name: 'Поиск в электронном каталоге' });
      await input.focus();
      await page.keyboard.type('протокол заседания');
      await page.keyboard.press('Enter');
      await page.waitForURL(/\/ru\/catalog\?q=/);
      const status = page.getByText(/По запросу «протокол заседания» найден/);
      await status.waitFor();
      check(await status.isVisible(), 'сценарий 1: выдача показывает число найденных документов');
      const first = page.getByRole('article').first().getByRole('link');
      check(/Протокол заседания/.test((await first.textContent()) ?? ''), `сценарий 1: первый результат — протокол (${await first.textContent()})`);
      await page.goBack();
      await page.locator('h1').waitFor();
      check(page.url().endsWith('/ru'), 'сценарий 1: «Назад» возвращает на главную');
      await page.close();
    }

    await browser.close();
  } finally {
    server.kill();
  }

  console.log(`e2e: ${checks - failures.length}/${checks} проверок пройдено`);
  if (failures.length) {
    for (const f of failures) console.error(`  ✗ ${f}`);
    process.exit(1);
  }
}

await main();
