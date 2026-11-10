# Развёртывание: безопасность и SEO (ЭТАП 13)

Прототип запускается локально (README). Этот документ — что нужно включить на боевом стенде, чтобы
защита, проверенная тестами, работала и там. Стенда по HTTPS у прототипа нет (S-001 остаётся IN PROGRESS).

## Переменные окружения backend

| Переменная | Значение на стенде | Зачем |
|---|---|---|
| `NODE_ENV` | `production` | Cookie с флагом `Secure` и заголовок HSTS в ответах API |
| `TRUST_PROXY` | адрес своего обратного прокси, например `loopback` или `10.0.0.0/8` | Адрес клиента для ограничителей частоты (вход, отзывы, помощник) берётся из `X-Forwarded-For`, исходный Host — из `X-Forwarded-Host`. По умолчанию `false`: без своего прокси клиент мог бы подставить любой адрес и обойти ограничение. Значение `true` допустимо, только если до backend нельзя достучаться в обход прокси |
| `ADMIN_ALLOWED_ORIGINS` | обычно пусто | Дополнительные источники для изменяющих запросов (CSRF, S-007) |

## Сборка frontend

`SITE_URL=https://<адрес сайта> npm run build -w frontend` — тогда в `dist/` появится `sitemap.xml`
(разделы сайта на трёх языках с `hreflang`), а в `robots.txt` — строка `Sitemap:`. Без `SITE_URL` sitemap не
создаётся: адрес сайта не выдумываем. `robots.txt` закрывает `/admin`, `/api/` и страницы поиска.

В `index.html` сборки добавляется CSP в `<meta>`:
`default-src 'self'`, скрипты только свои и встроенный скрипт настроек доступности по хешу sha256,
изображения — свои, `data:` и плитки `https://tile.openstreetmap.org`, `connect-src 'self'`, `object-src 'none'`.
Встроенные стили разрешены (их использует Leaflet и настройки доступности). Хеш пересчитывается при каждой сборке.

## Заголовки веб-сервера (nginx)

Через `<meta>` нельзя задать `frame-ancestors`, HSTS и запрет встраивания, поэтому для статики сайта:

```nginx
add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;
add_header X-Frame-Options "DENY" always;
add_header X-Content-Type-Options "nosniff" always;
add_header Referrer-Policy "strict-origin-when-cross-origin" always;
add_header Permissions-Policy "camera=(), microphone=(), payment=(), geolocation=(self)" always;
add_header Content-Security-Policy "frame-ancestors 'none'" always;
# SPA: все адреса без файла отдаются index.html
location / { try_files $uri /index.html; }
# Панель: по возможности только из сети архива (S-009)
location /admin { allow 10.0.0.0/8; deny all; try_files $uri /index.html; }
location /api/ { proxy_pass http://127.0.0.1:3000; proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for; proxy_set_header X-Forwarded-Host $host; proxy_set_header X-Forwarded-Proto $scheme; }
```

`vite preview` (e2e) отдаёт те же заголовки, кроме HSTS и CSP-заголовка (CSP там из `<meta>`).
Ответы API заголовки ставит сам backend (`backend/src/app.ts`): `nosniff`, `X-Frame-Options: DENY`,
`Referrer-Policy`, `Cross-Origin-Resource-Policy: same-origin`, `Cross-Origin-Opener-Policy`,
`Permissions-Policy`, CSP `default-src 'none'; frame-ancestors 'none'` (маршруты просмотра сканов задают свою, ещё строже — `sandbox`),
HSTS при `NODE_ENV=production`.

## Ограничения SEO (честно)

Сайт — SPA без серверной отрисовки. Заголовок, описание, Open Graph, канонический адрес и `hreflang`
ставятся в браузере (`usePageMeta`, `lib/head.ts`): их видят поисковики, исполняющие JavaScript (Google, Яндекс),
но не превью мессенджеров. Серверная подстановка мета и JSON-LD (I-015, Q-08) не сделаны.
