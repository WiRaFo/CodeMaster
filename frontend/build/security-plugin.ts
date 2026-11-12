import { createHash } from 'node:crypto';
import type { Plugin } from 'vite';

/** Адреса страниц, попадающие в sitemap.xml: разделы сайта на трёх языках (карточки документов — нет). */
export const SITEMAP_PATHS = ['', '/catalog', '/history', '/exhibitions', '/news', '/branches', '/assistant', '/faq', '/visitors', '/about', '/feedback', '/accessibility'] as const;
const LANGS = ['kk', 'ru', 'en'] as const;

/** Политика CSP сборки: скрипты только свои и встроенный скрипт настроек доступности по хешу; плитки карты — OSM. */
export function contentSecurityPolicy(inlineScriptHashes: readonly string[]): string {
  return [
    "default-src 'self'",
    `script-src 'self' ${inlineScriptHashes.map((h) => `'sha256-${h}'`).join(' ')}`.trim(),
    // Встроенные стили используют Leaflet (позиционирование плиток) и переменные доступности.
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: https://tile.openstreetmap.org",
    "font-src 'self'",
    "connect-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
  ].join('; ');
}

const INLINE_SCRIPT = /<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g;

export function inlineScriptHashes(html: string): string[] {
  return [...html.matchAll(INLINE_SCRIPT)].map((m) => createHash('sha256').update(m[1] ?? '').digest('base64'));
}

export function sitemapXml(siteUrl: string): string {
  const base = siteUrl.replace(/\/+$/, '');
  const urls = SITEMAP_PATHS.flatMap((path) =>
    LANGS.map((lang) => {
      const links = LANGS.map((l) => `    <xhtml:link rel="alternate" hreflang="${l}" href="${base}/${l}${path}"/>`).join('\n');
      return `  <url>\n    <loc>${base}/${lang}${path}</loc>\n${links}\n  </url>`;
    }),
  );
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">\n${urls.join('\n')}\n</urlset>\n`;
}

/**
 * Только для сборки: CSP в <meta> (работает на любом статическом хостинге; frame-ancestors и HSTS
 * задаются заголовками веб-сервера, см. docs/deployment.md) и sitemap.xml, если известен адрес сайта (SITE_URL).
 */
export function securityPlugin(siteUrl: string | undefined): Plugin {
  return {
    name: 'archive-security',
    apply: 'build',
    transformIndexHtml: {
      order: 'post',
      handler(html) {
        const csp = contentSecurityPolicy(inlineScriptHashes(html));
        return html.replace('<meta charset="UTF-8" />', `<meta charset="UTF-8" />\n    <meta http-equiv="Content-Security-Policy" content="${csp}" />`);
      },
    },
    generateBundle() {
      const robots = ['User-agent: *', 'Disallow: /admin', 'Disallow: /api/', 'Disallow: /*/search', ''];
      if (siteUrl) {
        this.emitFile({ type: 'asset', fileName: 'sitemap.xml', source: sitemapXml(siteUrl) });
        robots.push(`Sitemap: ${siteUrl.replace(/\/+$/, '')}/sitemap.xml`, '');
      }
      this.emitFile({ type: 'asset', fileName: 'robots.txt', source: robots.join('\n') });
    },
  };
}
