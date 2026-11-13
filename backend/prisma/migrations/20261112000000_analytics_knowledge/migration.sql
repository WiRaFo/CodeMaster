-- Аналитика качества сайта без персональных данных (ТЗ §5.8 Д, с. 11; F-126, F-127, S-032):
-- только счётчики по дням — раздел и язык просмотра, вид и адрес ошибки. Ни IP, ни идентификаторов, ни cookies.
CREATE TABLE analytics_page_views (
  day     date        NOT NULL,
  section text        NOT NULL,
  locale  "Locale"    NOT NULL,
  views   integer     NOT NULL DEFAULT 0,
  PRIMARY KEY (day, section, locale)
);

CREATE TABLE analytics_errors (
  day   date    NOT NULL,
  kind  text    NOT NULL,
  path  text    NOT NULL,
  count integer NOT NULL DEFAULT 0,
  PRIMARY KEY (day, kind, path)
);

-- База знаний ИИ-помощника: вопросы и готовые ответы, которые ведут сотрудники (ТЗ §5.8 А, с. 10).
-- Помощник ищет совпадение по ключевым словам на языке вопроса и отвечает текстом из базы со ссылками на разделы.
CREATE TABLE assistant_knowledge (
  id                 uuid               PRIMARY KEY DEFAULT gen_random_uuid(),
  links              text[]             NOT NULL DEFAULT '{}',
  publication_status "PublicationStatus" NOT NULL DEFAULT 'draft',
  created_at         timestamptz(6)     NOT NULL DEFAULT now(),
  updated_at         timestamptz(6)     NOT NULL DEFAULT now(),
  created_by_id      uuid               REFERENCES users(id) ON DELETE SET NULL ON UPDATE CASCADE,
  updated_by_id      uuid               REFERENCES users(id) ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE TABLE assistant_knowledge_translations (
  entry_id uuid     NOT NULL REFERENCES assistant_knowledge(id) ON DELETE CASCADE ON UPDATE CASCADE,
  locale   "Locale" NOT NULL,
  question text     NOT NULL,
  keywords text[]   NOT NULL DEFAULT '{}',
  answer   text     NOT NULL,
  PRIMARY KEY (entry_id, locale)
);
