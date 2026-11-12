import { ArrowRight, Building2, CalendarDays, Clock, FileText, Folder, Image, Images, MapPin, RefreshCw, Search, User, CircleHelp } from 'lucide-react';
import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type FormEvent, type Ref, type RefObject } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate, useParams } from 'react-router';
import { useA11y } from '../app/A11yProvider.tsx';
import { usePageMeta } from '../app/usePageMeta.ts';
import { MonthDates } from '../components/home/MonthDates.tsx';
import { LoadStatus } from '../components/shared/LoadStatus.tsx';
import { OriginBadge, TranslationNote } from '../components/shared/OriginBadge.tsx';
import { formatDate, formatYears } from '../lib/format.ts';
import { telHref, useMainBranch } from '../lib/main-branch.ts';
import { SchemeMap } from '../components/branches/SchemeMap.tsx';
import type { BranchSummary, HomeData } from '../lib/types.ts';
import { useApi } from '../lib/useApi.ts';

/** Цвета папок (макет: --ff — лицевая сторона, --fc — текст на ней). */
const FOLDER_COLORS = [
  { '--ff': 'var(--ink)', '--fc': '#fff' },
  { '--ff': 'var(--brand)', '--fc': '#fff' },
  { '--ff': 'var(--gold)', '--fc': '#1B2238' },
  { '--ff': 'var(--tint2)', '--fc': 'var(--ink)' },
] as const;
const folderStyle = (index: number, height?: number): CSSProperties =>
  ({ ...FOLDER_COLORS[index % FOLDER_COLORS.length], ...(height ? { '--fh': `${height}px` } : {}) }) as CSSProperties;

/**
 * Главная (ТЗ §5.1, с. 4; F-010 – F-019) в дизайне 11.11.2026 (Main.dc.html).
 * Данные — GET /home, список подразделений и контакты основного архива; пустые блоки не показываются.
 * Декоративные сцены (папки, картотека, лист с пером) скрыты от чтения с экрана, лист подписан как иллюстрация.
 */
export function HomePage() {
  const { t } = useTranslation();
  const { lang = 'kk' } = useParams();
  usePageMeta(t('site.name'));
  const home = useApi<HomeData>(`/home?lang=${lang}`);
  const href = (path: string) => `/${lang}/${path}`;

  return (
    <>
      <Hero />
      <QuickLinks />
      <CatalogBlock />
      <UsefulLinks />
      <Manuscript />
      {home.status === 'ready' ? (
        <HomeBlocks data={home.data} lang={lang} />
      ) : (
        <div className="wrap py-10"><LoadStatus status={home.status} /></div>
      )}
      <section className="wrap sec d-row items-stretch" aria-label={t('home.contacts.title')}>
        <AssistantCard />
        <ContactsCard />
      </section>
      <HomeMap />
      <p className="sr-only"><Link to={href('exhibitions')}>{t('home.toExhibitions')}</Link></p>
    </>
  );
}

function Hero() {
  const { t } = useTranslation();
  const { lang = 'kk' } = useParams();
  return (
    <section className="wrap pt-5" aria-labelledby="home-title">
      <div className="hero dark">
        <div className="hero-bg" aria-hidden="true" />
        <div className="hero-photo kb duo" aria-hidden="true" />
        <div className="hero-shade" aria-hidden="true" />
        <div className="orn-ros spin hero-ros" aria-hidden="true" />
        <div className="dust" aria-hidden="true">
          {[12, 30, 52, 68, 86].map((left, i) => <span key={left} style={{ left: `${left}%`, '--d': `${i * 2}s` } as CSSProperties} />)}
        </div>
        <div className="hero-pad">
          <div className="hero-text">
            <p className="in hero-kicker">{t('site.name')}</p>
            <h1 id="home-title" tabIndex={-1} className="hero-h1">
              <span className="line-mask hero-t1"><span>{t('home.heroLine1')}</span></span>
              <span className="line-mask hero-t2"><span>{t('home.heroLine2')}</span></span>
            </h1>
            <p className="in lead hero-lead">{t('home.intro')}</p>
            <div className="in d-row hero-actions">
              <Link to={`/${lang}/catalog`} className="btn gold">
                {t('home.quick.findDocument')}<ArrowRight aria-hidden="true" className="size-[22px]" />
              </Link>
              <Link to={`/${lang}/exhibitions`} className="btn white">{t('home.toExhibitions')}</Link>
            </div>
          </div>
          <HeroArt />
        </div>
        <div className="orn-band drift hero-band" aria-hidden="true" />
      </div>
    </section>
  );
}

/** Сцена «фонд — опись — дело» и вращающийся герб; только украшение. */
function HeroArt() {
  const { t } = useTranslation();
  const fond = t('home.cipher.fond.code');
  return (
    <div className="hero-art" aria-hidden="true">
      <div className="iso iso-box">
        <div className="iso-stack relative size-full">
          <div className="iso-layer bg-[var(--tint2)]"><span className="iso-tab left-0 w-[110px] bg-[var(--tint2)]" /></div>
          <div className="iso-layer iso-l1 bg-[var(--sky)]"><span className="iso-tab left-[96px] bg-[var(--sky)] text-white">{t('home.cipher.inventory.label')}</span></div>
          <div className="iso-layer iso-l2 flex flex-col gap-3 bg-white p-7">
            <span className="iso-line h-2 w-[60%]" /><span className="iso-line w-[88%]" /><span className="iso-line w-[80%]" />
            <span className="iso-tab left-[200px] bg-white text-[var(--ink)]">{t('home.cipher.case.label')}</span>
          </div>
          <div className="iso-layer iso-l3 bg-[var(--gold)]">
            <span className="iso-tab left-0 bg-[var(--gold)] text-[#1b2238]">{t('home.cipher.fond.label')}</span>
            <div className="absolute bottom-5 right-6 text-[calc(40px*var(--fs,1))] font-extrabold text-[#1b2238]">{fond}</div>
          </div>
        </div>
      </div>
      <div className="coin-wrap floaty coin-box">
        <div className="pulse coin-pulse" />
        <div className="coin size-[230px]">
          <div className="coin-face"><img className="seal" src="/design/logo-seal.png" alt="" width={230} height={230} /></div>
          <div className="coin-face coin-back"><div className="orn-ros absolute inset-[22px]" /></div>
        </div>
      </div>
    </div>
  );
}

function QuickLinks() {
  const { t } = useTranslation();
  const { lang = 'kk' } = useParams();
  const items = [
    { key: 'findDocument', to: `/${lang}/catalog`, Icon: Search },
    { key: 'certificate', to: `/${lang}/services`, Icon: FileText },
    { key: 'readingRoom', to: `/${lang}/reading-room`, Icon: Building2 },
    { key: 'findBranch', to: `/${lang}/branches`, Icon: MapPin },
  ] as const;
  return (
    <section className="wrap sec pb-10" aria-labelledby="home-quick">
      <h2 id="home-quick" className="h2 u mb-11">{t('home.quickTitle')}</h2>
      <ul className="d-grid quick-grid [--min:290px] gap-6">
        {items.map(({ key, to, Icon }, i) => (
          <li key={key} className="flex">
            <Link className="fold sr flex-1" to={to} style={folderStyle(i)}>
              <span className="fold-tab" aria-hidden="true">{t(`home.quickKicker.${key}`)}</span>
              <span className="fold-back" aria-hidden="true" />
              <span className="fold-paper p2" aria-hidden="true" /><span className="fold-paper" aria-hidden="true" />
              <span className="fold-front">
                <Icon aria-hidden="true" className="mb-auto size-10" strokeWidth={1.8} />
                <span className="fold-title text-[calc(24px*var(--fs,1))] font-extrabold leading-tight">{t(`home.quick.${key}`)}</span>
                <span className="fold-text text-[calc(17px*var(--fs,1))] leading-snug">{t(`home.quickText.${key}`)}</span>
                <span className="fold-go" aria-hidden="true">{t('home.open')} <ArrowRight className="size-5" /></span>
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}

function CatalogBlock() {
  const { t } = useTranslation();
  const { lang = 'kk' } = useParams();
  const navigate = useNavigate();
  const [query, setQuery] = useState('');
  const onSubmit = (event: FormEvent) => {
    event.preventDefault();
    const q = query.trim();
    navigate(q ? `/${lang}/catalog?q=${encodeURIComponent(q)}` : `/${lang}/catalog`);
  };
  const drawers = ['fond', 'inventory', 'case', 'sheets'] as const;
  const example = [t('home.cipher.fond.code'), t('home.cipher.inventory.code'), t('home.cipher.case.code')].join('. ');
  return (
    <section className="wrap sec" aria-labelledby="home-catalog">
      <div className="flex flex-wrap items-center gap-14">
        <div className="sr-l min-w-0 flex-[1_1_420px]">
          <h2 id="home-catalog" className="h2 u mb-5">{t('home.catalogTitle')}</h2>
          <p className="mb-7 max-w-[600px] text-[calc(19px*var(--fs,1))]">{t('home.catalogText')}</p>
          <form role="search" aria-label={t('catalogSearch.label')} className="max-w-[640px]" onSubmit={onSubmit}>
            <label className="label mb-2" htmlFor="home-catalog-search">{t('catalogSearch.label')}</label>
            <div className="field-row">
              <input id="home-catalog-search" className="field" type="search" name="q" value={query} maxLength={200}
                autoComplete="off" aria-describedby="home-catalog-hint" onChange={(e) => setQuery(e.target.value)} />
              <button type="submit" className="btn"><Search aria-hidden="true" className="size-5" />{t('catalogSearch.submit')}</button>
            </div>
          </form>
          <p id="home-catalog-hint" className="muted mb-5 mt-3.5 text-[calc(17px*var(--fs,1))]">
            {t('home.cipherExample')} <span className="mono text-[var(--ink)]">{example}</span>
          </p>
          <Link to={`/${lang}/catalog?filters=open`} className="btn ghost">
            {t('home.advancedSearch')}<ArrowRight aria-hidden="true" className="size-5" />
          </Link>
        </div>
        <div className="cab-scene sr-r flex min-w-0 flex-[1_1_400px] flex-col items-center gap-5 py-10">
          <section className="cabinet cab-auto dark" aria-labelledby="home-cipher">
            <div className="d-row cab-head">
              <h3 id="home-cipher" className="cab-title">{t('home.cipherTitle')}</h3>
              <img className="seal" src="/design/logo-seal-256.png" alt="" width={42} height={43} />
            </div>
            <ul className="contents">
              {drawers.map((key) => (
                <li key={key} className="drawer h-[108px]">
                  <div className="drawer-top" aria-hidden="true">
                    <span className="bg-white" /><span className="bg-[var(--tint)]" /><span className="bg-[var(--gold)]" /><span className="bg-white" /><span className="bg-[var(--sky)]" />
                  </div>
                  <div className="drawer-side" aria-hidden="true" />
                  <div className="drawer-face">
                    <span className="mono drawer-code">{t(`home.cipher.${key}.code`)}</span>
                    <span className="flex min-w-0 flex-1 flex-col">
                      <span className="text-[calc(18px*var(--fs,1))] font-extrabold">{t(`home.cipher.${key}.label`)}</span>
                      <span className="text-[calc(16px*var(--fs,1))] leading-tight">{t(`home.cipher.${key}.text`)}</span>
                    </span>
                    <span className="drawer-knob" aria-hidden="true" />
                  </div>
                </li>
              ))}
            </ul>
          </section>
        </div>
      </div>
    </section>
  );
}

function UsefulLinks() {
  const { t } = useTranslation();
  const { lang = 'kk' } = useParams();
  const items = [
    { key: 'catalogHelp', to: `/${lang}/faq`, Icon: CircleHelp },
    { key: 'fonds', to: `/${lang}/catalog/fonds`, Icon: Folder },
    { key: 'published', to: `/${lang}/catalog?hasDigitalCopy=true`, Icon: Image },
    { key: 'branches', to: `/${lang}/branches`, Icon: MapPin },
  ] as const;
  return (
    <section className="wrap pb-[88px]" aria-labelledby="home-useful">
      <h2 id="home-useful" className="h2 u mb-8">{t('home.useful.title')}</h2>
      <ul className="d-grid [--min:290px]">
        {items.map(({ key, to, Icon }) => (
          <li key={key} className="flex">
            <Link className="card lift sr d-col useful flex-1" to={to}>
              <Icon aria-hidden="true" className="useful-ico size-9" />
              <span className="tlink text-[calc(22px*var(--fs,1))] font-extrabold leading-tight">{t(`home.useful.${key}.title`)}</span>
              <span className="text-[calc(17px*var(--fs,1))] leading-normal">{t(`home.useful.${key}.text`)}</span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}

/**
 * Рукописный лист — картинка, а не текст сайта: строки написаны дореформенной орфографией на всех языках
 * и скрыты от чтения с экрана; переведённая расшифровка — на обороте. Текст составлен для примера (подпись под кнопкой).
 */
const SHEET_NUMBER = '№ [—]';
const SHEET_PLACE = 'г. Усть-Каменогорскъ';
const SHEET_HAND = ['Милостивые государи!', 'Въ семъ хранилищѣ собрана память', 'Восточнаго края — отъ Иртыша', 'до вершинъ Алтая: дѣла, письма,', 'приказы и судьбы людей.', 'Хранитель архива'];

/** Лист с пером: рукопись пишется при появлении на экране, кнопка переворачивает лист к расшифровке. */
function Manuscript() {
  const { t } = useTranslation();
  const [flipped, setFlipped] = useState(false);
  const [play, setPlay] = useState(false);
  const sheet = useRef<HTMLDivElement>(null);
  const paper = useRef<HTMLDivElement>(null);
  const quill = useRef<SVGSVGElement>(null);
  const { prefs } = useA11y();
  useQuillWriting(paper, quill, play, !prefs.still && !prefs.mode);

  useEffect(() => {
    const el = sheet.current;
    if (!el || typeof IntersectionObserver === 'undefined') {
      setPlay(true);
      return;
    }
    const io = new IntersectionObserver((entries) => {
      if (entries.some((e) => e.isIntersecting)) {
        setPlay(true);
        io.disconnect();
      }
    }, { threshold: 0.35 });
    io.observe(el);
    return () => io.disconnect();
  }, []);

  return (
    <section className="sec sheet-sec" aria-labelledby="home-sheet">
      <div className="orn-ros spin absolute -bottom-[180px] -left-[160px] size-[520px] opacity-50 [--sp:100s]" aria-hidden="true" />
      <div className="wrap relative flex flex-wrap items-center gap-14">
        <div className="sr-l min-w-0 flex-[1_1_380px]">
          <h2 id="home-sheet" className="h2 u mb-5">{t('home.manuscript.title')}</h2>
          <p className="mb-7 max-w-[540px] text-[calc(19px*var(--fs,1))]">{t('home.manuscript.text')}</p>
          <button type="button" className="btn dark min-h-16 text-[calc(19px*var(--fs,1))]" aria-pressed={flipped} onClick={() => setFlipped((f) => !f)}>
            <RefreshCw aria-hidden="true" className="size-6" />{t(flipped ? 'home.manuscript.toSheet' : 'home.manuscript.toText')}
          </button>
        </div>
        <div ref={sheet} className={`flip-scene scroll-write relative flex min-w-0 flex-[1.1_1_320px] justify-center${play ? ' play' : ''}`}>
          <Inkwell />
          <div className="flip w-[min(520px,100%)] [aspect-ratio:5/6.4]" style={{ transform: flipped ? 'rotateY(180deg)' : 'rotateY(0deg)' }}>
            <div ref={paper} className="flip-face sheet-paper" aria-hidden="true">
              <div className="absolute left-[9%] right-[8%] top-[7%] flex justify-between">
                <span className="ink text-[3.8cqw]" lang="ru">{SHEET_NUMBER}</span>
                <span className="ink text-[3.8cqw]" lang="ru">{SHEET_PLACE}</span>
              </div>
              <div className="absolute left-[9%] right-[8%] top-[16%] flex flex-col gap-[.8cqw]" lang="ru">
                {SHEET_HAND.map((line, i) => (
                  <span key={line} data-hand=""
                    className={`ink w${i + 1} ${i === 0 || i === SHEET_HAND.length - 1 ? 'text-[5.6cqw]' : 'text-[4.8cqw]'}${i === SHEET_HAND.length - 1 ? ' mt-[2cqw] self-end' : ' self-start'}`}>{line}</span>
                ))}
              </div>
              <img className="wax absolute bottom-[6%] left-[9%] w-[23%] rotate-[-12deg]" src="/design/logo-seal-256.png" alt="" />
              <Quill ref={quill} />
            </div>
            <div className="flip-face flip-back card flex flex-col gap-[18px] rounded-[18px] p-[9%]" aria-hidden={!flipped}>
              <span className="muted text-[calc(17px*var(--fs,1))] font-bold">{t('home.manuscript.caption')}</span>
              <p className="m-0 text-[calc(28px*var(--fs,1))] font-extrabold leading-tight">{t('home.manuscript.plainTitle')}</p>
              <p className="m-0 text-[calc(21px*var(--fs,1))] leading-relaxed">{t('home.manuscript.plain')}</p>
              <p className="muted m-0 text-[calc(19px*var(--fs,1))]">{t('home.manuscript.plainSign')}</p>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

function Inkwell() {
  return (
    <svg width="110" height="110" viewBox="0 0 120 120" className="absolute -bottom-2.5 left-0 z-[3]" aria-hidden="true">
      <ellipse cx="60" cy="108" rx="46" ry="8" fill="rgba(0,0,0,.18)" />
      <path d="M22 60h76l-6 46H28z" fill="#1B2238" /><path d="M22 60h76l-2 10H24z" fill="#34497A" />
      <rect x="44" y="44" width="32" height="18" rx="3" fill="#0B1830" /><ellipse cx="60" cy="44" rx="16" ry="4" fill="#050C18" />
    </svg>
  );
}

/** Кончик пера в координатах SVG (viewBox 150×190): по нему перо ставится на строку. */
const QUILL_TIP = { x: 10, y: 186 };
const WRITE_MS = 4200;
const LINE_GAP_MS = 140;

/**
 * Пишет рукопись пером: каждая строка открывается слева направо, а кончик пера стоит на краю написанного.
 * Скорость одна для всех строк (по ширине текста). Без анимации (системная настройка, «Остановить анимацию»,
 * версия для слабовидящих) текст виден сразу, перо скрыто стилями.
 */
function useQuillWriting(paperRef: RefObject<HTMLDivElement | null>, quillRef: RefObject<SVGSVGElement | null>, play: boolean, motion: boolean) {
  useLayoutEffect(() => {
    const paperEl = paperRef.current;
    const quillEl = quillRef.current;
    if (!paperEl || !quillEl) return;
    const lines = Array.from(paperEl.querySelectorAll<HTMLElement>('[data-hand]'));
    const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
    const show = () => lines.forEach((l) => { l.style.clipPath = ''; });
    if (!motion || reduce) {
      show();
      return;
    }
    const clip = (el: HTMLElement, p: number) => { el.style.clipPath = `inset(-40% ${((1 - p) * 100).toFixed(2)}% -40% -4%)`; };
    const offset = (el: HTMLElement) => {
      let x = 0;
      let y = 0;
      let node: HTMLElement | null = el;
      while (node && node !== paperEl) {
        x += node.offsetLeft;
        y += node.offsetTop;
        node = node.offsetParent as HTMLElement | null;
      }
      return { x, y };
    };
    const place = (x: number, y: number, tilt: number) => {
      quillEl.style.transform = `translate(${x - QUILL_TIP.x}px, ${y - QUILL_TIP.y}px) rotate(${tilt}deg)`;
    };
    const geo = () => lines.map((el) => {
      const { x, y } = offset(el);
      return { el, x, y: y + el.offsetHeight * 0.78, w: el.offsetWidth };
    });
    let g = geo();
    lines.forEach((l) => clip(l, 0));
    if (g[0]) place(g[0].x, g[0].y, -4);
    if (!play) return;

    const total = g.reduce((sum, l) => sum + l.w, 0) || 1;
    const writing = WRITE_MS - LINE_GAP_MS * (g.length - 1);
    const spans = g.map((l) => (l.w / total) * writing);
    let frame = 0;
    const start = performance.now();
    const onResize = () => { g = geo(); };
    window.addEventListener('resize', onResize);
    const tick = (now: number) => {
      let t = now - start;
      for (let i = 0; i < g.length; i++) {
        const line = g[i]!;
        const span = spans[i]!;
        if (t >= span + LINE_GAP_MS || (i === g.length - 1 && t >= span)) {
          clip(line.el, 1);
          t -= span + LINE_GAP_MS;
          continue;
        }
        if (t >= span) {
          // Перо переносится к началу следующей строки.
          const next = g[i + 1]!;
          const k = (t - span) / LINE_GAP_MS;
          clip(line.el, 1);
          place(line.x + line.w + (next.x - line.x - line.w) * k, line.y + (next.y - line.y) * k, 4 - 8 * k);
          frame = requestAnimationFrame(tick);
          return;
        }
        const p = Math.max(0, t / span);
        clip(line.el, p);
        place(line.x + line.w * p, line.y + Math.sin(p * 40) * 1.5, -4 + 8 * p);
        frame = requestAnimationFrame(tick);
        return;
      }
      const last = g[g.length - 1];
      if (last) place(last.x + last.w + 18, last.y + 24, 18);
    };
    frame = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener('resize', onResize);
      show();
    };
  }, [paperRef, quillRef, play, motion]);
}

function Quill({ ref }: { ref: Ref<SVGSVGElement> }) {
  return (
    <svg ref={ref} className="quill pointer-events-none absolute" width="150" height="190" viewBox="0 0 150 190">
      <path d="M10 186 L64 96" stroke="#5B3B1E" strokeWidth="3" strokeLinecap="round" />
      <path d="M60 104 C 40 70, 70 18, 140 4 C 120 30, 116 56, 96 76 C 106 74, 112 70, 118 66 C 104 92, 84 102, 60 104Z" fill="#F7F1E4" stroke="#B9A57E" strokeWidth="1.2" />
      <path d="M62 102 C 86 70, 108 40, 138 6" stroke="#9C8458" strokeWidth="1.6" fill="none" />
    </svg>
  );
}

function HomeBlocks({ data, lang }: { data: HomeData; lang: string }) {
  return (
    <>
      <HistoryBlock data={data} lang={lang} />
      <div className="orn-band drift h-10 opacity-90" aria-hidden="true" />
      <div className="wrap home-dates pt-12"><MonthDates /></div>
      {data.exhibitions.length > 0 ? <ExhibitionsBlock data={data} lang={lang} /> : null}
      {data.news.length > 0 ? <NewsBlock data={data} lang={lang} /> : null}
    </>
  );
}

/** Пять папок раздела «Цифровая история» (Main.dc.html и History.dc.html). */
export function HistoryFolders({ lang }: { lang: string }) {
  const { t } = useTranslation();
  const tabs = [
    { key: 'timeline', to: `/${lang}/history/timeline`, Icon: Clock },
    { key: 'persons', to: `/${lang}/history/persons`, Icon: User },
    { key: 'collections', to: `/${lang}/history/collections`, Icon: Folder },
    { key: 'gallery', to: `/${lang}/history/gallery`, Icon: Images },
    { key: 'calendar', to: `/${lang}/calendar`, Icon: CalendarDays },
  ] as const;
  return (
  <ul className="d-grid quick-grid mb-11 gap-x-4 gap-y-[22px] [--min:230px]">
    {tabs.map(({ key, to, Icon }, i) => (
      <li key={key} className="flex">
        <Link className="fold sr flex-1" to={to} style={folderStyle([0, 1, 2, 3, 0][i] ?? 0, 220)}>
          <span className="fold-tab" aria-hidden="true">{t(`home.historyTabs.${key}.tab`)}</span>
          <span className="fold-back" aria-hidden="true" />
          <span className="fold-paper p2" aria-hidden="true" /><span className="fold-paper" aria-hidden="true" />
          <span className="fold-front">
            <Icon aria-hidden="true" className="size-9" strokeWidth={1.8} />
            <span className="fold-title text-[calc(22px*var(--fs,1))] font-extrabold leading-tight">{t(`home.historyTabs.${key}.name`)}</span>
          </span>
        </Link>
      </li>
    ))}
  </ul>
  );
}

function HistoryBlock({ data, lang }: { data: HomeData; lang: string }) {
  const { t } = useTranslation();
  const { topics, publications, documents } = data.history;
  return (
    <section id="history" className="wrap sec pb-12" aria-labelledby="home-history">
      <div className="d-row between sec-head">
        <div>
          <h2 id="home-history" className="h2 u mb-3">{t('nav.history')}</h2>
          <p className="sec-lead">{t('home.historyLead')}</p>
        </div>
        <Link to={`/${lang}/history`} className="btn ghost">{t('home.allPublications')}</Link>
      </div>
      <HistoryFolders lang={lang} />
      {publications.length > 0 ? (
        <>
          <h3 className="h3 mb-[18px]">{t('home.publicationsTitle')}</h3>
          <ul className="d-grid mb-11 [--min:320px]">
            {publications.map((p) => (
              <li key={p.slug} className="flex">
                <Link to={`/${lang}/history/${p.slug}`} className="card lift d-col useful flex-1 gap-2.5">
                  <span className="d-row gap-2"><OriginBadge origin={p.dataOrigin} />{p.periodText ? <span className="chip">{p.periodText}</span> : null}</span>
                  <span className="tlink text-[calc(22px*var(--fs,1))] font-extrabold leading-tight">{p.title ?? p.slug}</span>
                  {p.lead ? <span className="text-[calc(17px*var(--fs,1))]">{p.lead}</span> : null}
                  <TranslationNote contentLang={p.contentLang} translationStatus={p.translationStatus} />
                </Link>
              </li>
            ))}
          </ul>
        </>
      ) : null}
      {documents.length > 0 ? (
        <>
          <h3 className="h3 mb-[18px]">{t('home.documentsTitle')}</h3>
          <ul className="d-grid mb-11 [--min:290px]">
            {documents.map((d) => (
              <li key={d.id} className="flex">
                <Link to={`/${lang}/catalog/documents/${d.id}`} className="card lift d-col useful flex-1 gap-2.5">
                  <span className="d-row gap-2"><OriginBadge origin={d.dataOrigin} />{d.hasDigitalCopy ? <span className="chip">{t('home.digitalCopy')}</span> : null}</span>
                  <span className="tlink text-[calc(20px*var(--fs,1))] font-extrabold leading-tight">{d.title ?? d.archiveCode.formatted}</span>
                  <span className="mono text-[calc(16px*var(--fs,1))]">{d.archiveCode.formatted}</span>
                  {formatYears(d.date) ? <span className="muted text-[calc(16px*var(--fs,1))]">{formatYears(d.date)}</span> : null}
                  <TranslationNote contentLang={d.contentLang} translationStatus={d.translationStatus} />
                </Link>
              </li>
            ))}
          </ul>
        </>
      ) : null}
      {topics.length > 0 ? (
        <>
          <h3 className="h3 mb-[18px]">{t('home.topicsTitle')}</h3>
          <ul className="d-grid topics">
            {topics.map((x) => (
              <li key={x.slug} className="flex">
                <Link to={`/${lang}/history?topic=${encodeURIComponent(x.slug)}`} className={`topic sr flex-1 ${x.publicationCount > 0 ? 'on' : 'off'}`}>
                  <span>{x.name ?? x.slug}</span>
                  {x.publicationCount > 0 ? (
                    <span className="topic-n"><span aria-hidden="true">{x.publicationCount}</span><span className="sr-only">{t('home.topicCount', { count: x.publicationCount })}</span></span>
                  ) : (
                    <span className="topic-soon">{t('home.topicSoon')}</span>
                  )}
                </Link>
              </li>
            ))}
          </ul>
        </>
      ) : null}
    </section>
  );
}

function ExhibitionsBlock({ data, lang }: { data: HomeData; lang: string }) {
  const { t } = useTranslation();
  return (
    <section className="wrap sec" aria-labelledby="home-exhibitions">
      <div className="d-row between mb-9">
        <div>
          <h2 id="home-exhibitions" className="h2 u mb-3">{t('home.exhibitionsTitle')}</h2>
          <p className="sec-lead">{t('home.exhibitionsLead')}</p>
        </div>
        <Link to={`/${lang}/exhibitions`} className="btn ghost">{t('home.allExhibitions')}</Link>
      </div>
      <ul className="d-grid gap-6 [--min:480px]">
        {data.exhibitions.map((e) => {
          const years = e.yearFrom && e.yearTo && e.yearFrom !== e.yearTo ? `${e.yearFrom}–${e.yearTo}` : e.yearFrom ?? e.yearTo;
          return (
            <li key={e.slug} className="flex">
              <Link className="fanbox card lift sr-z flex-1" to={`/${lang}/exhibitions/${e.slug}`}>
                <span className="fan" aria-hidden="true">
                  <span className="ph ph0" /><span className="ph ph1" /><span className="ph ph2" />
                </span>
                <span className="d-col min-w-0 flex-[1_1_240px] gap-2.5">
                  <span className="d-row gap-2">
                    <OriginBadge origin={e.dataOrigin} />
                    {years ? <span className="chip">{t('home.years', { years })}</span> : null}
                  </span>
                  <span className="text-[calc(24px*var(--fs,1))] font-extrabold leading-tight">{e.title ?? e.slug}</span>
                  {e.lead ? <span className="text-[calc(17px*var(--fs,1))]">{e.lead}</span> : null}
                  <TranslationNote contentLang={e.contentLang} translationStatus={e.translationStatus} />
                  <span className="fold-go text-[var(--brand)]" aria-hidden="true">{t('home.startViewing')} <ArrowRight className="size-5" /></span>
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function NewsBlock({ data, lang }: { data: HomeData; lang: string }) {
  const { t } = useTranslation();
  const [rubric, setRubric] = useState<string | null>(null);
  const rubrics = [...new Map(data.news.filter((n) => n.rubric).map((n) => [n.rubric?.slug ?? '', n.rubric?.name ?? ''])).entries()];
  const shown = rubric ? data.news.filter((n) => n.rubric?.slug === rubric) : data.news;
  return (
    <section id="news" className="sec news-sec" aria-labelledby="home-news">
      <div className="wrap">
        <div className="d-row between mb-7">
          <h2 id="home-news" className="h2 u">{t('home.newsTitle')}</h2>
          <Link to={`/${lang}/news`} className="btn ghost">{t('home.allNews')}</Link>
        </div>
        {rubrics.length > 1 ? (
          <div role="group" aria-label={t('home.rubricLabel')} className="d-row mb-6 gap-2.5">
            <button type="button" className="rub" aria-pressed={rubric === null} onClick={() => setRubric(null)}>{t('home.allRubrics')}</button>
            {rubrics.map(([slug, name]) => (
              <button key={slug} type="button" className="rub" aria-pressed={rubric === slug} onClick={() => setRubric(slug)}>{name}</button>
            ))}
          </div>
        ) : null}
        <ul className="d-col gap-4">
          {shown.map((n) => (
            <li key={n.slug}>
              <Link className="lift sr-l news-row" to={`/${lang}/news/${n.slug}`}>
                <time className="muted news-date" dateTime={n.publishedAt}>{formatDate(n.publishedAt, lang)}</time>
                <span className="d-col flex-[1_1_280px] gap-2">
                  <span className="d-row gap-2">
                    {n.rubric?.name ? <span className="chip">{n.rubric.name}</span> : null}
                    <OriginBadge origin={n.dataOrigin} />
                  </span>
                  <span className="tlink text-[calc(23px*var(--fs,1))] font-extrabold leading-tight">{n.title ?? n.slug}</span>
                  {n.lead ? <span className="text-[calc(17px*var(--fs,1))]">{n.lead}</span> : null}
                  <TranslationNote contentLang={n.contentLang} translationStatus={n.translationStatus} />
                </span>
              </Link>
            </li>
          ))}
        </ul>
        {shown.length === 0 ? <p className="news-empty">{t('home.rubricEmpty')}</p> : null}
      </div>
    </section>
  );
}

function AssistantCard() {
  const { t } = useTranslation();
  const { lang = 'kk' } = useParams();
  const navigate = useNavigate();
  const [question, setQuestion] = useState('');
  const examplesValue: unknown = t('home.assistant.examples', { returnObjects: true });
  const examples = Array.isArray(examplesValue) ? examplesValue.filter((v): v is string => typeof v === 'string') : [];
  const ask = (q: string) => `/${lang}/assistant${q ? `?q=${encodeURIComponent(q)}` : ''}`;
  const onSubmit = (event: FormEvent) => {
    event.preventDefault();
    navigate(ask(question.trim()));
  };
  return (
    <div className="dark sr-l d-col ask-card">
      <div className="orn-ros spin ask-ros" aria-hidden="true" />
      <h2 className="h2 h2-card">{t('home.assistant.title')}</h2>
      <p className="m-0 text-[calc(19px*var(--fs,1))]">{t('home.assistant.text')}</p>
      <form onSubmit={onSubmit}>
        <label className="label mb-2" htmlFor="home-ask">{t('home.assistant.label')}</label>
        <div className="field-row">
          <input id="home-ask" className="field" type="text" name="q" value={question} maxLength={500} onChange={(e) => setQuestion(e.target.value)} />
          <button type="submit" className="btn gold">{t('home.assistant.ask')}</button>
        </div>
      </form>
      <h3 className="text-[calc(17px*var(--fs,1))] font-bold text-[var(--gold)]">{t('home.assistant.examplesTitle')}</h3>
      <ul className="d-row gap-2.5">
        {examples.map((x) => <li key={x}><Link to={ask(x)} className="lift ask-example">{x}</Link></li>)}
      </ul>
    </div>
  );
}

/** Схема области с метками архива и филиалов (12.11.2026): окно метки с адресом, контактами и 2ГИС. */
function HomeMap() {
  const { t } = useTranslation();
  const { lang = 'kk' } = useParams();
  const branches = useApi<{ items: BranchSummary[] }>(`/branches?lang=${lang}`);
  if (branches.status !== 'ready' || branches.data.items.length === 0) return null;
  return (
    <section className="wrap sec" aria-labelledby="home-map">
      <h2 id="home-map" className="h2 mb-2">{t('branchMap.title')}</h2>
      <p className="lead mb-6">{t('branchMap.lead')}</p>
      <SchemeMap branches={branches.data.items} lang={lang} />
    </section>
  );
}

function ContactsCard() {
  const { t } = useTranslation();
  const { lang = 'kk' } = useParams();
  const main = useMainBranch(lang);
  const branches = useApi<{ items: BranchSummary[] }>(`/branches?lang=${lang}`);
  const branch = main.status === 'ready' ? main.branch : null;
  return (
    <div className="card sr-r d-col contact-card">
      <h2 className="h2 h2-card">{t('home.contacts.title')}</h2>
      {branches.status === 'ready' ? (
        <p className="m-0 text-[calc(19px*var(--fs,1))]">{t('home.contacts.text', { count: branches.data.items.length })}</p>
      ) : null}
      {branch ? (
        <dl className="contact-dl">
          {branch.address ? <><dt className="muted">{t('home.contacts.address')}</dt><dd>{branch.address}</dd></> : null}
          {branch.phone ? <><dt className="muted">{t('home.contacts.phone')}</dt><dd><a href={telHref(branch.phone)} className="contact-phone">{branch.phone}</a></dd></> : null}
          {branch.email ? <><dt className="muted">{t('home.contacts.email')}</dt><dd><a href={`mailto:${branch.email}`}>{branch.email}</a></dd></> : null}
          {branch.scheduleText ? (
            <><dt className="muted">{t('home.contacts.schedule')}</dt>
              <dd>{branch.scheduleText}{branch.readingRoomSchedule ? <><br />{branch.readingRoomSchedule}</> : null}</dd></>
          ) : null}
        </dl>
      ) : main.status === 'error' ? <p>{t('footer.contactsUnavailable')}</p> : null}
      <Link to={`/${lang}/branches`} className="btn mt-auto self-start">{t('home.contacts.find')}</Link>
    </div>
  );
}
