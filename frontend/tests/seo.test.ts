import { describe, expect, it } from 'vitest';
import { contentSecurityPolicy, inlineScriptHashes, sitemapXml } from '../build/security-plugin.ts';
import { setLanguageLinks, setMeta } from '../src/lib/head.ts';

describe('метаданные страницы', () => {
  it('setMeta создаёт, обновляет и удаляет тег', () => {
    setMeta({ name: 'description' }, 'Первое');
    setMeta({ name: 'description' }, 'Второе');
    expect(document.head.querySelectorAll('meta[name="description"]')).toHaveLength(1);
    expect(document.head.querySelector('meta[name="description"]')?.getAttribute('content')).toBe('Второе');
    setMeta({ property: 'og:title' }, 'Заголовок');
    expect(document.head.querySelector('meta[property="og:title"]')?.getAttribute('content')).toBe('Заголовок');
    setMeta({ name: 'description' }, null);
    expect(document.head.querySelector('meta[name="description"]')).toBeNull();
  });

  it('канонический адрес и hreflang для всех языков, без дублей при повторном вызове', () => {
    setLanguageLinks('https://example.test', '/ru/catalog/documents/1');
    setLanguageLinks('https://example.test', '/ru/faq');
    const canonical = document.head.querySelectorAll('link[rel="canonical"]');
    expect(canonical).toHaveLength(1);
    expect(canonical[0]?.getAttribute('href')).toBe('https://example.test/ru/faq');
    const alternates = [...document.head.querySelectorAll<HTMLLinkElement>('link[rel="alternate"]')].map((l) => [l.hreflang, l.getAttribute('href')]);
    expect(alternates).toEqual([
      ['kk', 'https://example.test/kk/faq'],
      ['ru', 'https://example.test/ru/faq'],
      ['en', 'https://example.test/en/faq'],
      ['x-default', 'https://example.test/kk/faq'],
    ]);
    setLanguageLinks('https://example.test', '/en');
    expect(document.head.querySelector('link[hreflang="kk"]')?.getAttribute('href')).toBe('https://example.test/kk');
  });
});

describe('сборка: CSP и sitemap', () => {
  it('хеш считается только для встроенных скриптов', () => {
    const hashes = inlineScriptHashes('<script>a()</script><script type="module" src="/x.js"></script>');
    expect(hashes).toHaveLength(1);
    const csp = contentSecurityPolicy(hashes);
    expect(csp).toContain(`script-src 'self' 'sha256-${hashes[0]}'`);
    expect(csp).toContain("object-src 'none'");
    expect(csp).not.toContain('unsafe-eval');
    expect(csp).not.toMatch(/script-src[^;]*unsafe-inline/);
  });

  it('sitemap: разделы на трёх языках с альтернативами, без лишнего слеша', () => {
    const xml = sitemapXml('https://example.test/');
    expect(xml).toContain('<loc>https://example.test/kk/catalog</loc>');
    expect(xml).toContain('<xhtml:link rel="alternate" hreflang="en" href="https://example.test/en/catalog"/>');
    expect(xml).not.toContain('example.test//');
    expect(xml).not.toContain('/admin');
  });
});
