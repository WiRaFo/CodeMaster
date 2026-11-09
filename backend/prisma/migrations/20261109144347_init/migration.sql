-- CreateExtension
CREATE EXTENSION IF NOT EXISTS "citext";

-- CreateExtension
CREATE EXTENSION IF NOT EXISTS "pg_trgm";

-- CreateExtension
CREATE EXTENSION IF NOT EXISTS "unaccent";

-- CreateExtension
CREATE EXTENSION IF NOT EXISTS "vector";

-- CreateEnum
CREATE TYPE "Locale" AS ENUM ('kk', 'ru', 'en');

-- CreateEnum
CREATE TYPE "PublicationStatus" AS ENUM ('draft', 'in_review', 'needs_changes', 'approved', 'published', 'archived');

-- CreateEnum
CREATE TYPE "AccessLevel" AS ENUM ('open', 'restricted', 'closed');

-- CreateEnum
CREATE TYPE "DataOrigin" AS ENUM ('verified', 'migrated', 'demo', 'synthetic');

-- CreateEnum
CREATE TYPE "TranslationStatus" AS ENUM ('missing', 'machine', 'reviewed');

-- CreateEnum
CREATE TYPE "DatePrecision" AS ENUM ('day', 'month', 'year', 'decade');

-- CreateEnum
CREATE TYPE "FondKind" AS ENUM ('organization', 'personal', 'collection');

-- CreateEnum
CREATE TYPE "AssetKind" AS ENUM ('scan_page', 'image', 'pdf', 'video', 'audio', 'other');

-- CreateEnum
CREATE TYPE "ProcessingStatus" AS ENUM ('pending', 'ready', 'failed');

-- CreateEnum
CREATE TYPE "AntivirusStatus" AS ENUM ('pending', 'clean', 'infected');

-- CreateEnum
CREATE TYPE "OcrStatus" AS ENUM ('none', 'pending', 'done', 'failed');

-- CreateEnum
CREATE TYPE "DocumentRelationType" AS ENUM ('related', 'part_of', 'mentions', 'copy_of');

-- CreateEnum
CREATE TYPE "CategoryKind" AS ENUM ('catalog_topic', 'history_topic', 'news_rubric', 'exhibition_topic');

-- CreateEnum
CREATE TYPE "PublicationKind" AS ENUM ('article', 'photo_story', 'biography', 'memoir');

-- CreateEnum
CREATE TYPE "CollectionItemType" AS ENUM ('document', 'case', 'fond', 'publication', 'person', 'event', 'asset');

-- CreateEnum
CREATE TYPE "LinkCategory" AS ENUM ('legal', 'gov_resource', 'archive_resource', 'official_service');

-- CreateEnum
CREATE TYPE "FeedbackStatus" AS ENUM ('new', 'read', 'archived');

-- CreateEnum
CREATE TYPE "MigrationDecision" AS ENUM ('migrate', 'skip', 'needs_review');

-- CreateEnum
CREATE TYPE "ImportStatus" AS ENUM ('preview', 'committed', 'failed', 'cancelled');

-- CreateEnum
CREATE TYPE "SearchSource" AS ENUM ('catalog', 'site', 'assistant');

-- CreateTable
CREATE TABLE "users" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "email" CITEXT NOT NULL,
    "password_hash" TEXT NOT NULL,
    "full_name" TEXT NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "failed_login_count" INTEGER NOT NULL DEFAULT 0,
    "locked_until" TIMESTAMPTZ(6),
    "last_login_at" TIMESTAMPTZ(6),
    "totp_secret" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "deleted_at" TIMESTAMPTZ(6),

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "roles" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "code" TEXT NOT NULL,
    "name_ru" TEXT NOT NULL,
    "name_kk" TEXT NOT NULL,
    "name_en" TEXT NOT NULL,
    "description" TEXT,
    "is_system" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "roles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "permissions" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "code" TEXT NOT NULL,
    "description" TEXT,

    CONSTRAINT "permissions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "role_permissions" (
    "role_id" UUID NOT NULL,
    "permission_id" UUID NOT NULL,

    CONSTRAINT "role_permissions_pkey" PRIMARY KEY ("role_id","permission_id")
);

-- CreateTable
CREATE TABLE "user_roles" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID NOT NULL,
    "role_id" UUID NOT NULL,
    "branch_id" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_roles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sessions" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID NOT NULL,
    "token_hash" TEXT NOT NULL,
    "csrf_token_hash" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_seen_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expires_at" TIMESTAMPTZ(6) NOT NULL,
    "ip" TEXT,
    "user_agent" TEXT,

    CONSTRAINT "sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" BIGSERIAL NOT NULL,
    "occurred_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "user_id" UUID,
    "action" TEXT NOT NULL,
    "entity_type" TEXT,
    "entity_id" TEXT,
    "summary" TEXT NOT NULL,
    "changes" JSONB,
    "ip" TEXT,
    "user_agent" TEXT,
    "request_id" TEXT,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notifications" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID,
    "role_id" UUID,
    "type" TEXT NOT NULL,
    "entity_type" TEXT NOT NULL,
    "entity_id" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "read_at" TIMESTAMPTZ(6),

    CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "locales" (
    "code" "Locale" NOT NULL,
    "name" TEXT NOT NULL,
    "is_enabled" BOOLEAN NOT NULL DEFAULT true,
    "sort_order" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "locales_pkey" PRIMARY KEY ("code")
);

-- CreateTable
CREATE TABLE "settlements" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "slug" TEXT NOT NULL,
    "lat" DECIMAL(9,6),
    "lng" DECIMAL(9,6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "settlements_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "settlement_translations" (
    "settlement_id" UUID NOT NULL,
    "locale" "Locale" NOT NULL,
    "name" TEXT NOT NULL,
    "translation_status" "TranslationStatus" NOT NULL DEFAULT 'missing',

    CONSTRAINT "settlement_translations_pkey" PRIMARY KEY ("settlement_id","locale")
);

-- CreateTable
CREATE TABLE "settlement_names" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "settlement_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "locale" "Locale",
    "valid_from" INTEGER,
    "valid_to" INTEGER,
    "note" TEXT,

    CONSTRAINT "settlement_names_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "organizations" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "slug" TEXT NOT NULL,
    "year_from" INTEGER,
    "year_to" INTEGER,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "organizations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "organization_translations" (
    "organization_id" UUID NOT NULL,
    "locale" "Locale" NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "translation_status" "TranslationStatus" NOT NULL DEFAULT 'missing',

    CONSTRAINT "organization_translations_pkey" PRIMARY KEY ("organization_id","locale")
);

-- CreateTable
CREATE TABLE "historical_periods" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "slug" TEXT NOT NULL,
    "year_from" INTEGER,
    "year_to" INTEGER,
    "sort_order" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "historical_periods_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "historical_period_translations" (
    "period_id" UUID NOT NULL,
    "locale" "Locale" NOT NULL,
    "name" TEXT NOT NULL,
    "translation_status" "TranslationStatus" NOT NULL DEFAULT 'missing',

    CONSTRAINT "historical_period_translations_pkey" PRIMARY KEY ("period_id","locale")
);

-- CreateTable
CREATE TABLE "document_types" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "code" TEXT NOT NULL,
    "sort_order" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "document_types_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "document_type_translations" (
    "document_type_id" UUID NOT NULL,
    "locale" "Locale" NOT NULL,
    "name" TEXT NOT NULL,
    "translation_status" "TranslationStatus" NOT NULL DEFAULT 'missing',

    CONSTRAINT "document_type_translations_pkey" PRIMARY KEY ("document_type_id","locale")
);

-- CreateTable
CREATE TABLE "categories" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "kind" "CategoryKind" NOT NULL,
    "slug" TEXT NOT NULL,
    "parent_id" UUID,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "categories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "category_translations" (
    "category_id" UUID NOT NULL,
    "locale" "Locale" NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "translation_status" "TranslationStatus" NOT NULL DEFAULT 'missing',

    CONSTRAINT "category_translations_pkey" PRIMARY KEY ("category_id","locale")
);

-- CreateTable
CREATE TABLE "tags" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "slug" TEXT NOT NULL,

    CONSTRAINT "tags_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tag_translations" (
    "tag_id" UUID NOT NULL,
    "locale" "Locale" NOT NULL,
    "name" TEXT NOT NULL,
    "translation_status" "TranslationStatus" NOT NULL DEFAULT 'missing',

    CONSTRAINT "tag_translations_pkey" PRIMARY KEY ("tag_id","locale")
);

-- CreateTable
CREATE TABLE "branch_types" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "code" TEXT NOT NULL,
    "sort_order" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "branch_types_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "branch_type_translations" (
    "branch_type_id" UUID NOT NULL,
    "locale" "Locale" NOT NULL,
    "name" TEXT NOT NULL,
    "translation_status" "TranslationStatus" NOT NULL DEFAULT 'missing',

    CONSTRAINT "branch_type_translations_pkey" PRIMARY KEY ("branch_type_id","locale")
);

-- CreateTable
CREATE TABLE "branches" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "slug" TEXT NOT NULL,
    "branch_type_id" UUID NOT NULL,
    "parent_branch_id" UUID,
    "is_main" BOOLEAN NOT NULL DEFAULT false,
    "settlement_id" UUID,
    "postal_code" TEXT,
    "lat" DECIMAL(9,6),
    "lng" DECIMAL(9,6),
    "phone" TEXT,
    "email" TEXT,
    "website" TEXT,
    "photo_asset_id" UUID,
    "show_on_map" BOOLEAN NOT NULL DEFAULT true,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "verified_at" DATE,
    "source_url" TEXT,
    "publication_status" "PublicationStatus" NOT NULL DEFAULT 'draft',
    "data_origin" "DataOrigin" NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "created_by_id" UUID,
    "updated_by_id" UUID,
    "deleted_at" TIMESTAMPTZ(6),

    CONSTRAINT "branches_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "branch_translations" (
    "branch_id" UUID NOT NULL,
    "locale" "Locale" NOT NULL,
    "full_name" TEXT NOT NULL,
    "short_name" TEXT,
    "address" TEXT,
    "schedule_text" TEXT,
    "reading_room_schedule" TEXT,
    "description" TEXT,
    "main_directions" TEXT,
    "competence" TEXT,
    "service_area" TEXT,
    "accessibility_info" TEXT,
    "translation_status" "TranslationStatus" NOT NULL DEFAULT 'missing',

    CONSTRAINT "branch_translations_pkey" PRIMARY KEY ("branch_id","locale")
);

-- CreateTable
CREATE TABLE "branch_schedules" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "branch_id" UUID NOT NULL,
    "weekday" INTEGER NOT NULL,
    "kind" TEXT NOT NULL DEFAULT 'office',
    "opens" TEXT NOT NULL,
    "closes" TEXT NOT NULL,
    "note" TEXT,

    CONSTRAINT "branch_schedules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "fonds" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "branch_id" UUID NOT NULL,
    "fond_number" TEXT NOT NULL,
    "fond_number_sort" INTEGER,
    "fond_kind" "FondKind" NOT NULL DEFAULT 'organization',
    "creator_org_id" UUID,
    "year_from" INTEGER,
    "year_to" INTEGER,
    "units_count" INTEGER,
    "is_highlighted" BOOLEAN NOT NULL DEFAULT false,
    "access_level" "AccessLevel" NOT NULL DEFAULT 'closed',
    "publication_status" "PublicationStatus" NOT NULL DEFAULT 'draft',
    "data_origin" "DataOrigin" NOT NULL,
    "source_note" TEXT,
    "source_system_id" TEXT,
    "raw_import" JSONB,
    "snapshot_date" DATE,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "created_by_id" UUID,
    "updated_by_id" UUID,
    "deleted_at" TIMESTAMPTZ(6),

    CONSTRAINT "fonds_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "fond_translations" (
    "fond_id" UUID NOT NULL,
    "locale" "Locale" NOT NULL,
    "title" TEXT NOT NULL,
    "history_note" TEXT,
    "annotation" TEXT,
    "translation_status" "TranslationStatus" NOT NULL DEFAULT 'missing',

    CONSTRAINT "fond_translations_pkey" PRIMARY KEY ("fond_id","locale")
);

-- CreateTable
CREATE TABLE "inventories" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "fond_id" UUID NOT NULL,
    "inventory_number" TEXT NOT NULL,
    "year_from" INTEGER,
    "year_to" INTEGER,
    "access_level" "AccessLevel" NOT NULL DEFAULT 'closed',
    "publication_status" "PublicationStatus" NOT NULL DEFAULT 'draft',
    "data_origin" "DataOrigin" NOT NULL,
    "source_system_id" TEXT,
    "raw_import" JSONB,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "created_by_id" UUID,
    "updated_by_id" UUID,
    "deleted_at" TIMESTAMPTZ(6),

    CONSTRAINT "inventories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "inventory_translations" (
    "inventory_id" UUID NOT NULL,
    "locale" "Locale" NOT NULL,
    "title" TEXT NOT NULL,
    "annotation" TEXT,
    "translation_status" "TranslationStatus" NOT NULL DEFAULT 'missing',

    CONSTRAINT "inventory_translations_pkey" PRIMARY KEY ("inventory_id","locale")
);

-- CreateTable
CREATE TABLE "cases" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "inventory_id" UUID NOT NULL,
    "case_number" TEXT NOT NULL,
    "date_from" DATE,
    "date_to" DATE,
    "date_precision" "DatePrecision" NOT NULL DEFAULT 'year',
    "sheet_count" INTEGER,
    "storage_location" TEXT,
    "access_level" "AccessLevel" NOT NULL DEFAULT 'closed',
    "publication_status" "PublicationStatus" NOT NULL DEFAULT 'draft',
    "data_origin" "DataOrigin" NOT NULL,
    "source_system_id" TEXT,
    "raw_import" JSONB,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "created_by_id" UUID,
    "updated_by_id" UUID,
    "deleted_at" TIMESTAMPTZ(6),

    CONSTRAINT "cases_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "case_translations" (
    "case_id" UUID NOT NULL,
    "locale" "Locale" NOT NULL,
    "title" TEXT NOT NULL,
    "annotation" TEXT,
    "translation_status" "TranslationStatus" NOT NULL DEFAULT 'missing',

    CONSTRAINT "case_translations_pkey" PRIMARY KEY ("case_id","locale")
);

-- CreateTable
CREATE TABLE "documents" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "case_id" UUID NOT NULL,
    "document_number" TEXT,
    "sheets_from" TEXT,
    "sheets_to" TEXT,
    "sheet_count" INTEGER,
    "date_from" DATE,
    "date_to" DATE,
    "date_precision" "DatePrecision" NOT NULL DEFAULT 'year',
    "period_id" UUID,
    "document_type_id" UUID NOT NULL,
    "original_languages" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "author_text" TEXT,
    "organization_id" UUID,
    "storage_location" TEXT,
    "access_level" "AccessLevel" NOT NULL DEFAULT 'closed',
    "has_digital_copy" BOOLEAN NOT NULL DEFAULT false,
    "is_featured" BOOLEAN NOT NULL DEFAULT false,
    "source_note" TEXT,
    "source_url" TEXT,
    "source_system_id" TEXT,
    "raw_import" JSONB,
    "publication_status" "PublicationStatus" NOT NULL DEFAULT 'draft',
    "data_origin" "DataOrigin" NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "created_by_id" UUID,
    "updated_by_id" UUID,
    "deleted_at" TIMESTAMPTZ(6),

    CONSTRAINT "documents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "document_translations" (
    "document_id" UUID NOT NULL,
    "locale" "Locale" NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "historical_note" TEXT,
    "access_conditions" TEXT,
    "transcription" TEXT,
    "seo_keywords" TEXT,
    "translation_status" "TranslationStatus" NOT NULL DEFAULT 'missing',
    "translated_by_id" UUID,
    "reviewed_by_id" UUID,
    "reviewed_at" TIMESTAMPTZ(6),
    "search_vector" tsvector,

    CONSTRAINT "document_translations_pkey" PRIMARY KEY ("document_id","locale")
);

-- CreateTable
CREATE TABLE "document_relations" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "source_document_id" UUID NOT NULL,
    "target_document_id" UUID,
    "target_case_id" UUID,
    "relation_type" "DocumentRelationType" NOT NULL DEFAULT 'related',
    "note" TEXT,

    CONSTRAINT "document_relations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "document_categories" (
    "document_id" UUID NOT NULL,
    "category_id" UUID NOT NULL,

    CONSTRAINT "document_categories_pkey" PRIMARY KEY ("document_id","category_id")
);

-- CreateTable
CREATE TABLE "document_settlements" (
    "document_id" UUID NOT NULL,
    "settlement_id" UUID NOT NULL,

    CONSTRAINT "document_settlements_pkey" PRIMARY KEY ("document_id","settlement_id")
);

-- CreateTable
CREATE TABLE "document_tags" (
    "document_id" UUID NOT NULL,
    "tag_id" UUID NOT NULL,

    CONSTRAINT "document_tags_pkey" PRIMARY KEY ("document_id","tag_id")
);

-- CreateTable
CREATE TABLE "document_persons" (
    "document_id" UUID NOT NULL,
    "person_id" UUID NOT NULL,

    CONSTRAINT "document_persons_pkey" PRIMARY KEY ("document_id","person_id")
);

-- CreateTable
CREATE TABLE "digital_assets" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "kind" "AssetKind" NOT NULL,
    "storage_bucket" TEXT NOT NULL,
    "storage_key" TEXT NOT NULL,
    "original_filename" TEXT NOT NULL,
    "mime_type" TEXT NOT NULL,
    "size_bytes" BIGINT NOT NULL,
    "sha256" TEXT NOT NULL,
    "phash" TEXT,
    "width" INTEGER,
    "height" INTEGER,
    "duration_seconds" INTEGER,
    "has_text_layer" BOOLEAN NOT NULL DEFAULT false,
    "captions_url" TEXT,
    "download_allowed" BOOLEAN NOT NULL DEFAULT false,
    "rights_note" TEXT,
    "source_note" TEXT,
    "access_level" "AccessLevel" NOT NULL DEFAULT 'closed',
    "processing_status" "ProcessingStatus" NOT NULL DEFAULT 'pending',
    "antivirus_status" "AntivirusStatus" NOT NULL DEFAULT 'pending',
    "ocr_status" "OcrStatus" NOT NULL DEFAULT 'none',
    "ocr_text" TEXT,
    "data_origin" "DataOrigin" NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "created_by_id" UUID,
    "deleted_at" TIMESTAMPTZ(6),

    CONSTRAINT "digital_assets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "asset_translations" (
    "asset_id" UUID NOT NULL,
    "locale" "Locale" NOT NULL,
    "alt_text" TEXT,
    "caption" TEXT,
    "long_description" TEXT,
    "transcript" TEXT,
    "translation_status" "TranslationStatus" NOT NULL DEFAULT 'missing',

    CONSTRAINT "asset_translations_pkey" PRIMARY KEY ("asset_id","locale")
);

-- CreateTable
CREATE TABLE "asset_derivatives" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "asset_id" UUID NOT NULL,
    "variant" TEXT NOT NULL,
    "format" TEXT NOT NULL,
    "storage_key" TEXT NOT NULL,
    "width" INTEGER,
    "height" INTEGER,
    "size_bytes" BIGINT,

    CONSTRAINT "asset_derivatives_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "document_assets" (
    "document_id" UUID NOT NULL,
    "asset_id" UUID NOT NULL,
    "page_number" INTEGER NOT NULL,
    "sheet_label" TEXT,

    CONSTRAINT "document_assets_pkey" PRIMARY KEY ("document_id","asset_id")
);

-- CreateTable
CREATE TABLE "historical_persons" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "slug" TEXT NOT NULL,
    "birth_year" INTEGER,
    "death_year" INTEGER,
    "portrait_asset_id" UUID,
    "source_note" TEXT,
    "publication_status" "PublicationStatus" NOT NULL DEFAULT 'draft',
    "data_origin" "DataOrigin" NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "created_by_id" UUID,
    "updated_by_id" UUID,
    "deleted_at" TIMESTAMPTZ(6),

    CONSTRAINT "historical_persons_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "historical_person_translations" (
    "person_id" UUID NOT NULL,
    "locale" "Locale" NOT NULL,
    "full_name" TEXT NOT NULL,
    "life_years_text" TEXT,
    "biography" TEXT,
    "translation_status" "TranslationStatus" NOT NULL DEFAULT 'missing',

    CONSTRAINT "historical_person_translations_pkey" PRIMARY KEY ("person_id","locale")
);

-- CreateTable
CREATE TABLE "historical_events" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "slug" TEXT NOT NULL,
    "event_date" DATE,
    "date_precision" "DatePrecision" NOT NULL DEFAULT 'year',
    "year" INTEGER NOT NULL,
    "settlement_id" UUID,
    "category_id" UUID,
    "source_note" TEXT,
    "publication_status" "PublicationStatus" NOT NULL DEFAULT 'draft',
    "data_origin" "DataOrigin" NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "created_by_id" UUID,
    "updated_by_id" UUID,
    "deleted_at" TIMESTAMPTZ(6),

    CONSTRAINT "historical_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "historical_event_translations" (
    "event_id" UUID NOT NULL,
    "locale" "Locale" NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "translation_status" "TranslationStatus" NOT NULL DEFAULT 'missing',

    CONSTRAINT "historical_event_translations_pkey" PRIMARY KEY ("event_id","locale")
);

-- CreateTable
CREATE TABLE "publications" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "slug" TEXT NOT NULL,
    "kind" "PublicationKind" NOT NULL DEFAULT 'article',
    "period_text" TEXT,
    "year_from" INTEGER,
    "year_to" INTEGER,
    "source_note" TEXT,
    "authorship" TEXT,
    "document_id" UUID,
    "cover_asset_id" UUID,
    "is_featured" BOOLEAN NOT NULL DEFAULT false,
    "published_at" TIMESTAMPTZ(6),
    "publication_status" "PublicationStatus" NOT NULL DEFAULT 'draft',
    "data_origin" "DataOrigin" NOT NULL,
    "source_url" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "created_by_id" UUID,
    "updated_by_id" UUID,
    "deleted_at" TIMESTAMPTZ(6),

    CONSTRAINT "publications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "publication_translations" (
    "publication_id" UUID NOT NULL,
    "locale" "Locale" NOT NULL,
    "title" TEXT NOT NULL,
    "lead" TEXT,
    "body" JSONB,
    "body_text" TEXT,
    "seo_keywords" TEXT,
    "translation_status" "TranslationStatus" NOT NULL DEFAULT 'missing',
    "search_vector" tsvector,

    CONSTRAINT "publication_translations_pkey" PRIMARY KEY ("publication_id","locale")
);

-- CreateTable
CREATE TABLE "publication_categories" (
    "publication_id" UUID NOT NULL,
    "category_id" UUID NOT NULL,

    CONSTRAINT "publication_categories_pkey" PRIMARY KEY ("publication_id","category_id")
);

-- CreateTable
CREATE TABLE "publication_persons" (
    "publication_id" UUID NOT NULL,
    "person_id" UUID NOT NULL,

    CONSTRAINT "publication_persons_pkey" PRIMARY KEY ("publication_id","person_id")
);

-- CreateTable
CREATE TABLE "publication_events" (
    "publication_id" UUID NOT NULL,
    "event_id" UUID NOT NULL,

    CONSTRAINT "publication_events_pkey" PRIMARY KEY ("publication_id","event_id")
);

-- CreateTable
CREATE TABLE "publication_settlements" (
    "publication_id" UUID NOT NULL,
    "settlement_id" UUID NOT NULL,

    CONSTRAINT "publication_settlements_pkey" PRIMARY KEY ("publication_id","settlement_id")
);

-- CreateTable
CREATE TABLE "collections" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "slug" TEXT NOT NULL,
    "cover_asset_id" UUID,
    "is_featured" BOOLEAN NOT NULL DEFAULT false,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "publication_status" "PublicationStatus" NOT NULL DEFAULT 'draft',
    "data_origin" "DataOrigin" NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "created_by_id" UUID,
    "updated_by_id" UUID,
    "deleted_at" TIMESTAMPTZ(6),

    CONSTRAINT "collections_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "collection_translations" (
    "collection_id" UUID NOT NULL,
    "locale" "Locale" NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "translation_status" "TranslationStatus" NOT NULL DEFAULT 'missing',

    CONSTRAINT "collection_translations_pkey" PRIMARY KEY ("collection_id","locale")
);

-- CreateTable
CREATE TABLE "collection_items" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "collection_id" UUID NOT NULL,
    "item_type" "CollectionItemType" NOT NULL,
    "item_id" UUID NOT NULL,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "note" TEXT,

    CONSTRAINT "collection_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "exhibitions" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "slug" TEXT NOT NULL,
    "cover_asset_id" UUID,
    "year_from" INTEGER,
    "year_to" INTEGER,
    "opens_at" DATE,
    "closes_at" DATE,
    "is_featured" BOOLEAN NOT NULL DEFAULT false,
    "publication_status" "PublicationStatus" NOT NULL DEFAULT 'draft',
    "data_origin" "DataOrigin" NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "created_by_id" UUID,
    "updated_by_id" UUID,
    "deleted_at" TIMESTAMPTZ(6),

    CONSTRAINT "exhibitions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "exhibition_translations" (
    "exhibition_id" UUID NOT NULL,
    "locale" "Locale" NOT NULL,
    "title" TEXT NOT NULL,
    "lead" TEXT,
    "description" TEXT,
    "translation_status" "TranslationStatus" NOT NULL DEFAULT 'missing',

    CONSTRAINT "exhibition_translations_pkey" PRIMARY KEY ("exhibition_id","locale")
);

-- CreateTable
CREATE TABLE "exhibition_categories" (
    "exhibition_id" UUID NOT NULL,
    "category_id" UUID NOT NULL,

    CONSTRAINT "exhibition_categories_pkey" PRIMARY KEY ("exhibition_id","category_id")
);

-- CreateTable
CREATE TABLE "exhibition_items" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "exhibition_id" UUID NOT NULL,
    "sort_order" INTEGER NOT NULL,
    "asset_id" UUID,
    "document_id" UUID,
    "fond_id" UUID,

    CONSTRAINT "exhibition_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "exhibition_item_translations" (
    "item_id" UUID NOT NULL,
    "locale" "Locale" NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "source_note" TEXT,
    "translation_status" "TranslationStatus" NOT NULL DEFAULT 'missing',

    CONSTRAINT "exhibition_item_translations_pkey" PRIMARY KEY ("item_id","locale")
);

-- CreateTable
CREATE TABLE "news" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "slug" TEXT NOT NULL,
    "category_id" UUID,
    "branch_id" UUID,
    "cover_asset_id" UUID,
    "published_at" TIMESTAMPTZ(6),
    "publication_status" "PublicationStatus" NOT NULL DEFAULT 'draft',
    "data_origin" "DataOrigin" NOT NULL,
    "source_url" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "created_by_id" UUID,
    "updated_by_id" UUID,
    "deleted_at" TIMESTAMPTZ(6),

    CONSTRAINT "news_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "news_translations" (
    "news_id" UUID NOT NULL,
    "locale" "Locale" NOT NULL,
    "title" TEXT NOT NULL,
    "lead" TEXT,
    "body" JSONB,
    "body_text" TEXT,
    "seo_keywords" TEXT,
    "translation_status" "TranslationStatus" NOT NULL DEFAULT 'missing',
    "search_vector" tsvector,

    CONSTRAINT "news_translations_pkey" PRIMARY KEY ("news_id","locale")
);

-- CreateTable
CREATE TABLE "news_relations" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "news_id" UUID NOT NULL,
    "target_type" "CollectionItemType" NOT NULL,
    "target_id" UUID NOT NULL,
    "sort_order" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "news_relations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pages" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "key" TEXT NOT NULL,
    "parent_id" UUID,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "publication_status" "PublicationStatus" NOT NULL DEFAULT 'draft',
    "data_origin" "DataOrigin" NOT NULL,
    "source_url" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "created_by_id" UUID,
    "updated_by_id" UUID,
    "deleted_at" TIMESTAMPTZ(6),

    CONSTRAINT "pages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "page_translations" (
    "page_id" UUID NOT NULL,
    "locale" "Locale" NOT NULL,
    "title" TEXT NOT NULL,
    "lead" TEXT,
    "body" JSONB,
    "body_text" TEXT,
    "seo_keywords" TEXT,
    "translation_status" "TranslationStatus" NOT NULL DEFAULT 'missing',

    CONSTRAINT "page_translations_pkey" PRIMARY KEY ("page_id","locale")
);

-- CreateTable
CREATE TABLE "staff_contacts" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "branch_id" UUID,
    "phone" TEXT,
    "email" TEXT,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "verified_at" DATE,
    "publication_status" "PublicationStatus" NOT NULL DEFAULT 'draft',
    "data_origin" "DataOrigin" NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "deleted_at" TIMESTAMPTZ(6),

    CONSTRAINT "staff_contacts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "staff_contact_translations" (
    "staff_contact_id" UUID NOT NULL,
    "locale" "Locale" NOT NULL,
    "full_name" TEXT NOT NULL,
    "position" TEXT NOT NULL,
    "department" TEXT,
    "translation_status" "TranslationStatus" NOT NULL DEFAULT 'missing',

    CONSTRAINT "staff_contact_translations_pkey" PRIMARY KEY ("staff_contact_id","locale")
);

-- CreateTable
CREATE TABLE "galleries" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "slug" TEXT NOT NULL,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "publication_status" "PublicationStatus" NOT NULL DEFAULT 'draft',
    "data_origin" "DataOrigin" NOT NULL,
    "source_url" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "deleted_at" TIMESTAMPTZ(6),

    CONSTRAINT "galleries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "gallery_translations" (
    "gallery_id" UUID NOT NULL,
    "locale" "Locale" NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "translation_status" "TranslationStatus" NOT NULL DEFAULT 'missing',

    CONSTRAINT "gallery_translations_pkey" PRIMARY KEY ("gallery_id","locale")
);

-- CreateTable
CREATE TABLE "gallery_items" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "gallery_id" UUID NOT NULL,
    "asset_id" UUID NOT NULL,
    "sort_order" INTEGER NOT NULL,

    CONSTRAINT "gallery_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "faq_items" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "publication_status" "PublicationStatus" NOT NULL DEFAULT 'draft',
    "data_origin" "DataOrigin" NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "faq_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "faq_item_translations" (
    "faq_item_id" UUID NOT NULL,
    "locale" "Locale" NOT NULL,
    "question" TEXT NOT NULL,
    "answer" TEXT NOT NULL,
    "translation_status" "TranslationStatus" NOT NULL DEFAULT 'missing',

    CONSTRAINT "faq_item_translations_pkey" PRIMARY KEY ("faq_item_id","locale")
);

-- CreateTable
CREATE TABLE "glossary_terms" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "slug" TEXT NOT NULL,
    "publication_status" "PublicationStatus" NOT NULL DEFAULT 'draft',
    "data_origin" "DataOrigin" NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "glossary_terms_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "glossary_term_translations" (
    "term_id" UUID NOT NULL,
    "locale" "Locale" NOT NULL,
    "term" TEXT NOT NULL,
    "definition" TEXT NOT NULL,
    "translation_status" "TranslationStatus" NOT NULL DEFAULT 'missing',

    CONSTRAINT "glossary_term_translations_pkey" PRIMARY KEY ("term_id","locale")
);

-- CreateTable
CREATE TABLE "external_links" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "category" "LinkCategory" NOT NULL,
    "url" TEXT NOT NULL,
    "approved_by_customer" BOOLEAN NOT NULL DEFAULT false,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "external_links_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "external_link_translations" (
    "link_id" UUID NOT NULL,
    "locale" "Locale" NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "translation_status" "TranslationStatus" NOT NULL DEFAULT 'missing',

    CONSTRAINT "external_link_translations_pkey" PRIMARY KEY ("link_id","locale")
);

-- CreateTable
CREATE TABLE "menu_items" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "parent_id" UUID,
    "target" TEXT NOT NULL,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "is_required" BOOLEAN NOT NULL DEFAULT false,
    "is_visible" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "menu_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "menu_item_translations" (
    "menu_item_id" UUID NOT NULL,
    "locale" "Locale" NOT NULL,
    "label" TEXT NOT NULL,
    "translation_status" "TranslationStatus" NOT NULL DEFAULT 'missing',

    CONSTRAINT "menu_item_translations_pkey" PRIMARY KEY ("menu_item_id","locale")
);

-- CreateTable
CREATE TABLE "site_settings" (
    "key" TEXT NOT NULL,
    "value" JSONB NOT NULL,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "site_settings_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "content_revisions" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "entity_type" TEXT NOT NULL,
    "entity_id" UUID NOT NULL,
    "data" JSONB NOT NULL,
    "status" "PublicationStatus" NOT NULL DEFAULT 'draft',
    "comment" TEXT,
    "created_by_id" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "content_revisions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "import_jobs" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "entity_type" TEXT NOT NULL,
    "file_asset_id" UUID,
    "status" "ImportStatus" NOT NULL DEFAULT 'preview',
    "total_rows" INTEGER NOT NULL DEFAULT 0,
    "ok_rows" INTEGER NOT NULL DEFAULT 0,
    "error_rows" INTEGER NOT NULL DEFAULT 0,
    "errors" JSONB,
    "created_by_id" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "committed_at" TIMESTAMPTZ(6),

    CONSTRAINT "import_jobs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "search_queries" (
    "id" BIGSERIAL NOT NULL,
    "occurred_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "query_text" TEXT NOT NULL,
    "locale" "Locale" NOT NULL,
    "filters" JSONB,
    "result_count" INTEGER NOT NULL,
    "source" "SearchSource" NOT NULL,

    CONSTRAINT "search_queries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "search_synonyms" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "term" TEXT NOT NULL,
    "variants" TEXT[],
    "locale" "Locale",

    CONSTRAINT "search_synonyms_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "feedback_messages" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "topic" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "contact_email" TEXT,
    "locale" "Locale" NOT NULL,
    "page_path" TEXT,
    "status" "FeedbackStatus" NOT NULL DEFAULT 'new',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "moderated_by_id" UUID,
    "moderated_at" TIMESTAMPTZ(6),

    CONSTRAINT "feedback_messages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "migration_items" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "old_url" TEXT NOT NULL,
    "old_id" TEXT,
    "old_locale" "Locale",
    "content_type" TEXT NOT NULL,
    "new_entity_type" TEXT,
    "new_entity_id" UUID,
    "translation_group" TEXT,
    "owner" TEXT,
    "published_at" DATE,
    "checked_at" DATE,
    "source_note" TEXT,
    "rights_note" TEXT,
    "access_level" "AccessLevel",
    "files" JSONB,
    "archive_code" TEXT,
    "decision" "MigrationDecision" NOT NULL DEFAULT 'needs_review',
    "decision_reason" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "migration_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "url_redirects" (
    "old_path" TEXT NOT NULL,
    "new_path" TEXT NOT NULL,
    "status_code" INTEGER NOT NULL DEFAULT 301,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "url_redirects_pkey" PRIMARY KEY ("old_path")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "roles_code_key" ON "roles"("code");

-- CreateIndex
CREATE UNIQUE INDEX "permissions_code_key" ON "permissions"("code");

-- CreateIndex
CREATE INDEX "user_roles_user_id_idx" ON "user_roles"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "user_roles_user_id_role_id_branch_id_key" ON "user_roles"("user_id", "role_id", "branch_id");

-- CreateIndex
CREATE UNIQUE INDEX "sessions_token_hash_key" ON "sessions"("token_hash");

-- CreateIndex
CREATE INDEX "sessions_expires_at_idx" ON "sessions"("expires_at");

-- CreateIndex
CREATE INDEX "sessions_user_id_idx" ON "sessions"("user_id");

-- CreateIndex
CREATE INDEX "audit_logs_entity_type_entity_id_idx" ON "audit_logs"("entity_type", "entity_id");

-- CreateIndex
CREATE INDEX "audit_logs_user_id_occurred_at_idx" ON "audit_logs"("user_id", "occurred_at");

-- CreateIndex
CREATE INDEX "audit_logs_occurred_at_idx" ON "audit_logs"("occurred_at");

-- CreateIndex
CREATE INDEX "notifications_user_id_read_at_idx" ON "notifications"("user_id", "read_at");

-- CreateIndex
CREATE INDEX "notifications_role_id_read_at_idx" ON "notifications"("role_id", "read_at");

-- CreateIndex
CREATE UNIQUE INDEX "settlements_slug_key" ON "settlements"("slug");

-- CreateIndex
CREATE INDEX "settlement_translations_name_trgm_idx" ON "settlement_translations" USING GIN ("name" gin_trgm_ops);

-- CreateIndex
CREATE INDEX "settlement_names_settlement_id_idx" ON "settlement_names"("settlement_id");

-- CreateIndex
CREATE INDEX "settlement_names_name_trgm_idx" ON "settlement_names" USING GIN ("name" gin_trgm_ops);

-- CreateIndex
CREATE UNIQUE INDEX "organizations_slug_key" ON "organizations"("slug");

-- CreateIndex
CREATE INDEX "organization_translations_name_trgm_idx" ON "organization_translations" USING GIN ("name" gin_trgm_ops);

-- CreateIndex
CREATE UNIQUE INDEX "historical_periods_slug_key" ON "historical_periods"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "document_types_code_key" ON "document_types"("code");

-- CreateIndex
CREATE UNIQUE INDEX "categories_kind_slug_key" ON "categories"("kind", "slug");

-- CreateIndex
CREATE UNIQUE INDEX "tags_slug_key" ON "tags"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "branch_types_code_key" ON "branch_types"("code");

-- CreateIndex
CREATE UNIQUE INDEX "branches_slug_key" ON "branches"("slug");

-- CreateIndex
CREATE INDEX "branches_publication_status_idx" ON "branches"("publication_status");

-- CreateIndex
CREATE UNIQUE INDEX "branch_schedules_branch_id_kind_weekday_key" ON "branch_schedules"("branch_id", "kind", "weekday");

-- CreateIndex
CREATE INDEX "fonds_number_trgm_idx" ON "fonds" USING GIN ("fond_number" gin_trgm_ops);

-- CreateIndex
CREATE INDEX "fonds_fond_number_sort_idx" ON "fonds"("fond_number_sort");

-- CreateIndex
CREATE INDEX "fonds_publication_status_access_level_idx" ON "fonds"("publication_status", "access_level");

-- CreateIndex
CREATE UNIQUE INDEX "fonds_branch_id_fond_number_key" ON "fonds"("branch_id", "fond_number");

-- CreateIndex
CREATE INDEX "fond_translations_title_trgm_idx" ON "fond_translations" USING GIN ("title" gin_trgm_ops);

-- CreateIndex
CREATE UNIQUE INDEX "inventories_fond_id_inventory_number_key" ON "inventories"("fond_id", "inventory_number");

-- CreateIndex
CREATE INDEX "cases_number_trgm_idx" ON "cases" USING GIN ("case_number" gin_trgm_ops);

-- CreateIndex
CREATE UNIQUE INDEX "cases_inventory_id_case_number_key" ON "cases"("inventory_id", "case_number");

-- CreateIndex
CREATE INDEX "documents_document_type_id_idx" ON "documents"("document_type_id");

-- CreateIndex
CREATE INDEX "documents_period_id_idx" ON "documents"("period_id");

-- CreateIndex
CREATE INDEX "documents_organization_id_idx" ON "documents"("organization_id");

-- CreateIndex
CREATE INDEX "documents_publication_status_access_level_idx" ON "documents"("publication_status", "access_level");

-- CreateIndex
CREATE INDEX "documents_author_trgm_idx" ON "documents" USING GIN ("author_text" gin_trgm_ops);

-- CreateIndex
CREATE UNIQUE INDEX "documents_case_id_document_number_key" ON "documents"("case_id", "document_number");

-- CreateIndex
CREATE INDEX "document_translations_search_vector_idx" ON "document_translations" USING GIN ("search_vector");

-- CreateIndex
CREATE INDEX "document_translations_title_trgm_idx" ON "document_translations" USING GIN ("title" gin_trgm_ops);

-- CreateIndex
CREATE UNIQUE INDEX "document_relations_source_document_id_target_document_id_ta_key" ON "document_relations"("source_document_id", "target_document_id", "target_case_id", "relation_type");

-- CreateIndex
CREATE INDEX "document_categories_category_id_idx" ON "document_categories"("category_id");

-- CreateIndex
CREATE INDEX "document_settlements_settlement_id_idx" ON "document_settlements"("settlement_id");

-- CreateIndex
CREATE INDEX "document_tags_tag_id_idx" ON "document_tags"("tag_id");

-- CreateIndex
CREATE INDEX "document_persons_person_id_idx" ON "document_persons"("person_id");

-- CreateIndex
CREATE INDEX "digital_assets_sha256_idx" ON "digital_assets"("sha256");

-- CreateIndex
CREATE UNIQUE INDEX "digital_assets_storage_bucket_storage_key_key" ON "digital_assets"("storage_bucket", "storage_key");

-- CreateIndex
CREATE UNIQUE INDEX "asset_derivatives_asset_id_variant_format_key" ON "asset_derivatives"("asset_id", "variant", "format");

-- CreateIndex
CREATE UNIQUE INDEX "document_assets_document_id_page_number_key" ON "document_assets"("document_id", "page_number");

-- CreateIndex
CREATE UNIQUE INDEX "historical_persons_slug_key" ON "historical_persons"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "historical_events_slug_key" ON "historical_events"("slug");

-- CreateIndex
CREATE INDEX "historical_events_year_idx" ON "historical_events"("year");

-- CreateIndex
CREATE UNIQUE INDEX "publications_slug_key" ON "publications"("slug");

-- CreateIndex
CREATE INDEX "publications_publication_status_published_at_idx" ON "publications"("publication_status", "published_at");

-- CreateIndex
CREATE INDEX "publication_translations_search_vector_idx" ON "publication_translations" USING GIN ("search_vector");

-- CreateIndex
CREATE UNIQUE INDEX "collections_slug_key" ON "collections"("slug");

-- CreateIndex
CREATE INDEX "collection_items_item_type_item_id_idx" ON "collection_items"("item_type", "item_id");

-- CreateIndex
CREATE UNIQUE INDEX "collection_items_collection_id_item_type_item_id_key" ON "collection_items"("collection_id", "item_type", "item_id");

-- CreateIndex
CREATE UNIQUE INDEX "exhibitions_slug_key" ON "exhibitions"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "exhibition_items_exhibition_id_sort_order_key" ON "exhibition_items"("exhibition_id", "sort_order");

-- CreateIndex
CREATE UNIQUE INDEX "news_slug_key" ON "news"("slug");

-- CreateIndex
CREATE INDEX "news_publication_status_published_at_idx" ON "news"("publication_status", "published_at");

-- CreateIndex
CREATE INDEX "news_translations_search_vector_idx" ON "news_translations" USING GIN ("search_vector");

-- CreateIndex
CREATE UNIQUE INDEX "news_relations_news_id_target_type_target_id_key" ON "news_relations"("news_id", "target_type", "target_id");

-- CreateIndex
CREATE UNIQUE INDEX "pages_key_key" ON "pages"("key");

-- CreateIndex
CREATE UNIQUE INDEX "galleries_slug_key" ON "galleries"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "gallery_items_gallery_id_sort_order_key" ON "gallery_items"("gallery_id", "sort_order");

-- CreateIndex
CREATE UNIQUE INDEX "glossary_terms_slug_key" ON "glossary_terms"("slug");

-- CreateIndex
CREATE INDEX "content_revisions_entity_type_entity_id_idx" ON "content_revisions"("entity_type", "entity_id");

-- CreateIndex
CREATE INDEX "search_queries_occurred_at_idx" ON "search_queries"("occurred_at");

-- CreateIndex
CREATE INDEX "search_queries_result_count_idx" ON "search_queries"("result_count");

-- CreateIndex
CREATE INDEX "search_synonyms_term_idx" ON "search_synonyms"("term");

-- CreateIndex
CREATE INDEX "feedback_messages_status_created_at_idx" ON "feedback_messages"("status", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "migration_items_old_url_key" ON "migration_items"("old_url");

-- CreateIndex
CREATE INDEX "migration_items_decision_idx" ON "migration_items"("decision");

-- AddForeignKey
ALTER TABLE "role_permissions" ADD CONSTRAINT "role_permissions_role_id_fkey" FOREIGN KEY ("role_id") REFERENCES "roles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "role_permissions" ADD CONSTRAINT "role_permissions_permission_id_fkey" FOREIGN KEY ("permission_id") REFERENCES "permissions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_roles" ADD CONSTRAINT "user_roles_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_roles" ADD CONSTRAINT "user_roles_role_id_fkey" FOREIGN KEY ("role_id") REFERENCES "roles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_roles" ADD CONSTRAINT "user_roles_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "branches"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_role_id_fkey" FOREIGN KEY ("role_id") REFERENCES "roles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "settlement_translations" ADD CONSTRAINT "settlement_translations_settlement_id_fkey" FOREIGN KEY ("settlement_id") REFERENCES "settlements"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "settlement_names" ADD CONSTRAINT "settlement_names_settlement_id_fkey" FOREIGN KEY ("settlement_id") REFERENCES "settlements"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "organization_translations" ADD CONSTRAINT "organization_translations_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "historical_period_translations" ADD CONSTRAINT "historical_period_translations_period_id_fkey" FOREIGN KEY ("period_id") REFERENCES "historical_periods"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "document_type_translations" ADD CONSTRAINT "document_type_translations_document_type_id_fkey" FOREIGN KEY ("document_type_id") REFERENCES "document_types"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "categories" ADD CONSTRAINT "categories_parent_id_fkey" FOREIGN KEY ("parent_id") REFERENCES "categories"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "category_translations" ADD CONSTRAINT "category_translations_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "categories"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tag_translations" ADD CONSTRAINT "tag_translations_tag_id_fkey" FOREIGN KEY ("tag_id") REFERENCES "tags"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "branch_type_translations" ADD CONSTRAINT "branch_type_translations_branch_type_id_fkey" FOREIGN KEY ("branch_type_id") REFERENCES "branch_types"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "branches" ADD CONSTRAINT "branches_branch_type_id_fkey" FOREIGN KEY ("branch_type_id") REFERENCES "branch_types"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "branches" ADD CONSTRAINT "branches_parent_branch_id_fkey" FOREIGN KEY ("parent_branch_id") REFERENCES "branches"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "branches" ADD CONSTRAINT "branches_settlement_id_fkey" FOREIGN KEY ("settlement_id") REFERENCES "settlements"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "branches" ADD CONSTRAINT "branches_photo_asset_id_fkey" FOREIGN KEY ("photo_asset_id") REFERENCES "digital_assets"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "branch_translations" ADD CONSTRAINT "branch_translations_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "branches"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "branch_schedules" ADD CONSTRAINT "branch_schedules_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "branches"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fonds" ADD CONSTRAINT "fonds_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "branches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fonds" ADD CONSTRAINT "fonds_creator_org_id_fkey" FOREIGN KEY ("creator_org_id") REFERENCES "organizations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fond_translations" ADD CONSTRAINT "fond_translations_fond_id_fkey" FOREIGN KEY ("fond_id") REFERENCES "fonds"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventories" ADD CONSTRAINT "inventories_fond_id_fkey" FOREIGN KEY ("fond_id") REFERENCES "fonds"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_translations" ADD CONSTRAINT "inventory_translations_inventory_id_fkey" FOREIGN KEY ("inventory_id") REFERENCES "inventories"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cases" ADD CONSTRAINT "cases_inventory_id_fkey" FOREIGN KEY ("inventory_id") REFERENCES "inventories"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "case_translations" ADD CONSTRAINT "case_translations_case_id_fkey" FOREIGN KEY ("case_id") REFERENCES "cases"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "documents" ADD CONSTRAINT "documents_case_id_fkey" FOREIGN KEY ("case_id") REFERENCES "cases"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "documents" ADD CONSTRAINT "documents_period_id_fkey" FOREIGN KEY ("period_id") REFERENCES "historical_periods"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "documents" ADD CONSTRAINT "documents_document_type_id_fkey" FOREIGN KEY ("document_type_id") REFERENCES "document_types"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "documents" ADD CONSTRAINT "documents_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "document_translations" ADD CONSTRAINT "document_translations_document_id_fkey" FOREIGN KEY ("document_id") REFERENCES "documents"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "document_relations" ADD CONSTRAINT "document_relations_source_document_id_fkey" FOREIGN KEY ("source_document_id") REFERENCES "documents"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "document_relations" ADD CONSTRAINT "document_relations_target_document_id_fkey" FOREIGN KEY ("target_document_id") REFERENCES "documents"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "document_relations" ADD CONSTRAINT "document_relations_target_case_id_fkey" FOREIGN KEY ("target_case_id") REFERENCES "cases"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "document_categories" ADD CONSTRAINT "document_categories_document_id_fkey" FOREIGN KEY ("document_id") REFERENCES "documents"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "document_categories" ADD CONSTRAINT "document_categories_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "categories"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "document_settlements" ADD CONSTRAINT "document_settlements_document_id_fkey" FOREIGN KEY ("document_id") REFERENCES "documents"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "document_settlements" ADD CONSTRAINT "document_settlements_settlement_id_fkey" FOREIGN KEY ("settlement_id") REFERENCES "settlements"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "document_tags" ADD CONSTRAINT "document_tags_document_id_fkey" FOREIGN KEY ("document_id") REFERENCES "documents"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "document_tags" ADD CONSTRAINT "document_tags_tag_id_fkey" FOREIGN KEY ("tag_id") REFERENCES "tags"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "document_persons" ADD CONSTRAINT "document_persons_document_id_fkey" FOREIGN KEY ("document_id") REFERENCES "documents"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "document_persons" ADD CONSTRAINT "document_persons_person_id_fkey" FOREIGN KEY ("person_id") REFERENCES "historical_persons"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "asset_translations" ADD CONSTRAINT "asset_translations_asset_id_fkey" FOREIGN KEY ("asset_id") REFERENCES "digital_assets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "asset_derivatives" ADD CONSTRAINT "asset_derivatives_asset_id_fkey" FOREIGN KEY ("asset_id") REFERENCES "digital_assets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "document_assets" ADD CONSTRAINT "document_assets_document_id_fkey" FOREIGN KEY ("document_id") REFERENCES "documents"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "document_assets" ADD CONSTRAINT "document_assets_asset_id_fkey" FOREIGN KEY ("asset_id") REFERENCES "digital_assets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "historical_person_translations" ADD CONSTRAINT "historical_person_translations_person_id_fkey" FOREIGN KEY ("person_id") REFERENCES "historical_persons"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "historical_events" ADD CONSTRAINT "historical_events_settlement_id_fkey" FOREIGN KEY ("settlement_id") REFERENCES "settlements"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "historical_events" ADD CONSTRAINT "historical_events_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "categories"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "historical_event_translations" ADD CONSTRAINT "historical_event_translations_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "historical_events"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "publication_translations" ADD CONSTRAINT "publication_translations_publication_id_fkey" FOREIGN KEY ("publication_id") REFERENCES "publications"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "publication_categories" ADD CONSTRAINT "publication_categories_publication_id_fkey" FOREIGN KEY ("publication_id") REFERENCES "publications"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "publication_categories" ADD CONSTRAINT "publication_categories_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "categories"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "publication_persons" ADD CONSTRAINT "publication_persons_publication_id_fkey" FOREIGN KEY ("publication_id") REFERENCES "publications"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "publication_persons" ADD CONSTRAINT "publication_persons_person_id_fkey" FOREIGN KEY ("person_id") REFERENCES "historical_persons"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "publication_events" ADD CONSTRAINT "publication_events_publication_id_fkey" FOREIGN KEY ("publication_id") REFERENCES "publications"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "publication_events" ADD CONSTRAINT "publication_events_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "historical_events"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "publication_settlements" ADD CONSTRAINT "publication_settlements_publication_id_fkey" FOREIGN KEY ("publication_id") REFERENCES "publications"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "publication_settlements" ADD CONSTRAINT "publication_settlements_settlement_id_fkey" FOREIGN KEY ("settlement_id") REFERENCES "settlements"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "collection_translations" ADD CONSTRAINT "collection_translations_collection_id_fkey" FOREIGN KEY ("collection_id") REFERENCES "collections"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "collection_items" ADD CONSTRAINT "collection_items_collection_id_fkey" FOREIGN KEY ("collection_id") REFERENCES "collections"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "exhibition_translations" ADD CONSTRAINT "exhibition_translations_exhibition_id_fkey" FOREIGN KEY ("exhibition_id") REFERENCES "exhibitions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "exhibition_categories" ADD CONSTRAINT "exhibition_categories_exhibition_id_fkey" FOREIGN KEY ("exhibition_id") REFERENCES "exhibitions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "exhibition_categories" ADD CONSTRAINT "exhibition_categories_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "categories"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "exhibition_items" ADD CONSTRAINT "exhibition_items_exhibition_id_fkey" FOREIGN KEY ("exhibition_id") REFERENCES "exhibitions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "exhibition_items" ADD CONSTRAINT "exhibition_items_asset_id_fkey" FOREIGN KEY ("asset_id") REFERENCES "digital_assets"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "exhibition_item_translations" ADD CONSTRAINT "exhibition_item_translations_item_id_fkey" FOREIGN KEY ("item_id") REFERENCES "exhibition_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "news" ADD CONSTRAINT "news_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "categories"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "news" ADD CONSTRAINT "news_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "branches"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "news_translations" ADD CONSTRAINT "news_translations_news_id_fkey" FOREIGN KEY ("news_id") REFERENCES "news"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "news_relations" ADD CONSTRAINT "news_relations_news_id_fkey" FOREIGN KEY ("news_id") REFERENCES "news"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pages" ADD CONSTRAINT "pages_parent_id_fkey" FOREIGN KEY ("parent_id") REFERENCES "pages"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "page_translations" ADD CONSTRAINT "page_translations_page_id_fkey" FOREIGN KEY ("page_id") REFERENCES "pages"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "staff_contact_translations" ADD CONSTRAINT "staff_contact_translations_staff_contact_id_fkey" FOREIGN KEY ("staff_contact_id") REFERENCES "staff_contacts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "gallery_translations" ADD CONSTRAINT "gallery_translations_gallery_id_fkey" FOREIGN KEY ("gallery_id") REFERENCES "galleries"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "gallery_items" ADD CONSTRAINT "gallery_items_gallery_id_fkey" FOREIGN KEY ("gallery_id") REFERENCES "galleries"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "gallery_items" ADD CONSTRAINT "gallery_items_asset_id_fkey" FOREIGN KEY ("asset_id") REFERENCES "digital_assets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "faq_item_translations" ADD CONSTRAINT "faq_item_translations_faq_item_id_fkey" FOREIGN KEY ("faq_item_id") REFERENCES "faq_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "glossary_term_translations" ADD CONSTRAINT "glossary_term_translations_term_id_fkey" FOREIGN KEY ("term_id") REFERENCES "glossary_terms"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "external_link_translations" ADD CONSTRAINT "external_link_translations_link_id_fkey" FOREIGN KEY ("link_id") REFERENCES "external_links"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "menu_items" ADD CONSTRAINT "menu_items_parent_id_fkey" FOREIGN KEY ("parent_id") REFERENCES "menu_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "menu_item_translations" ADD CONSTRAINT "menu_item_translations_menu_item_id_fkey" FOREIGN KEY ("menu_item_id") REFERENCES "menu_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;
