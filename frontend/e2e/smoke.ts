/**
 * Сквозная проверка каркаса в настоящем браузере (Chromium через Playwright):
 * axe (включая контраст) на страницах во всех темах, отсутствие горизонтальной прокрутки на 10 ширинах,
 * текст 200 % с интервалами WCAG 1.4.12 на 320 px, клавиатура и мобильное меню, сценарии 1 (главная → поиск → выдача), 2 (поиск по словам и шифру), 3 (фильтры и ссылка на выдачу).
 * Запуск: npm run e2e -w frontend (собирает и поднимает vite preview). Нужен API на :3000 с сидами migrated, synthetic, demo.
 */
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { chromium, type Browser, type Page } from 'playwright';

const require = createRequire(import.meta.url);
// axe подключается через evaluate (протокол отладки), а не тегом <script>: тег запретила бы CSP сайта.
const AXE_SOURCE = readFileSync(require.resolve('axe-core/axe.min.js'), 'utf8');
const PORT = 4174;
const BASE = `http://127.0.0.1:${PORT}`;
const WIDTHS = [320, 360, 375, 390, 430, 768, 1024, 1280, 1440, 1920];
const PAGES = ['/kk', '/ru', '/en/accessibility', '/ru/catalog?q=протокол', '/kk/catalog?type=photo&settlement=ust-kamenogorsk&hasDigitalCopy=true', '/ru/news', '/en/news/demo-catalog-search', '/kk/nonexistent', '/ru/exhibitions', '/kk/exhibitions/demo-exhibition-example', '/en/exhibitions/demo-exhibition-example/2', '/ru/branches', '/kk/branches/main', '/en/branches/ridder', '/kk/assistant', '/ru/history', '/kk/history/demo-how-to-read-archive-code', '/en/faq', '/ru/feedback', '/kk/visitors', '/ru/about', '/en/about/structure', '/kk/branches/ulan', '/ru/calendar', '/kk/calendar?year=2024', '/kk/anticorruption'];
const THEMES: Array<[string, Record<string, unknown>]> = [
  ['light', { scheme: 'light' }],
  ['dark', { scheme: 'dark' }],
  ['alt', { scheme: 'alt' }],
  ['high-contrast light', { scheme: 'light', highContrast: true }],
  ['high-contrast dark', { scheme: 'dark', highContrast: true }],
];

/** Учётные записи для сценариев 9–12 берутся из backend/.env (сиды создают их с теми же паролями). */
function staffCredentials() {
  const env: Record<string, string> = {};
  try {
    for (const line of readFileSync(new URL('../../backend/.env', import.meta.url), 'utf8').split('\n')) {
      const m = /^([A-Z_]+)=(.*)$/.exec(line.trim());
      if (m?.[1] && m[2] !== undefined) env[m[1]] = m[2];
    }
  } catch {
    // нет файла — берём только из окружения
  }
  const get = (k: string) => process.env[k] ?? env[k] ?? '';
  return {
    admin: { email: get('SEED_ADMIN_EMAIL'), password: get('SEED_ADMIN_PASSWORD') },
    archivist: { email: 'archivist@archive.local', password: get('SEED_DEMO_STAFF_PASSWORD') },
    moderator: { email: 'moderator@archive.local', password: get('SEED_DEMO_STAFF_PASSWORD') },
  };
}

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
  if (!(await page.evaluate(() => 'axe' in window))) await page.evaluate(AXE_SOURCE);
  // Контраст проверяется по итоговому виду: ждём конца конечных анимаций (появление диалогов, всплывающих окон).
  await page.evaluate(() =>
    Promise.all(document.getAnimations().filter((x) => x.effect?.getComputedTiming().iterations !== Infinity).map((x) => x.finished.catch(() => undefined))),
  );
  return page.evaluate(async () => {
    type Node = { target: string[]; any: Array<{ data?: { messageKey?: string } | null }> };
    type Rule = { id: string; nodes: Node[] };
    const w = window as unknown as { axe: { run: (ctx: Document, opts: object) => Promise<{ violations: Rule[]; incomplete: Rule[] }> } };
    const result = await w.axe.run(document, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa', 'best-practice'] } });
    // Текст цвета фона axe относит к «неполным» (возможно, скрытый текст), а не к нарушениям. Для нас это ошибка.
    const sameColor = result.incomplete
      .filter((r) => r.id === 'color-contrast')
      .map((r) => ({ id: 'color-contrast-equal', nodes: r.nodes.filter((n) => n.any.some((c) => c.data?.messageKey === 'equalRatio')) }))
      .filter((r) => r.nodes.length > 0);
    return [...result.violations, ...sameColor].map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).slice(0, 3).join(', ')}`);
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
    // Любое нарушение CSP сборки (встроенный скрипт без хеша, чужой адрес) — ошибка проверки.
    const cspViolations: string[] = [];
    const newPage = browser.newPage.bind(browser);
    browser.newPage = async (options) => {
      const page = await newPage(options);
      page.on('console', (msg) => {
        if (/Content Security Policy/i.test(msg.text())) cspViolations.push(`${page.url()}: ${msg.text().slice(0, 200)}`);
      });
      return page;
    };

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
      for (const path of ['/kk', '/ru/accessibility', '/ru/catalog?q=маслозавод&type=photo', OPEN_DOC, RESTRICTED_DOC, '/ru/branches', '/ru/branches/main']) {
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
      check(await dialog.waitFor({ timeout: 3000 }).then(() => true, () => false), 'мобильное меню открывается');
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
      // Сценарий 13 (ЭТАП 11a): переключение языка ведёт на ту же страницу с теми же фильтрами; интерфейс полностью переведён.
      const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
      await openWithPrefs(page, '/ru/catalog?q=маслозавод&hasDigitalCopy=true', {});
      await page.getByRole('navigation', { name: 'Язык сайта' }).getByRole('link', { name: 'KZ' }).click();
      await page.waitForURL(/\/kk\/catalog\?/);
      const kkUrl = new URL(page.url());
      check(kkUrl.searchParams.get('q') === 'маслозавод' && kkUrl.searchParams.get('hasDigitalCopy') === 'true', `сценарий 13: запрос и фильтр сохранились при смене языка (${kkUrl.search})`);
      const kkFound = await page.getByText(/«маслозавод» сұрауы бойынша \d+ құжат табылды/).waitFor({ timeout: 5000 }).then(() => true, () => false);
      check(kkFound, 'сценарий 13: выдача на казахском');
      check((await page.evaluate(() => document.documentElement.lang)) === 'kk', 'сценарий 13: lang="kk" после переключения');
      await page.getByRole('article').first().getByRole('link').click();
      await page.waitForURL(/\/kk\/catalog\/documents\//);
      await page.locator('.document-meta').waitFor();
      check(await page.getByText('Мұрағаттық шифр', { exact: true }).isVisible(), 'сценарий 13: подписи карточки на казахском');
      check(await page.getByText(/^Қ\. TEST-1\. Тізб\. 1\. Іс 1\./).first().isVisible(), 'сценарий 13: шифр с казахскими сокращениями');
      await page.getByRole('navigation', { name: 'Сайт тілі' }).getByRole('link', { name: 'EN' }).click();
      await page.waitForURL(/\/en\/catalog\/documents\//);
      await page.getByText('Archive reference', { exact: true }).waitFor();
      check(await page.getByText(/^F\. TEST-1\. Inv\. 1\. File 1\./).first().isVisible(), 'сценарий 13: шифр с английскими сокращениями');
      await page.goto(BASE + '/');
      await page.waitForURL(/\/en$/);
      check(new URL(page.url()).pathname === '/en', 'сценарий 13: корень сайта открывает последний выбранный язык');

      // Каждая P0-страница на каждом языке: верный lang, нет сырых ключей словаря, в оболочке английской версии нет кириллицы.
      const p0 = ['', '/catalog?q=маслозавод', OPEN_DOC.replace(/^\/ru/, ''), RESTRICTED_DOC.replace(/^\/kk/, ''), '/news', '/accessibility', '/no-such-page'];
      for (const lang of ['kk', 'ru', 'en']) {
        for (const path of p0) {
          await page.goto(`${BASE}/${lang}${path}`);
          await page.locator('h1').waitFor();
          await page.waitForLoadState('networkidle');
          const info = await page.evaluate(() => {
            const chrome = [...document.querySelectorAll('header, footer, nav, h1, dt, label, button')].map((e) => (e as HTMLElement).innerText).join('\n');
            return { lang: document.documentElement.lang, body: document.body.innerText, chrome };
          });
          const where = `/${lang}${path.split('?')[0]}`;
          check(info.lang === lang, `сценарий 13: ${where} lang="${info.lang}"`);
          const raw = /\b(site|nav|header|lang|theme|a11y|footer|home|catalog|document|news|origin|content|common|notFound|search|stub|accessibilityPage|catalogSearch)\.[a-zA-Z]+/.exec(info.body);
          check(!raw, `сценарий 13: ${where} без сырых ключей словаря${raw ? ` (${raw[0]})` : ''}`);
          if (lang === 'en') {
            // Самоназвания языков в переключателе (Қазақша, Русский) — в атрибуте title, не в тексте.
            const cyr = /[А-Яа-яЁёӘәҒғҚқҢңӨөҰұҮүҺһІі][^\n]*/.exec(info.chrome);
            check(!cyr, `сценарий 13: ${where} оболочка без кириллицы${cyr ? ` («${cyr[0].slice(0, 40)}»)` : ''}`);
          }
        }
      }
      await page.close();
    }

    {
      // Сценарии 14–15: тема и настройки доступности сохраняются при переходах, смене языка и перезагрузке.
      const page = await browser.newPage({ viewport: { width: 1280, height: 900 }, colorScheme: 'light' });
      await openWithPrefs(page, '/kk', {});
      await page.getByRole('button', { name: 'Қараңғы тақырыпты қосу' }).click();
      check((await page.evaluate(() => document.documentElement.dataset.theme)) === 'dark', 'сценарий 14: тёмная тема включается без перезагрузки');
      await page.getByRole('button', { name: 'Қолжетімділік', exact: true }).click();
      const panel = page.getByRole('dialog', { name: 'Қолжетімділік баптаулары' });
      await panel.getByRole('checkbox', { name: 'Жоғары контраст' }).check();
      await page.keyboard.press('Escape');
      await page.getByRole('banner').getByRole('link', { name: 'Электрондық каталог' }).first().click();
      await page.waitForURL(/\/kk\/catalog/);
      await page.getByRole('navigation', { name: 'Сайт тілі' }).getByRole('link', { name: 'RU' }).click();
      await page.waitForURL(/\/ru\/catalog/);
      await page.reload();
      await page.locator('h1').waitFor();
      const state = await page.evaluate(() => ({ theme: document.documentElement.dataset.theme, contrast: document.documentElement.dataset.contrast, lang: document.documentElement.lang }));
      check(state.theme === 'dark', `сценарий 14: тема сохранилась после перехода, смены языка и перезагрузки (${state.theme})`);
      check(state.contrast === 'high', `сценарий 15: высокая контрастность сохранилась (${state.contrast})`);
      check(state.lang === 'ru', 'сценарий 15: язык сменился, настройки остались');
      check(await page.getByRole('button', { name: 'Включить светлую тему' }).isVisible(), 'сценарий 14: кнопка темы подписана на новом языке');
      await page.close();
    }

    {
      // Сценарий 7 (ЭТАП 8): пройти онлайн-выставку от первого до последнего экспоната, фильтр по тематике.
      const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
      await openWithPrefs(page, '/ru/exhibitions', {});
      await page.getByRole('heading', { level: 2, name: /Пример виртуальной выставки/ }).waitFor();
      check((await page.getByRole('article').count()) === 2, 'сценарий 7: в списке две демо-выставки');
      await page.getByRole('combobox', { name: 'Тематика' }).selectOption('culture_art');
      await page.getByRole('button', { name: 'Показать' }).click();
      await page.waitForURL(/topic=culture_art/);
      const filtered = await page.waitForFunction(() => {
        const cards = [...document.querySelectorAll('#main article')];
        return cards.length === 1 && cards[0]?.textContent?.includes('Пример тематической подборки');
      }, undefined, { timeout: 5000 }).then(() => true, () => false);
      check(filtered, 'сценарий 7: фильтр по тематике оставляет одну выставку');
      await page.getByRole('link', { name: 'Сбросить' }).click();
      await page.getByRole('link', { name: /Пример виртуальной выставки/ }).click();
      await page.getByRole('link', { name: 'Начать просмотр' }).waitFor();
      check((await axe(page)).length === 0, `axe страница выставки: ${(await axe(page)).join('; ')}`);
      await page.getByRole('link', { name: 'Начать просмотр' }).click();
      await page.getByTestId('exhibit-counter').filter({ hasText: 'Экспонат 1 из 4' }).waitFor();
      await page.waitForFunction(() => {
        const i = document.querySelector<HTMLImageElement>('.exhibit-image');
        return i?.complete && i.naturalWidth > 0;
      });
      check(true, 'сценарий 7: изображение первого экспоната загружено');
      check((await axe(page)).length === 0, `axe экспонат: ${(await axe(page)).join('; ')}`);
      // Клавиатура: увеличение и переход стрелкой из области изображения.
      await page.getByRole('region', { name: 'Изображение экспоната' }).focus();
      await page.keyboard.press('+');
      check((await page.locator('output').textContent()) === '125%', 'сценарий 7: «+» увеличивает изображение');
      await page.keyboard.press('ArrowRight');
      await page.getByTestId('exhibit-counter').filter({ hasText: 'Экспонат 2 из 4' }).waitFor();
      check(await page.getByRole('link', { name: /Ф\. TEST-1\. Оп\. 1\. Д\. 1\./ }).isVisible(), 'сценарий 7: экспонат ссылается на карточку документа с шифром');
      for (const n of [3, 4]) {
        await page.getByRole('link', { name: 'Следующий экспонат' }).focus();
        await page.keyboard.press('Enter');
        await page.getByTestId('exhibit-counter').filter({ hasText: `Экспонат ${n} из 4` }).waitFor();
      }
      check(!(await page.getByRole('link', { name: 'Следующий экспонат' }).count()), 'сценарий 7: у последнего экспоната нет «Следующий»');
      await page.getByRole('link', { name: 'Вернуться к началу выставки' }).click();
      await page.getByTestId('exhibit-counter').filter({ hasText: 'Экспонат 1 из 4' }).waitFor();
      check(true, 'сценарий 7: с последнего экспоната можно вернуться к первому');
      await page.close();
    }

    {
      // Сценарий 8 (ЭТАП 9): найти филиал по историческому названию города, открыть карточку, построить маршрут.
      const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
      const page = await context.newPage();
      await openWithPrefs(page, '/ru/branches', {});
      await page.getByText('Найдено подразделений: 15').waitFor();
      check(await page.getByTestId('map-pending').isVisible(), 'сценарий 8: без сверенных координат вместо карты — пояснение');
      check(!(await page.getByTestId('branch-map').count()), 'сценарий 8: карта не показывается без координат');
      await page.getByRole('searchbox', { name: 'Название или населённый пункт' }).fill('Лениногорск');
      await page.keyboard.press('Enter');
      await page.waitForURL(/q=/);
      const found = await page.waitForFunction(() => {
        const cards = [...document.querySelectorAll('#main article')];
        return cards.length === 1 && cards[0]?.textContent?.includes('Риддер');
      }, undefined, { timeout: 5000 }).then(() => true, () => false);
      check(found, 'сценарий 8: поиск по историческому названию «Лениногорск» находит филиал в Риддере');
      await page.getByRole('link', { name: 'Сбросить' }).click();
      await page.getByRole('link', { name: 'Государственный архив Восточно-Казахстанской области', exact: true }).click();
      await page.getByRole('heading', { level: 2, name: 'Как добраться' }).waitFor();
      check(await page.getByText('Сверено архивом: 2026-11-10.').isVisible(), 'сценарий 8: сведения, переданные архивом, помечены датой сверки');
      // Геолокация без разрешения: страница работает, остаётся ввод адреса.
      await page.getByRole('button', { name: 'Определить моё местоположение' }).click();
      const denied = await page.getByText('Не удалось определить местоположение').waitFor({ timeout: 5000 }).then(() => true, () => false);
      check(denied, 'сценарий 8: отказ в геолокации показывает понятное сообщение');
      await page.getByRole('radio', { name: 'Пешком' }).check();
      await page.getByRole('textbox', { name: 'Откуда' }).fill('ул. Крылова, 39');
      const google = new URL((await page.getByRole('link', { name: /Маршрут в Google Картах/ }).getAttribute('href')) ?? '');
      check(
        google.searchParams.get('destination') === 'г. Усть-Каменогорск, ул. Бейбітшілік, 26/1 (Головкова, 26/1)' && google.searchParams.get('travelmode') === 'walking' && google.searchParams.get('origin') === 'ул. Крылова, 39',
        `сценарий 8: ссылка маршрута Google: ${google.toString()}`,
      );
      check((await axe(page)).length === 0, `axe карточка филиала: ${(await axe(page)).join('; ')}`);
      // Разрешённая геолокация: отправная точка — координаты пользователя.
      await context.grantPermissions(['geolocation']);
      await context.setGeolocation({ latitude: 49.95, longitude: 82.62 });
      await page.getByRole('button', { name: 'Определить моё местоположение' }).click();
      const here = await page.waitForFunction(() => document.querySelector<HTMLAnchorElement>('a[href*="google.com/maps"]')?.href.includes('origin=49.95%2C82.62'), undefined, { timeout: 5000 }).then(() => true, () => false);
      check(here, 'сценарий 8: после разрешения маршрут строится от местоположения пользователя');
      await context.close();
    }

    {
      // Сценарий 8, карта: подставляем координаты в ответ API (в базе их нет, пока архив не сверил). Тайлы не грузим.
      const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
      await page.route('https://tile.openstreetmap.org/**', (r) => r.abort());
      await page.route(/\/api\/v1\/branches\?/, async (r) => {
        const res = await r.fetch();
        const body = (await res.json()) as { items: Array<{ slug: string; coordinates: unknown }> };
        for (const b of body.items) if (b.slug === 'main') b.coordinates = { lat: 49.95, lng: 82.61 };
        await r.fulfill({ response: res, json: body });
      });
      await openWithPrefs(page, '/ru/branches', {});
      const marker = page.locator('[data-testid=branch-map] .leaflet-marker-icon');
      await marker.first().waitFor();
      check((await marker.count()) === 1, 'сценарий 8: на карте только подразделения с координатами');
      await marker.focus();
      await page.keyboard.press('Enter');
      const popup = await page.getByRole('link', { name: 'Подробнее' }).waitFor({ timeout: 5000 }).then(() => true, () => false);
      check(popup, 'сценарий 8: маркер открывается с клавиатуры, в подсказке ссылка на карточку');
      check((await page.locator('#main article').count()) === 15, 'сценарий 8: при карте список подразделений остаётся полным');
      // Подсказка Leaflet появляется с анимацией прозрачности; axe проверяем после её окончания.
      await page.waitForFunction(() => getComputedStyle(document.querySelector('.leaflet-popup') as Element).opacity === '1');
      const mapAxe = await axe(page);
      check(mapAxe.length === 0, `axe страница филиалов с картой: ${mapAxe.join('; ')}`);
      await page.close();
    }

    {
      // Сценарий 16 (ЭТАП 12): пример ТЗ §5.8 Б через помощника; вопрос о заявлении; термин на английском.
      const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
      await openWithPrefs(page, '/kk/assistant', {});
      await page.getByRole('button', { name: '1960 жылдардағы Өскемен фотосуреттері' }).click();
      const answer = page.getByTestId('assistant-answer').last();
      await answer.getByTestId('recognized').waitFor();
      const chips = (await answer.getByTestId('recognized').innerText()).replace(/\s+/g, ' ');
      check(chips.includes('1960–1969') && chips.includes('Өскемен') && chips.includes('Фотосуреттер'), `сценарий 16: распознаны годы, город и тип: ${chips}`);
      const assistantAxe = await axe(page);
      check(assistantAxe.length === 0, `axe ответ помощника: ${assistantAxe.join('; ')}`);
      await answer.getByRole('link', { name: /Ф\.|Қ\./ }).first().click();
      const opened = await page.locator('h1').filter({ hasText: /фотосурет/i }).waitFor({ timeout: 5000 }).then(() => true, () => false);
      check(opened, 'сценарий 16: ссылка из ответа открывает карточку документа');
      await page.goBack();
      await openWithPrefs(page, '/ru/assistant', {});
      await page.getByRole('textbox', { name: 'Ваш вопрос' }).fill('Хочу заказать копию документа');
      await page.keyboard.press('Enter');
      const service = page.getByTestId('assistant-answer').last();
      await service.getByText(/не принимаются/).waitFor();
      check((await service.locator('a[href*="/catalog/documents/"]').count()) === 0, 'сценарий 16: на просьбу о заказе нет ссылок на документы');
      check(await service.getByRole('link', { name: 'Посетителям' }).isVisible(), 'сценарий 16: на просьбу о заказе — ссылка «Посетителям»');
      await openWithPrefs(page, `/en/assistant?q=${encodeURIComponent('What is an inventory?')}`, {});
      const term = await page.getByTestId('assistant-answer').getByText(/An inventory is a list/).waitFor({ timeout: 5000 }).then(() => true, () => false);
      check(term, 'сценарий 16: термин объясняется на английском');
      await page.close();
    }

    {
      // Сценарий 17 (ЭТАП 7): с главной в цифровую историю и к публикации; отзыв о сайте с клавиатуры.
      const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
      await openWithPrefs(page, '/ru/history', {});
      await page.getByRole('link', { name: /История семьи и поколений/ }).click();
      await page.waitForURL(/topic=family/);
      await page.getByRole('link', { name: /Как подготовиться к работе в читальном зале/ }).click();
      const story = await page.getByRole('heading', { level: 1, name: /Как подготовиться/ }).waitFor({ timeout: 5000 }).then(() => true, () => false);
      check(story, 'сценарий 17: тематика ведёт к публикации');
      check(await page.getByText('Демонстрационный материал команды разработки', { exact: false }).first().isVisible(), 'сценарий 17: у публикации указан источник');

      await openWithPrefs(page, '/ru/feedback', {});
      await page.getByRole('button', { name: 'Отправить' }).click();
      const focused = await page.waitForFunction(() => document.activeElement?.getAttribute('role') === 'alert', undefined, { timeout: 3000 }).then(() => true, () => false);
      check(focused, 'сценарий 17: при ошибках фокус на сводке ошибок');
      await page.getByRole('combobox', { name: 'Тема' }).selectOption('site');
      await page.getByRole('textbox', { name: /Сообщение/ }).fill('[e2e] Проверка формы отзывов');
      await page.getByRole('button', { name: 'Отправить' }).click();
      const sent = await page.getByText('Спасибо! Отзыв отправлен.').waitFor({ timeout: 5000 }).then(() => true, () => false);
      check(sent, 'сценарий 17: отзыв отправлен');
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
      // URL меняется раньше, чем заголовок каталога сменяется заголовком карточки, поэтому ждём нужный h1.
      const h1 = page.getByRole('heading', { level: 1, name: /Протокол заседания/ });
      const opened = await h1.waitFor({ timeout: 5000 }).then(() => true, () => false);
      check(opened, `сценарий 4: открыта карточка (${await page.getByRole('heading', { level: 1 }).first().textContent()})`);
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

    await adminScenarios(browser);
    await seoScenario(browser);
    check(cspViolations.length === 0, `нет нарушений CSP: ${cspViolations.slice(0, 3).join(' | ')}`);

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

/** ЭТАП 13: заголовки и метаданные сборки, robots.txt, канонический адрес и языковые версии, noindex. */
async function seoScenario(browser: Browser) {
  const index = await fetch(`${BASE}/ru/faq`);
  const html = await index.text();
  check(/<meta http-equiv="Content-Security-Policy" content="default-src 'self'; script-src 'self' 'sha256-/.test(html), 'SEO/безопасность: CSP со хешем встроенного скрипта в index.html');
  check(index.headers.get('x-frame-options') === 'DENY' && index.headers.get('x-content-type-options') === 'nosniff', 'SEO/безопасность: X-Frame-Options и nosniff у страниц сайта');
  const robots = await (await fetch(`${BASE}/robots.txt`)).text();
  check(robots.includes('Disallow: /admin') && robots.includes('Disallow: /api/'), 'SEO: robots.txt закрывает панель и API');
  const api = await fetch(`${BASE}/api/v1/branches`);
  check(api.headers.get('x-frame-options') === 'DENY' && (api.headers.get('content-security-policy') ?? '').includes("default-src 'none'"), 'безопасность: заголовки у ответов API');
  const docs = (await (await fetch(`${BASE}/api/v1/anticorruption?lang=ru`)).json()) as { documents: Array<{ files: Array<{ url: string; sizeBytes: number }> }> };
  for (const f of docs.documents.flatMap((d) => d.files)) {
    const res = await fetch(`${BASE}${f.url}`);
    check(res.ok && res.headers.get('content-type') === 'application/pdf' && (await res.arrayBuffer()).byteLength === f.sizeBytes, `противодействие коррупции: файл ${f.url} отдаётся, размер совпадает`);
  }

  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  await page.goto(`${BASE}/ru/faq`);
  await page.locator('#main h1').waitFor();
  const head = await page.evaluate(() => ({
    canonical: document.querySelector<HTMLLinkElement>('link[rel="canonical"]')?.getAttribute('href'),
    alternates: [...document.querySelectorAll<HTMLLinkElement>('link[rel="alternate"][hreflang]')].map((l) => `${l.hreflang} ${l.getAttribute('href')}`),
    description: document.querySelector('meta[name="description"]')?.getAttribute('content') ?? '',
    ogTitle: document.querySelector('meta[property="og:title"]')?.getAttribute('content') ?? '',
    robots: document.querySelector('meta[name="robots"]'),
    title: document.title,
  }));
  check(head.canonical === `${BASE}/ru/faq`, `SEO: канонический адрес (${head.canonical})`);
  check(['kk', 'ru', 'en', 'x-default'].every((l) => head.alternates.some((a) => a.startsWith(`${l} ${BASE}/`) && a.endsWith('/faq'))), `SEO: языковые версии hreflang (${head.alternates.join(', ')})`);
  check(head.description.startsWith('Государственный архив') && head.ogTitle === head.title && head.robots === null, 'SEO: описание и og:title на русском, страница индексируется');
  await page.goto(`${BASE}/kk/nonexistent`);
  await page.locator('#main h1').waitFor();
  check((await page.locator('meta[name="robots"]').getAttribute('content')) === 'noindex', 'SEO: страница «не найдено» — noindex');
  await page.goto(`${BASE}/en/faq`);
  await page.locator('#main h1').waitFor();
  check(((await page.locator('meta[name="description"]').getAttribute('content')) ?? '').startsWith('State Archive') && (await page.locator('meta[name="robots"]').count()) === 0, 'SEO: noindex снимается при переходе, описание на английском');
  await page.close();
}

async function signIn(browser: Browser, who: { email: string; password: string }): Promise<Page> {
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  await page.goto(`${BASE}/admin`);
  await page.getByLabel('Email').fill(who.email);
  await page.getByLabel('Пароль').fill(who.password);
  await page.getByRole('button', { name: 'Войти' }).click();
  await page.getByRole('heading', { level: 1, name: 'Обзор' }).waitFor();
  return page;
}

/** Сценарии 9–12: вход, создание документа, цикл согласования двумя ролями, отказ без прав. */
async function adminScenarios(browser: Browser) {
  const staff = staffCredentials();
  if (!staff.admin.password || !staff.archivist.password) {
    check(false, 'сценарии 9–12: нет SEED_ADMIN_PASSWORD или SEED_DEMO_STAFF_PASSWORD в backend/.env');
    return;
  }
  const run = Date.now().toString(36).toUpperCase();
  const title = `[Демо] E2E приказ ${run}`;

  // Сценарий 9: вход и выход сотрудника.
  const anon = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  await anon.goto(`${BASE}/admin`);
  await anon.getByRole('heading', { level: 1, name: 'Вход в панель управления' }).waitFor();
  check((await axe(anon)).length === 0, `axe вход в панель: ${(await axe(anon)).join('; ')}`);
  check((await anon.evaluate(async () => (await fetch('/api/v1/admin/documents')).status)) === 401, 'сценарий 9: анонимный запрос к API админки — 401');
  await anon.getByLabel('Email').fill(staff.archivist.email);
  await anon.getByLabel('Пароль').fill('неверный пароль');
  await anon.getByRole('button', { name: 'Войти' }).click();
  check((await anon.getByRole('alert').textContent()) === 'Неверный email или пароль.', 'сценарий 9: неверный пароль — понятная ошибка');
  const cookieVisible = await anon.evaluate(() => document.cookie.includes('sid='));
  check(!cookieVisible, 'сценарий 9: cookie сессии недоступна скрипту');
  await anon.close();

  const archivist = await signIn(browser, staff.archivist);
  check((await axe(archivist)).length === 0, `axe обзор панели: ${(await axe(archivist)).join('; ')}`);
  check(!(await archivist.evaluate(() => document.cookie.includes('sid='))), 'сценарий 9: cookie HttpOnly');
  await archivist.getByRole('button', { name: 'Выйти' }).click();
  await archivist.getByRole('heading', { level: 1, name: 'Вход в панель управления' }).waitFor();
  await archivist.goto(`${BASE}/admin/documents`);
  const relogin = archivist.getByRole('heading', { level: 1, name: 'Вход в панель управления' });
  await relogin.waitFor();
  check(await relogin.isVisible(), 'сценарий 9: после выхода раздел требует входа');
  await archivist.close();

  // Сценарий 10: архивист создаёт документ; неполная карточка не уходит на проверку.
  const a = await signIn(browser, staff.archivist);
  await a.getByRole('link', { name: 'Создать документ' }).first().click();
  await a.getByRole('heading', { level: 1, name: 'Новый документ' }).waitFor();
  await a.getByRole('option', { name: /Ф\. TEST-1\. Оп\. 1\. Д\. 1 —/ }).waitFor({ state: 'attached' });
  const caseValue = await a.getByRole('option', { name: /Ф\. TEST-1\. Оп\. 1\. Д\. 1 —/ }).getAttribute('value');
  await a.getByLabel(/^Дело/).selectOption(caseValue ?? '');
  await a.getByLabel(/^Вид документа/).selectOption('organization_record');
  await a.getByRole('textbox', { name: 'Название (обязательно)' }).fill(title);
  await a.getByRole('radio', { name: /Ограниченный/ }).check();
  await a.getByRole('button', { name: 'Сохранить черновик' }).click();
  await a.waitForURL(/\/admin\/documents\/[0-9a-f-]{36}$/);
  const docId = a.url().split('/').pop() ?? '';
  await a.getByTestId('doc-status').waitFor();
  check((await a.getByTestId('doc-status').textContent()) === 'Черновик', 'сценарий 10: создан черновик');
  await a.getByRole('button', { name: 'Отправить на проверку' }).click();
  const summary = a.locator('#form-errors');
  await summary.waitFor();
  check(await summary.getByRole('link', { name: 'Краткое описание (Русский): обязательное поле' }).isVisible(), 'сценарий 10: неполная карточка не отправляется, поля перечислены');
  check((await axe(a)).length === 0, `axe карточка документа с ошибками: ${(await axe(a)).join('; ')}`);
  await a.getByLabel(/^Дата \(/).fill('1962');
  await a.getByRole('textbox', { name: /^Краткое описание/ }).first().fill('О премировании рабочих маслозавода.');
  await a.getByRole('textbox', { name: /^Условия доступа/ }).first().fill('Только в читальном зале.');
  await a.getByRole('button', { name: 'Сохранить изменения' }).click();
  await a.getByText('Изменения сохранены.').waitFor();
  await a.getByRole('button', { name: 'Отправить на проверку' }).click();
  await a.getByTestId('doc-status').filter({ hasText: 'На проверке' }).waitFor();
  check((await a.getByTestId('doc-status').textContent()) === 'На проверке', 'сценарий 10: отправлено на проверку');

  // Сценарий 11: модератор возвращает на доработку, архивист исправляет, модератор одобряет, администратор публикует.
  const m = await signIn(browser, staff.moderator);
  const note = m.getByRole('link', { name: new RegExp(`На проверку: «${title.replace(/[[\]]/g, '\\$&')}`) });
  check(await note.waitFor({ timeout: 5000 }).then(() => true, () => false), 'сценарий 11: модератор получил уведомление о документе на проверке');
  await note.click();
  await m.getByRole('button', { name: 'Вернуть на доработку' }).click();
  const dlg = m.getByRole('alertdialog', { name: 'Вернуть на доработку' });
  check(await dlg.getByRole('button', { name: 'Вернуть на доработку' }).isDisabled(), 'сценарий 11: без комментария вернуть нельзя');
  await dlg.getByLabel('Что нужно исправить').fill('Уточните дату документа.');
  await dlg.getByRole('button', { name: 'Вернуть на доработку' }).click();
  await m.getByTestId('doc-status').filter({ hasText: 'Требует доработки' }).waitFor();

  await a.goto(`${BASE}/admin`);
  const back = a.getByRole('link', { name: new RegExp(`Возвращено на доработку: .*${run}.*Уточните дату документа\\.`) });
  await back.waitFor();
  check(await back.isVisible(), 'сценарий 11: автор получил уведомление с комментарием');
  await back.click();
  await a.getByLabel(/^Дата \(/).fill('1962-04');
  await a.getByRole('button', { name: 'Сохранить изменения' }).click();
  await a.getByText('Изменения сохранены.').waitFor();
  await a.getByRole('button', { name: 'Отправить на проверку' }).click();
  await a.getByTestId('doc-status').filter({ hasText: 'На проверке' }).waitFor();

  await m.reload();
  await m.getByRole('button', { name: 'Одобрить' }).click();
  await m.getByTestId('doc-status').filter({ hasText: 'Одобрено' }).waitFor();
  check((await m.getByRole('button', { name: 'Опубликовать' }).count()) === 0, 'сценарий 11: модератор не может опубликовать');

  const publicPath = `/ru/catalog/documents/${docId}`;
  const site = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  await site.goto(BASE + publicPath);
  await site.locator('h1').waitFor();
  check((await site.locator('h1').textContent()) === 'Страница не найдена', 'сценарий 11: до публикации документа на сайте нет');

  const admin = await signIn(browser, staff.admin);
  await admin.goto(`${BASE}/admin/documents/${docId}`);
  await admin.getByRole('button', { name: 'Опубликовать' }).click();
  await admin.getByTestId('doc-status').filter({ hasText: 'Опубликовано' }).waitFor();
  await site.goto(BASE + publicPath);
  await site.locator('h1').waitFor();
  await site.waitForLoadState('networkidle');
  check((await site.locator('h1').textContent()) === title, `сценарий 11: после публикации документ на сайте (${await site.locator('h1').textContent()})`);
  check(await site.getByTestId('restricted-notice').getByText('Только в читальном зале.').isVisible(), 'сценарий 11: на сайте условия доступа');
  check(await site.getByText('Демо', { exact: true }).first().isVisible(), 'сценарий 11: демо-запись помечена на сайте');

  // Сценарий 12: без прав действие недоступно и в интерфейсе, и на сервере.
  await a.reload();
  await a.getByTestId('doc-status').waitFor();
  check((await a.getByRole('button', { name: /Опубликовать|Снять с публикации/ }).count()) === 0, 'сценарий 12: у архивиста нет кнопок публикации');
  const direct = await a.evaluate(async (id) => {
    const me = (await (await fetch('/api/v1/auth/me')).json()) as { csrfToken: string };
    const r = await fetch(`/api/v1/admin/documents/${id}/archive`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': me.csrfToken }, body: JSON.stringify({ confirm: true }) });
    const noCsrf = await fetch(`/api/v1/admin/documents/${id}/submit`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
    return [r.status, noCsrf.status, (await fetch('/api/v1/admin/audit-logs')).status];
  }, docId);
  check(direct[0] === 403, `сценарий 12: прямой запрос на снятие с публикации без права — 403 (${direct[0]})`);
  check(direct[1] === 403, `сценарий 12: запрос без CSRF-токена — 403 (${direct[1]})`);
  check(direct[2] === 403, `сценарий 12: журнал без права — 403 (${direct[2]})`);
  await a.goto(`${BASE}/admin/audit`);
  check(await a.getByRole('heading', { level: 1, name: 'Нет доступа' }).waitFor({ timeout: 5000 }).then(() => true, () => false), 'сценарий 12: раздел журнала без права — «Нет доступа»');

  // Журнал у главного администратора, снятие с публикации с подтверждением, удаление демо-документа.
  await admin.goto(`${BASE}/admin/audit`);
  await admin.getByRole('table').waitFor();
  check((await admin.getByRole('cell', { name: new RegExp(`${run}.*на проверке → одобрено`) }).count()) >= 1, 'журнал: смена статуса записана');
  check((await axe(admin)).length === 0, `axe журнал: ${(await axe(admin)).join('; ')}`);
  await admin.goto(`${BASE}/admin/documents/${docId}`);
  await admin.getByRole('button', { name: 'Снять с публикации' }).click();
  await admin.getByRole('alertdialog').getByRole('button', { name: 'Снять с публикации' }).click();
  await admin.getByTestId('doc-status').filter({ hasText: 'Архивировано' }).waitFor();
  // Новая вкладка без кеша: публичные ответы API кешируются браузером до 60 секунд.
  const fresh = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  await fresh.goto(BASE + publicPath);
  await fresh.locator('h1').waitFor();
  check((await fresh.locator('h1').textContent()) === 'Страница не найдена', 'снятый с публикации документ исчез с сайта');
  await fresh.close();
  await admin.getByRole('button', { name: 'Удалить' }).click();
  await admin.getByRole('alertdialog').getByRole('button', { name: 'Удалить' }).click();
  await admin.waitForURL(/\/admin\/documents$/);

  // Выставка в панели (F-148): создать, добавить экспонат, пройти согласование, увидеть на сайте, снять и удалить.
  const exSlug = `e2e-exhibition-${run.toLowerCase().replace(/[^a-z0-9]/g, '')}`;
  await admin.goto(`${BASE}/admin/exhibitions/new`);
  await admin.getByLabel(/^Адрес на сайте/).fill(exSlug);
  await admin.getByRole('textbox', { name: 'Название (обязательно)' }).fill(`[Демо] e2e выставка ${run}`);
  await admin.getByLabel(/^Описание \(обязательно/).first().fill('Описание выставки для проверки.');
  await admin.getByRole('button', { name: 'Создать черновик' }).click();
  await admin.waitForURL(/\/admin\/exhibitions\/[0-9a-f-]{36}$/);
  await admin.getByTestId('ex-status').filter({ hasText: 'Черновик' }).waitFor();
  check(await admin.getByTestId('ex-issues').getByText('Добавьте хотя бы один экспонат').isVisible(), 'выставка в панели: подсказка, чего не хватает до проверки');
  await admin.getByRole('button', { name: 'Добавить экспонат' }).click();
  const newItem = admin.getByRole('form', { name: 'Новый экспонат' });
  await newItem.getByRole('textbox', { name: 'Название (обязательно)' }).fill('Первый экспонат');
  await newItem.getByLabel(/^Источник/).first().fill('Демонстрационный источник');
  await newItem.getByRole('button', { name: 'Добавить экспонат' }).click();
  await admin.getByRole('heading', { level: 3, name: 'Экспонат 1' }).waitFor();
  check((await axe(admin)).length === 0, `axe выставка в панели: ${(await axe(admin)).join('; ')}`);
  for (const [button, status] of [['Отправить на проверку', 'На проверке'], ['Одобрить', 'Одобрено'], ['Опубликовать', 'Опубликовано']] as const) {
    await admin.getByRole('button', { name: button }).click();
    await admin.getByTestId('ex-status').filter({ hasText: status }).waitFor();
  }
  check(true, 'выставка в панели: черновик → проверка → одобрено → опубликовано');
  const exSite = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  await exSite.goto(`${BASE}/ru/exhibitions/${exSlug}/1`);
  const exVisible = await exSite.getByRole('heading', { level: 1, name: 'Первый экспонат' }).waitFor({ timeout: 5000 }).then(() => true, () => false);
  check(exVisible, 'выставка в панели: опубликованная выставка открывается на сайте');
  await exSite.close();
  await admin.getByRole('button', { name: 'Снять с публикации' }).click();
  await admin.getByRole('alertdialog').getByRole('button', { name: 'Снять с публикации' }).click();
  await admin.getByTestId('ex-status').filter({ hasText: 'Архивировано' }).waitFor();
  const exGone = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  await exGone.goto(`${BASE}/ru/exhibitions/${exSlug}`);
  check(await exGone.getByRole('heading', { level: 1, name: 'Страница не найдена' }).waitFor({ timeout: 5000 }).then(() => true, () => false), 'выставка в панели: снятая выставка исчезла с сайта');
  await exGone.close();
  const exId = admin.url().split('/').pop() ?? '';
  const deleted = await admin.evaluate(async (id) => {
    const me = (await (await fetch('/api/v1/auth/me')).json()) as { csrfToken: string };
    return (await fetch(`/api/v1/admin/exhibitions/${id}`, { method: 'DELETE', headers: { 'content-type': 'application/json', 'x-csrf-token': me.csrfToken }, body: JSON.stringify({ confirm: true }) })).status;
  }, exId);
  check(deleted === 204, `выставка в панели: удаление с подтверждением (${deleted})`);

  // Панель на 320 px: формы и дерево не шире экрана (без горизонтальной прокрутки).
  await admin.setViewportSize({ width: 320, height: 800 });
  for (const path of ['/admin', '/admin/documents', '/admin/documents/new', '/admin/hierarchy', '/admin/audit', '/admin/exhibitions', '/admin/exhibitions/new']) {
    await admin.goto(BASE + path);
    await admin.locator('#admin-main h1').waitFor();
    await admin.waitForLoadState('networkidle');
    const extra = await admin.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    check(extra <= 0, `панель 320 px без горизонтальной прокрутки: ${path} (+${extra}px)`);
  }
  for (const p of [a, m, admin, site]) await p.close();
}

await main();
