#!/usr/bin/env bash
# Lighthouse по ключевым страницам (ЭТАП 14). Нужны: API на :3000 с сидами, собранный frontend (vite build).
# Запуск из корня: bash frontend/scripts/lighthouse.sh [папка для отчётов]
# Chromium: переменная CHROME_PATH (иначе Lighthouse ищет установленный Chrome).
set -euo pipefail
OUT="${1:-lighthouse-reports}"
PORT=4176
BASE="http://127.0.0.1:${PORT}"
mkdir -p "$OUT"
cd "$(dirname "$0")/.."
npx vite preview --port "$PORT" --strictPort >/dev/null 2>&1 &
PREVIEW=$!
trap 'kill $PREVIEW' EXIT
for i in $(seq 1 50); do curl -sf "$BASE/ru" >/dev/null && break; sleep 0.2; done

DOC_ID=$(curl -s "$BASE/api/v1/catalog/documents?q=%D0%BC%D0%B0%D1%81%D0%BB%D0%BE%D0%B7%D0%B0%D0%B2%D0%BE%D0%B4&lang=ru&pageSize=50" \
  | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{const j=JSON.parse(s);const d=j.items.find(x=>x.access==="open"&&x.hasDigitalCopy);process.stdout.write(d?d.id:"")})')
PAGES=("home:/ru" "home-kk:/kk" "catalog:/ru/catalog?q=%D0%BF%D1%80%D0%BE%D1%82%D0%BE%D0%BA%D0%BE%D0%BB" "document:/ru/catalog/documents/${DOC_ID}" "exhibition:/ru/exhibitions/demo-exhibition-example" "branches:/ru/branches" "history:/ru/history" "assistant:/kk/assistant" "feedback:/en/feedback")

printf '| Страница | Режим | Производительность | Доступность | Практики | SEO | LCP, с | CLS | TBT, мс |\n|---|---|---|---|---|---|---|---|---|\n'
for entry in "${PAGES[@]}"; do
  name="${entry%%:*}"; path="${entry#*:}"
  for mode in mobile desktop; do
    flags=(); [ "$mode" = desktop ] && flags=(--preset=desktop)
    npx -y lighthouse@13.6.0 "$BASE$path" "${flags[@]}" --chrome-flags="--headless=new --no-sandbox" \
      --only-categories=performance,accessibility,best-practices,seo --output=json --output-path="$OUT/$name-$mode.json" --quiet
    node -e '
      const r = require(process.argv[1]); const c = r.categories, a = r.audits;
      const p = (k) => Math.round(c[k].score * 100);
      console.log(`| ${process.argv[2]} | ${process.argv[3]} | ${p("performance")} | ${p("accessibility")} | ${p("best-practices")} | ${p("seo")} | ${(a["largest-contentful-paint"].numericValue/1000).toFixed(1)} | ${a["cumulative-layout-shift"].numericValue.toFixed(3)} | ${Math.round(a["total-blocking-time"].numericValue)} |`);
    ' "$(realpath "$OUT/$name-$mode.json")" "$path" "$mode"
  done
done
