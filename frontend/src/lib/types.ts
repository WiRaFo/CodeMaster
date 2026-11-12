/** Ответы публичного API, которые использует интерфейс (docs/api-design.md). */

export type DataOrigin = 'verified' | 'migrated' | 'demo' | 'synthetic';

export interface Paged<T> {
  items: T[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

export interface Localized {
  contentLang: string | null;
  translationStatus: string | null;
  dataOrigin: DataOrigin;
}

export interface NewsSummary extends Localized {
  slug: string;
  title: string | null;
  lead: string | null;
  publishedAt: string;
  rubric: { slug: string; name: string | null } | null;
}

export interface NewsList extends Paged<NewsSummary> {
  /** Может отсутствовать в ответе старой версии API: тогда рубрики не показываются. */
  rubrics?: Array<{ slug: string; name: string | null; count: number }>;
}

export interface NewsItem extends NewsSummary {
  bodyText: string | null;
  sourceUrl: string | null;
}

export interface ArchiveCodeDto {
  fond: string;
  inventory?: string;
  case?: string;
  sheets?: string;
  formatted: string;
}

export interface DateRange {
  from: string | null;
  to: string | null;
  precision: string;
}

export interface HomeDocument extends Localized {
  id: string;
  title: string | null;
  archiveCode: ArchiveCodeDto;
  date: DateRange;
  hasDigitalCopy: boolean;
}

export interface DocumentSummary extends HomeDocument {
  documentNumber: string | null;
  type: { code: string; name: string | null };
  branch: { slug: string; name: string | null };
  access: 'open' | 'restricted';
  highlight: string | null;
}

/** Смысловой поиск: available=false — модель не подключена или не ответила. */
export interface SemanticResult {
  available: boolean;
  model: string | null;
  items: Array<DocumentSummary & { score: number }>;
}

export interface DocumentSearchResult extends Paged<DocumentSummary> {
  interpretedCode: { fond: string; inventory?: string; case?: string; formatted: string } | null;
}

export interface HomeData {
  news: NewsSummary[];
  exhibitions: Array<Localized & { slug: string; title: string | null; lead: string | null; yearFrom: number | null; yearTo: number | null }>;
  history: {
    topics: Array<{ slug: string; name: string | null; publicationCount: number }>;
    publications: Array<
      Localized & {
        slug: string;
        kind: string;
        title: string | null;
        lead: string | null;
        periodText: string | null;
        yearFrom: number | null;
        yearTo: number | null;
        publishedAt: string;
        topics: Array<{ slug: string; name: string | null }>;
      }
    >;
    documents: HomeDocument[];
  };
}

/** Подразделение архива (GET /branches). coordinates есть, только если они заполнены и подразделение показывается на карте. */
export interface BranchSummary extends Localized {
  id: string;
  slug: string;
  parentId: string | null;
  isMain: boolean;
  type: { code: string; name: string | null };
  name: string | null;
  shortName: string | null;
  address: string | null;
  settlement: { slug: string; name: string | null } | null;
  phone: string | null;
  email: string | null;
  coordinates: { lat: number; lng: number } | null;
  needsVerification: boolean;
}

/** Карточка подразделения (GET /branches/:slug; ТЗ §5.5, с. 7). */
export interface BranchDetail extends BranchSummary {
  postalCode: string | null;
  website: string | null;
  scheduleText: string | null;
  readingRoomSchedule: string | null;
  description: string | null;
  mainDirections: string | null;
  competence: string | null;
  serviceArea: string | null;
  accessibilityInfo: string | null;
  sourceUrl: string | null;
  verifiedAt: string | null;
  sites: BranchSummary[];
  highlightedFonds: Array<{ id: string; number: string; title: string | null }>;
  staff: StaffContact[];
}

/** Контакт сотрудника из сведений, переданных архивом. */
export interface StaffContact {
  id: string;
  fullName: string;
  position: string;
  department: string | null;
  phone: string | null;
  email: string | null;
  contentLang: string;
  translationStatus: string;
}

export type HistoryBlock = { type: 'p' | 'h'; text: string } | { type: 'ol' | 'ul'; items: string[] };

/** Раздел «Об архиве» из панели (история, деятельность и т. д.). */
export interface AboutSection {
  key: string;
  title: string;
  lead: string | null;
  blocks: InfoBlock[];
  actualizedAt: string | null;
  contentLang: string;
  translationStatus: string;
  dataOrigin: DataOrigin;
}

/** Ответ /about: история и другие разделы, структура, соцсети, фотогалерея учреждения. */
export interface AboutInfo {
  history: AboutSection | null;
  sections: AboutSection[];
  staff: StaffContact[];
  social: Array<{ network: 'instagram' | 'facebook'; label: string; url: string }>;
  gallery: Array<{ url: string; width: number | null; height: number | null; alt: string; caption: string | null; contentLang: string | null; dataOrigin: DataOrigin }>;
}

export interface FacetValue {
  slug?: string;
  code?: string;
  value?: string;
  name: string | null;
  count: number;
}

export interface CatalogFacets {
  types: FacetValue[];
  periods: FacetValue[];
  branches: FacetValue[];
  settlements: FacetValue[];
  topics: FacetValue[];
  /** 30 самых частых организаций выдачи; value — id. Старый API поле не отдаёт. */
  organizations?: FacetValue[];
  access: Array<{ value: 'open' | 'restricted'; count: number }>;
  hasDigitalCopy: { true: number; false: number };
}

/** Карточка документа (GET /catalog/documents/:id). Для ограниченного доступа нет копии и расшифровки. */
interface DocumentCardBase extends Localized {
  id: string;
  title: string | null;
  description: string | null;
  historicalNote: string | null;
  availableLanguages: string[];
  archiveCode: ArchiveCodeDto;
  documentNumber: string | null;
  date: DateRange;
  period: { slug: string; name: string | null } | null;
  type: { code: string; name: string | null };
  originalLanguages: string[];
  sheetCount: number | null;
  author: string | null;
  organization: { id: string; name: string | null } | null;
  storage: { branch: { slug: string; name: string | null }; location: string | null };
  hierarchy: {
    fond: { id: string; number: string; title: string | null };
    inventory: { id: string; number: string; title: string | null };
    case: { id: string; number: string; title: string | null };
  };
  settlements: Array<{ slug: string; name: string | null }>;
  topics: Array<{ slug: string; kind: string; name: string | null }>;
  sourceNote: string | null;
  updatedAt: string;
}

export interface OpenDocumentCard extends DocumentCardBase {
  access: 'open';
  accessConditions: null;
  digitalCopy: { availableOnline: boolean; pageCount: number };
  transcription: string | null;
}

export interface RestrictedDocumentCard extends DocumentCardBase {
  access: 'restricted';
  accessConditions: string | null;
  digitalCopy: { availableOnline: false };
}

export type DocumentCard = OpenDocumentCard | RestrictedDocumentCard;

export interface DocumentPageItem {
  pageNumber: number;
  sheetLabel: string | null;
  assetId: string;
  mimeType: string;
  width: number | null;
  height: number | null;
  alt: string | null;
  altLang: string | null;
  downloadAllowed: boolean;
}

/** ЭТАП 8. Онлайн-выставки (ТЗ §5.7). */
export interface ExhibitionTopic {
  slug: string;
  name: string | null;
}

export interface ExhibitionSummary extends Localized {
  slug: string;
  title: string | null;
  lead: string | null;
  yearFrom: number | null;
  yearTo: number | null;
  topics: ExhibitionTopic[];
  itemCount: number;
  /** Номер экспоната, изображение которого служит обложкой. */
  coverItem: number | null;
}

export interface ExhibitionList extends Paged<ExhibitionSummary> {
  topics: Array<ExhibitionTopic & { count: number }>;
}

export interface ExhibitItem extends Omit<Localized, 'dataOrigin'> {
  number: number;
  title: string | null;
  description: string | null;
  sourceNote: string | null;
  image: { alt: string | null; width: number | null; height: number | null } | null;
  document: { id: string; title: string | null; access: 'open' | 'restricted'; code: { formatted: string } } | null;
  fond: { id: string; number: string; title: string | null } | null;
}

export interface ExhibitionDetail extends Omit<ExhibitionSummary, 'itemCount' | 'coverItem'> {
  description: string | null;
  items: ExhibitItem[];
}

export interface PeriodRef {
  slug: string;
  name: string;
  yearFrom: number | null;
  yearTo: number | null;
}

/** ЭТАП 12. Ответ архивного помощника (GET /assistant/ask). Текст ответа строится по словарю интерфейса. */
export type AssistantSection = 'exhibitions' | 'news' | 'history' | 'accessibility' | 'faq' | 'about' | 'visitors' | 'catalog' | 'branches';
export type AssistantRecognized =
  | { kind: 'years'; yearFrom: number; yearTo: number; text: string }
  | { kind: 'type' | 'settlement' | 'topic'; value: string; label: string; text: string };
export interface AssistantDocument {
  id: string;
  title: string | null;
  code: string | null;
  date: { from: string | null; to: string | null };
  type: string | null;
  access: 'open' | 'restricted';
  hasDigitalCopy: boolean;
  dataOrigin: DataOrigin;
}
export type AssistantAnswer =
  | { intent: 'service_request' | 'navigation'; links: AssistantSection[] }
  /** semantic — документы, похожие по смыслу (только при подключённой модели ИИ). */
  | { intent: 'unknown'; links: AssistantSection[]; semantic?: AssistantDocument[] }
  | { intent: 'term'; term: string; links: AssistantSection[] }
  | {
      intent: 'branch';
      recognized: AssistantRecognized[];
      links: AssistantSection[];
      branches: Array<{ slug: string; name: string | null; address: string | null; phone: string | null; email: string | null; needsVerification: boolean }>;
    }
  | {
      intent: 'search';
      recognized: AssistantRecognized[];
      total: number;
      catalogQuery: string;
      requestedQuery: string;
      dropped: Array<'topic' | 'keywords' | 'type'>;
      documents: AssistantDocument[];
      suggestions: Array<{ reason: 'withCopy' | 'prevDecade' | 'nextDecade' | 'allTypes'; query: string }>;
      semantic?: AssistantDocument[];
    };

/** ЭТАП 7. Публикация цифровой истории региона (GET /history, /history/:slug; ТЗ §5.6). */
export interface PublicationSummary extends Localized {
  slug: string;
  kind: string;
  title: string | null;
  lead: string | null;
  periodText: string | null;
  yearFrom: number | null;
  yearTo: number | null;
  publishedAt: string;
  topics: Array<{ slug: string; name: string | null }>;
  settlements: Array<{ slug: string; name: string | null }>;
  /** Обложка, если файл проверен и открыт; alt — описание для незрячих. Старый API поле не отдаёт. */
  cover?: { url: string; alt: string } | null;
}
export interface PublicationList extends Paged<PublicationSummary> {
  topics: Array<{ slug: string; name: string | null; count: number }>;
  /** Населённые пункты с публикациями. Старый API поле не отдаёт. */
  settlements?: Array<{ slug: string; name: string | null; count: number }>;
}
export interface PublicationDetail extends PublicationSummary {
  bodyText: string | null;
  sourceNote: string | null;
  authorship: string | null;
  sourceUrl: string | null;
  document: { id: string; title: string | null; access: 'open' | 'restricted'; code: { formatted: string } } | null;
  related: PublicationSummary[];
  persons: Array<{ slug: string; fullName: string; lifeYears: string | null }>;
  events: Array<{ slug: string; year: number; title: string }>;
  /** Фото внутри публикации: только проверенные файлы. Старый API поле не отдаёт. */
  images?: Array<{ url: string; alt: string; caption: string | null; contentLang: string | null }>;
}

export interface CalendarItem {
  id: string;
  month: number | null;
  day: number | null;
  dateLabel: string;
  text: string;
  contentLang: string;
  translationStatus: string;
}

/** Ответ /calendar: доступные годы, выбранный год и записи. */
export interface CalendarData {
  years: number[];
  year: number | null;
  items: CalendarItem[];
}

/** Ответ /anticorruption. */
export interface AnticorruptionInfo {
  text: { title: string; blocks: HistoryBlock[]; contentLang: string; translationStatus: string } | null;
  officer: { fullName: string; position: string } | null;
  documents: Array<{
    key: string;
    title: string;
    scanned: boolean;
    files: Array<{ locale: string; url: string; sizeBytes: number; pages: number }>;
  }>;
}

/** Блок справочной страницы (GET /pages/:key): pending — сведения, которые архив ещё не передал. */
export type InfoBlock =
  | { type: 'p' | 'h' | 'pending'; text: string }
  | { type: 'ol' | 'ul'; items: string[] }
  | { type: 'links'; items: Array<{ label: string; url: string; note?: string }> };

export interface InfoPageData {
  key: string;
  title: string;
  lead: string | null;
  blocks: InfoBlock[];
  actualizedAt: string;
  contentLang: string;
  translationStatus: string;
  dataOrigin: DataOrigin;
}

/** Навигация по каталогу: фонд → опись → дело → документ (F-030). */
export type AccessDto = 'open' | 'restricted';
export interface FondSummary extends Localized {
  id: string;
  number: string;
  archiveCode: ArchiveCodeDto;
  title: string | null;
  annotation: string | null;
  historyNote: string | null;
  kind: 'organization' | 'personal' | 'collection';
  years: { from: number | null; to: number | null };
  unitsCount: number | null;
  access: AccessDto;
  branch: { slug: string; name: string | null };
}
export interface FondDetail extends FondSummary {
  inventories: Array<{ id: string; number: string; title: string | null; contentLang: string | null; years: { from: number | null; to: number | null }; access: AccessDto }>;
}
export interface InventoryDetail extends Localized {
  id: string;
  number: string;
  title: string | null;
  annotation: string | null;
  archiveCode: ArchiveCodeDto;
  years: { from: number | null; to: number | null };
  access: AccessDto;
  fond: { id: string; number: string; title: string | null };
  cases: Array<{ id: string; number: string; title: string | null; contentLang: string | null; date: DateRange; sheetCount: number | null; access: AccessDto }>;
}
export interface CaseDetail extends Localized {
  id: string;
  number: string;
  title: string | null;
  annotation: string | null;
  archiveCode: ArchiveCodeDto;
  date: DateRange;
  sheetCount: number | null;
  access: AccessDto;
  fond: { id: string; number: string; title: string | null };
  inventory: { id: string; number: string; title: string | null };
  documents: DocumentSummary[];
}

/** Событие хронологической ленты (GET /history/timeline, F-083). date — только если день известен. */
export interface TimelineEvent extends Localized {
  slug: string;
  year: number;
  date: string | null;
  precision: string;
  title: string | null;
  description: string | null;
  sourceNote: string | null;
  dataOrigin: DataOrigin;
  publications: Array<{ slug: string; title: string | null }>;
}

/** Историческая личность (GET /history/persons, F-086). */
export interface PersonSummary extends Localized {
  slug: string;
  fullName: string;
  lifeYears: string | null;
  dataOrigin: DataOrigin;
}
export interface PersonDetail extends PersonSummary {
  biography: string | null;
  sourceNote: string | null;
  memorableDates: Array<{ calendarYear: number; dateLabel: string; text: string; contentLang: string }>;
  publications: PublicationSummary[];
}

/** Тематическая коллекция (GET /history/collections, F-081). itemCount — только видимые на сайте элементы. */
export interface CollectionSummary extends Localized {
  slug: string;
  title: string | null;
  description: string | null;
  itemCount: number;
  dataOrigin: DataOrigin;
}
export interface CollectionDetail extends CollectionSummary {
  documents: DocumentSummary[];
  persons: Array<{ slug: string; fullName: string; lifeYears: string | null; contentLang: string | null }>;
}

/** Плитка галереи (GET /history/gallery, F-085): документ и его первая публичная страница. */
export interface GalleryItem extends DocumentSummary {
  image: { url: string; width: number | null; height: number | null };
}
