/**
 * Фрагмент с подсветкой совпадений от API: текст уже экранирован сервером, разрешён только <mark>.
 * Не используем innerHTML: разбиваем по <mark>, декодируем сущности и строим React-элементы.
 */
const ENTITIES: Record<string, string> = { '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&#39;': "'" };
const decode = (text: string) => text.replace(/&(?:amp|lt|gt|quot|#39);/g, (e) => ENTITIES[e] ?? e);

export function Highlight({ html }: { html: string }) {
  const parts = html.split(/(<mark>.*?<\/mark>)/g).filter(Boolean);
  return (
    <>
      {parts.map((part, i) =>
        part.startsWith('<mark>') ? <mark key={i}>{decode(part.slice(6, -7))}</mark> : <span key={i}>{decode(part)}</span>,
      )}
    </>
  );
}
