import { Eye, Menu, Pause, Phone, Play, Search, X } from 'lucide-react';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, NavLink, useLocation, useNavigate, useParams } from 'react-router';
import { useA11y } from '../../app/A11yProvider.tsx';
import { telHref, useMainBranch } from '../../lib/main-branch.ts';
import { SECTIONS, sectionHref, type SectionKey } from '../../lib/sections.ts';
import { LanguageSwitcher } from './LanguageSwitcher.tsx';
import { LowVisionBar } from './LowVisionBar.tsx';

/** Короткие подписи пунктов меню (дизайн 11.11.2026): полное название остаётся в title. */
const SHORT: ReadonlySet<SectionKey> = new Set(['catalog', 'history', 'exhibitions', 'news', 'faq']);

type BarMode = 'top' | 'up' | 'hidden';

/**
 * Шапка по ТЗ §4, с. 3 в дизайне 11.11.2026 (Header.dc.html): тёмная строка (режим работы, пауза анимации, телефон),
 * орнамент, герб и наименование, поиск, «Версия для слабовидящих», KZ/RU/EN, меню разделов.
 * При прокрутке вверх появляется компактная панель; пока она скрыта, её ссылки убраны из обхода с клавиатуры.
 */
export function Header() {
  const { t } = useTranslation();
  const { lang = 'kk' } = useParams();
  const { pathname } = useLocation();
  const { prefs, update } = useA11y();
  const navigate = useNavigate();
  const contacts = useMainBranch(lang);
  const [query, setQuery] = useState('');
  const [menuOpen, setMenuOpen] = useState(false);
  const [dropOpen, setDropOpen] = useState(false);
  const [bar, setBar] = useState<BarMode>('top');
  const lastY = useRef(0);
  const menuButton = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    setMenuOpen(false);
    setDropOpen(false);
  }, [pathname]);

  useEffect(() => {
    lastY.current = window.scrollY;
    const onScroll = () => {
      const y = window.scrollY;
      if (y < 260) {
        lastY.current = y;
        setBar('top');
        return;
      }
      const delta = y - lastY.current;
      if (Math.abs(delta) < 8) return;
      lastY.current = y;
      setBar(delta > 0 ? 'hidden' : 'up');
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  useEffect(() => {
    if (bar !== 'up') setDropOpen(false);
  }, [bar]);

  // Esc закрывает мобильное меню и возвращает фокус на кнопку.
  useEffect(() => {
    if (!menuOpen) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      setMenuOpen(false);
      menuButton.current?.focus();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [menuOpen]);

  const onSearch = (event: FormEvent) => {
    event.preventDefault();
    const q = query.trim();
    navigate(q ? `/${lang}/search?q=${encodeURIComponent(q)}` : `/${lang}/search`);
  };

  const branch = contacts.status === 'ready' ? contacts.branch : null;
  const barShown = bar === 'up';
  const barTab = barShown ? 0 : -1;
  const lowVisionLabel = t(prefs.mode ? 'header.lowVisionOff' : 'header.lowVisionOn');
  const lowVisionShort = t(prefs.mode ? 'header.lowVisionShortOff' : 'header.lowVisionShortOn');
  const toggleLowVision = () => update({ mode: !prefs.mode });

  const links = (variant: 'nav' | 'menu' | 'drop') =>
    SECTIONS.map((s) => {
      const full = t(`nav.${s.key}`);
      return (
        <NavLink
          key={s.key}
          to={sectionHref(lang, s.path)}
          end={s.path === ''}
          className="hdr-link"
          title={variant === 'nav' && SHORT.has(s.key) ? full : undefined}
          tabIndex={variant === 'drop' ? barTab : undefined}
        >
          {variant === 'nav' && SHORT.has(s.key) ? t(`navShort.${s.key}`) : full}
        </NavLink>
      );
    });

  return (
    <>
      <LowVisionBar />
      <header className="hdr">
        <div className="hdr-top">
          <div className="wrap d-row hdr-top-in">
            <span className="hdr-official">{t('header.official')}</span>
            <span className="d-row hdr-top-end">
              {branch?.scheduleText ? <span className="hdr-hours">{branch.scheduleText}</span> : null}
              <button type="button" className="motion-btn" aria-pressed={prefs.still} aria-label={t('header.motionAria')}
                onClick={() => update({ still: !prefs.still })}>
                {prefs.still ? <Play aria-hidden="true" className="size-4" /> : <Pause aria-hidden="true" className="size-4" />}
                <span className="motion-t">{t(prefs.still ? 'header.motionStart' : 'header.motionStop')}</span>
              </button>
              <button type="button" className="a11y-top show-m" aria-pressed={prefs.mode} onClick={toggleLowVision}>
                <Eye aria-hidden="true" className="size-[18px]" />{lowVisionShort}
              </button>
              {branch?.phone ? (
                <a href={telHref(branch.phone)} className="hdr-phone">
                  <Phone aria-hidden="true" className="bell size-[18px] text-[var(--gold)]" />{branch.phone}
                </a>
              ) : null}
            </span>
          </div>
        </div>
        <div className="hdr-orn" aria-hidden="true"><div className="orn-band drift" /></div>

        <div className="wrap hdr-main">
          <Link to={`/${lang}`} className="hdr-brand" aria-label={t('site.homeLink')}>
            <img className="seal" src="/design/logo-seal-256.png" alt="" width={64} height={65} />
            <span className="d-col hdr-brand-text">
              <span className="hdr-name">{t('site.name')}</span>
              <span className="hdr-tag">{t('site.tagline')}</span>
            </span>
          </Link>
          <form className="hdr-search" role="search" aria-label={t('header.searchFull')} onSubmit={onSearch}>
            <label htmlFor="site-search" className="sr-only">{t('header.searchLabel')}</label>
            <input id="site-search" type="search" name="q" value={query} onChange={(e) => setQuery(e.target.value)}
              placeholder={t('header.searchPlaceholder')} maxLength={200} className="field" />
            <button type="submit" className="btn">
              <Search aria-hidden="true" className="size-5" />{t('header.searchSubmit')}
            </button>
          </form>
          <button type="button" className="a11y-btn hide-m" aria-pressed={prefs.mode} onClick={toggleLowVision}>
            <span className="a11y-ico"><Eye aria-hidden="true" className="size-[22px]" /></span>{lowVisionLabel}
          </button>
          <LanguageSwitcher className="hide-m" />
          <button ref={menuButton} type="button" className="btn dark sm hdr-burger" aria-expanded={menuOpen} aria-controls="hdr-menu"
            onClick={() => setMenuOpen((open) => !open)}>
            {menuOpen ? <X aria-hidden="true" className="size-[22px]" /> : <Menu aria-hidden="true" className="size-[22px]" />}
            {t(menuOpen ? 'header.close' : 'header.menuOpen')}
          </button>
        </div>

        <nav id="hdr-menu" className={menuOpen ? 'hdr-menu open' : 'hdr-menu'} aria-label={t('header.menuTitle')}>
          {menuOpen ? (
            <>
              {links('menu')}
              <LanguageSwitcher className="hdr-menu-lang" />
            </>
          ) : null}
        </nav>

        <nav className="wrap hdr-nav" aria-label={t('nav.label')}>{links('nav')}</nav>
      </header>

      <div className={barShown ? 'hdr-bar show' : 'hdr-bar'} aria-hidden={!barShown}>
        <div className="wrap hdr-bar-in">
          <Link to={`/${lang}`} className="hdr-brand" aria-label={t('site.homeLink')} tabIndex={barTab}>
            <img className="seal" src="/design/logo-seal-256.png" alt="" width={44} height={45} />
            <span className="hdr-bar-name">{t('site.shortName')}</span>
          </Link>
          <button type="button" className="btn ghost sm" aria-expanded={dropOpen && barShown} aria-controls="hdr-drop"
            tabIndex={barTab} onClick={() => setDropOpen((open) => !open)}>
            {dropOpen ? <X aria-hidden="true" className="size-5" /> : <Menu aria-hidden="true" className="size-5" />}
            {t('header.sections')}
          </button>
          <Link to={`/${lang}/catalog`} className="btn sm hide-m" tabIndex={barTab}>
            <Search aria-hidden="true" className="size-5" />{t('header.catalogSearch')}
          </Link>
          <button type="button" className="a11y-btn a11y-btn-bar" aria-pressed={prefs.mode} tabIndex={barTab} onClick={toggleLowVision}>
            <span className="a11y-ico"><Eye aria-hidden="true" className="size-[22px]" /></span>{lowVisionShort}
          </button>
          {branch?.phone ? (
            <a href={telHref(branch.phone)} className="hdr-bar-phone hide-m" tabIndex={barTab}>{branch.phone}</a>
          ) : null}
        </div>
        <nav id="hdr-drop" className={dropOpen && barShown ? 'wrap hdr-drop open' : 'wrap hdr-drop'} aria-label={t('header.sectionsBar')}>
          {dropOpen && barShown ? links('drop') : null}
        </nav>
      </div>
    </>
  );
}
