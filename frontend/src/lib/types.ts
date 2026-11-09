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

export interface BranchSummary {
  slug: string;
  isMain: boolean;
  name: string | null;
  shortName: string | null;
  address: string | null;
  phone: string | null;
  needsVerification: boolean;
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
