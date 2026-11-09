/**
 * Сквозная проверка каркаса в настоящем браузере (Chromium через Playwright):
 * axe (включая контраст) на страницах во всех темах, отсутствие горизонтальной прокрутки на 10 ширинах,
 * текст 200 % с интервалами WCAG 1.4.12 на 320 px, клавиатура и мобильное меню, сценарии 1 (главная → поиск → выдача), 2 (поиск по словам и шифру), 3 (фильтры и ссылка на выдачу).
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
const PAGES = ['/kk', '/ru', '/en/accessibility', '/ru/catalog?q=протокол', '/kk/catalog?type=photo&settlement=ust-kamenogorsk&hasDigitalCopy=true', '/ru/news', '/en/news/demo-catalog-search', '/kk/nonexistent'];
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
    // id документов создаёт база при заполнении, поэтому берём их из API, а не из констант.
    const found = (await (await fetch(`${BASE}/api/v1/catalog/documents?q=${encodeURIComponent('маслозавод')}&lang=ru&pageSize=50`)).json()) as {
      items: Array<{ id: string; title: string; access: string; hasDigitalCopy: boolean }>;
    };
    const openDoc = found.items.find((d) => d.access === 'open' && d.hasDigitalCopy);
    const restrictedDoc = found.items.find((d) => d.access === 'restricted');
    if (!openDoc || !restrictedDoc) throw new Error('в базе нет синтетических документов: выполните npm run db:seed');
    const OPEN_DOC = `/ru/catalog/documents/${openDoc.id}`;
    const RESTRICTED_DOC = `/kk/catalog/documents/${restrictedDoc.id}`;
    PAGES.push(OPEN_DOC, RESTRICTED_DOC, `/en/catalog/documents/${openDoc.id}`);
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
      for (const path of ['/kk', '/ru/accessibility', '/ru/catalog?q=маслозавод&type=photo', OPEN_DOC, RESTRICTED_DOC]) {
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

    {
      // Сценарий 2: найти документ по словам и по архивному шифру; закрытые документы в выдаче не появляются.
      const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
      await openWithPrefs(page, '/ru/catalog', {});
      const box = page.getByRole('searchbox', { name: 'Поиск в электронном каталоге' });
      await box.fill('маслозавод');
      await box.press('Enter');
      await page.getByText(/По запросу «маслозавод» найдено/).waitFor();
      const titles = await page.getByRole('article').getByRole('link').allTextContents();
      check(titles.length >= 2 && titles.every((x) => x.includes('[Синтетика]')), `сценарий 2: выдача по словам (${titles.join(' | ')})`);
      check(!(await page.getByText('Закрытый документ').count()), 'сценарий 2: закрытый документ не найден');
      await box.fill('Ф. TEST-1, Оп. 1, Д. 1');
      await box.press('Enter');
      await page.getByText('Запрос распознан как архивный шифр: Ф. TEST-1. Оп. 1. Д. 1.').waitFor();
      check((await page.getByRole('article').count()) === 3, `сценарий 2: по шифру найдено ${await page.getByRole('article').count()} (ожидалось 3 публичных документа дела)`);
      await page.close();
    }

    {
      // Сценарий 3: сузить выдачу несколькими фильтрами и поделиться ссылкой.
      const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
      await openWithPrefs(page, '/ru/catalog', {});
      const aside = page.getByRole('complementary', { name: 'Фильтры' });
      await aside.getByRole('checkbox', { name: /Усть-Каменогорск/ }).click();
      await page.waitForURL(/settlement=ust-kamenogorsk/);
      await aside.getByRole('checkbox', { name: /Есть электронная копия/ }).click();
      await page.waitForURL(/hasDigitalCopy=true/);
      await page.getByText('Найден 1 документ').waitFor();
      const count = await page.getByRole('article').count();
      check(count === 1, `сценарий 3: два фильтра (город и наличие копии) дают 1 документ (получено ${count})`);
      const shared = page.url();
      const other = await browser.newPage({ viewport: { width: 1280, height: 900 } });
      await openWithPrefs(other, shared.replace(BASE, ''), {});
      await other.getByText('Найден 1 документ').waitFor();
      check((await other.getByRole('article').count()) === count, 'сценарий 3: ссылка на выдачу воспроизводит результат');
      check(await other.getByRole('complementary', { name: 'Фильтры' }).getByRole('checkbox', { name: /Усть-Каменогорск/ }).isChecked(), 'сценарий 3: по ссылке фильтр отмечен');
      check(await other.getByRole('button', { name: /Убрать фильтр «Населённый пункт: Усть-Каменогорск»/ }).isVisible(), 'сценарий 3: выбранный фильтр виден кнопкой');
      await other.close();
      await page.goBack();
      await page.waitForURL((u) => !u.search.includes('hasDigitalCopy'));
      const copyBox = page.getByRole('complementary', { name: 'Фильтры' }).getByRole('checkbox', { name: /Есть электронная копия/ });
      check(!(await copyBox.isChecked()) && page.url().includes('settlement=ust-kamenogorsk'), 'сценарий 3: «Назад» снимает только последний фильтр');
      await page.close();
    }

    {
      // Сценарий 3 на телефоне: фильтры в диалоге, «Показать N документов», Esc и возврат фокуса.
      const page = await browser.newPage({ viewport: { width: 360, height: 780 } });
      await openWithPrefs(page, '/ru/catalog?q=маслозавод', {});
      const open = page.getByRole('button', { name: 'Фильтры' });
      await open.click();
      const dialog = page.getByRole('dialog', { name: 'Фильтры' });
      await dialog.getByRole('checkbox', { name: /Фото/ }).first().click();
      await page.waitForURL(/type=/);
      await page.waitForLoadState('networkidle');
      const violations = await axe(page);
      check(violations.length === 0, `axe диалог фильтров: ${violations.join('; ')}`);
      const [scroll, client] = await page.evaluate(() => [document.documentElement.scrollWidth, document.documentElement.clientWidth]);
      check(scroll <= client, `диалог фильтров без горизонтальной прокрутки: ${scroll} > ${client}`);
      await dialog.getByRole('button', { name: /^Показать/ }).click();
      check(!(await dialog.isVisible()), 'кнопка «Показать» закрывает диалог фильтров');
      check(await page.getByRole('button', { name: 'Фильтры: выбран 1' }).evaluate((el: Element) => el === document.activeElement), 'фокус возвращается на кнопку фильтров');
      await page.close();
    }

    {
      // Сценарий 4: открыть карточку из выдачи и скопировать шифр.
      const context = await browser.newContext({ viewport: { width: 1280, height: 900 }, permissions: ['clipboard-read', 'clipboard-write'] });
      const page = await context.newPage();
      await openWithPrefs(page, '/ru/catalog?q=маслозавод&hasDigitalCopy=true', {});
      await page.getByRole('article').first().getByRole('link').click();
      await page.waitForURL(/\/ru\/catalog\/documents\//);
      const h1 = page.getByRole('heading', { level: 1 });
      await h1.waitFor();
      check(/Протокол заседания/.test((await h1.textContent()) ?? ''), `сценарий 4: открыта карточка (${await h1.textContent()})`);
      check(await page.getByText('Тестовые данные').first().isVisible(), 'сценарий 4: синтетический документ помечен');
      await page.getByRole('button', { name: 'Скопировать шифр' }).click();
      await page.getByTestId('copy-notice').waitFor();
      const clip = await page.evaluate(() => navigator.clipboard.readText());
      check(clip === 'Ф. TEST-1. Оп. 1. Д. 1.', `сценарий 4: в буфере шифр (${clip})`);
      // Announcer ставит текст через 50 мс после очистки, поэтому ждём его, а не читаем сразу.
      const announced = await page.getByTestId('announcer').filter({ hasText: 'скопирован' }).waitFor({ timeout: 3000 }).then(() => true, () => false);
      check(announced, 'сценарий 4: копирование объявлено диктору');
      await context.close();
    }

    {
      // Сценарий 5: листать и масштабировать цифровую копию только клавиатурой; картинка реально загружается.
      const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
      await openWithPrefs(page, OPEN_DOC, {});
      const img = page.locator('.viewer-image');
      await img.waitFor();
      await page.waitForFunction(() => {
        const i = document.querySelector<HTMLImageElement>('.viewer-image');
        return i?.complete && i.naturalWidth > 0;
      });
      check((await img.evaluate((el: Element) => (el as HTMLImageElement).naturalWidth)) > 0, 'сценарий 5: изображение страницы загружено');
      const counter = page.getByTestId('viewer-counter');
      await page.getByRole('region', { name: 'Изображение страницы' }).focus();
      await page.keyboard.press('ArrowRight');
      check((await counter.textContent()) === 'Страница 2 из 3 (лист 2)', `сценарий 5: стрелка вправо (${await counter.textContent()})`);
      check(/\/pages\/2\/image$/.test((await img.getAttribute('src')) ?? ''), 'сценарий 5: показана страница 2');
      const before = await img.evaluate((el: Element) => el.getBoundingClientRect().width);
      await page.keyboard.press('+');
      await page.keyboard.press('+');
      const after = await img.evaluate((el: Element) => el.getBoundingClientRect().width);
      check(after > before * 1.4, `сценарий 5: масштаб «+» увеличивает страницу (${before} → ${after})`);
      const [scroll, client] = await page.evaluate(() => [document.documentElement.scrollWidth, document.documentElement.clientWidth]);
      check(scroll <= client, `сценарий 5: увеличенная страница не растягивает сайт (${scroll} > ${client})`);
      await page.keyboard.press('0');
      check((await page.getByRole('status', { name: 'Масштаб' }).textContent()) === '100%', 'сценарий 5: «0» возвращает масштаб');
      const status = await page.evaluate(async (u) => (await fetch(u)).headers.get('content-security-policy'), (await img.getAttribute('src')) ?? '');
      check(/sandbox/.test(status ?? ''), 'сценарий 5: изображение отдаётся с CSP sandbox');
      await page.close();
    }

    {
      // Сценарий 18 (U14): документ с ограниченным доступом — только условия доступа, копии нет, страницы не отдаются.
      const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
      const requests: string[] = [];
      page.on('request', (r) => requests.push(r.url()));
      await openWithPrefs(page, `/ru/catalog/documents/${restrictedDoc.id}`, {});
      await page.getByTestId('restricted-notice').waitFor();
      check(await page.getByRole('heading', { name: 'Доступ ограничен' }).isVisible(), 'сценарий 18: виден блок «Доступ ограничен»');
      check((await page.locator('.document-viewer, img').count()) === 0, 'сценарий 18: нет просмотрщика и изображений');
      check(!requests.some((u) => u.includes('/pages')), 'сценарий 18: страница не запрашивает список страниц');
      const direct = await page.evaluate(async (id) => [(await fetch(`/api/v1/catalog/documents/${id}/pages`)).status, (await fetch(`/api/v1/catalog/documents/${id}/pages/1/image`)).status], restrictedDoc.id);
      check(direct[0] === 404 && direct[1] === 404, `сценарий 18: прямые запросы страниц и изображения дают 404 (${direct.join(', ')})`);
      await openWithPrefs(page, '/ru/catalog/documents/00000000-0000-4000-8000-000000000000', {});
      const notFound = page.getByRole('heading', { level: 1, name: 'Страница не найдена' });
      await notFound.waitFor();
      check(await notFound.isVisible(), 'сценарий 18: несуществующий документ — страница 404');
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
