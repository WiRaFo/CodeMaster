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
