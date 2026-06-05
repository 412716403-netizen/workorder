-- CreateTable
CREATE TABLE "dev_styles" (
    "id" VARCHAR(50) NOT NULL,
    "tenant_id" UUID NOT NULL,
    "code" VARCHAR(100) NOT NULL,
    "name" VARCHAR(200) NOT NULL,
    "customer_name" VARCHAR(200),
    "image_url" TEXT,
    "category_id" VARCHAR(50),
    "category_custom_data" JSONB NOT NULL DEFAULT '{}',
    "color_ids" JSONB NOT NULL DEFAULT '[]',
    "size_ids" JSONB NOT NULL DEFAULT '[]',
    "milestone_node_ids" JSONB NOT NULL DEFAULT '[]',
    "sales_price" DECIMAL(12,2),
    "purchase_price" DECIMAL(12,2),
    "unit_id" VARCHAR(50),
    "supplier_id" VARCHAR(50),
    "status" VARCHAR(20) NOT NULL DEFAULT 'developing',
    "published_product_id" VARCHAR(50),
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "dev_styles_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "dev_style_variants" (
    "id" VARCHAR(50) NOT NULL,
    "style_id" VARCHAR(50) NOT NULL,
    "color_id" VARCHAR(50),
    "size_id" VARCHAR(50),
    "sku_suffix" VARCHAR(50),
    "node_boms" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "dev_style_variants_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "dev_boms" (
    "id" VARCHAR(50) NOT NULL,
    "tenant_id" UUID NOT NULL,
    "name" VARCHAR(200),
    "parent_style_id" VARCHAR(50) NOT NULL,
    "variant_id" VARCHAR(50),
    "node_id" VARCHAR(50),
    "version" VARCHAR(20),
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "dev_boms_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "dev_bom_items" (
    "id" SERIAL NOT NULL,
    "bom_id" VARCHAR(50) NOT NULL,
    "category_id" VARCHAR(50),
    "product_id" VARCHAR(50) NOT NULL,
    "quantity" DECIMAL(12,4) NOT NULL,
    "note" TEXT,
    "use_shortage_only" BOOLEAN NOT NULL DEFAULT false,
    "exclude_from_weight_share" BOOLEAN NOT NULL DEFAULT false,
    "sort_order" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "dev_bom_items_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "dev_samples" (
    "id" VARCHAR(50) NOT NULL,
    "style_id" VARCHAR(50) NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "dev_samples_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "dev_stages" (
    "id" VARCHAR(50) NOT NULL,
    "sample_id" VARCHAR(50) NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "status" VARCHAR(20) NOT NULL DEFAULT 'pending',
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "dev_stages_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "dev_stage_fields" (
    "id" VARCHAR(50) NOT NULL,
    "stage_id" VARCHAR(50) NOT NULL,
    "label" VARCHAR(200) NOT NULL,
    "value" TEXT NOT NULL,
    "type" VARCHAR(20) NOT NULL DEFAULT 'text',

    CONSTRAINT "dev_stage_fields_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "dev_attachments" (
    "id" VARCHAR(50) NOT NULL,
    "stage_id" VARCHAR(50) NOT NULL,
    "file_name" VARCHAR(255) NOT NULL,
    "file_url" TEXT NOT NULL,
    "file_type" VARCHAR(100),
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "dev_attachments_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "dev_stage_templates" (
    "id" VARCHAR(50) NOT NULL,
    "tenant_id" UUID NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "dev_stage_templates_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "dev_stage_template_fields" (
    "id" VARCHAR(50) NOT NULL,
    "template_id" VARCHAR(50) NOT NULL,
    "label" VARCHAR(200) NOT NULL,
    "required" BOOLEAN NOT NULL DEFAULT false,
    "sort_order" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "dev_stage_template_fields_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "dev_logs" (
    "id" VARCHAR(50) NOT NULL,
    "sample_id" VARCHAR(50) NOT NULL,
    "user" VARCHAR(100) NOT NULL,
    "action" VARCHAR(200) NOT NULL,
    "detail" TEXT NOT NULL,
    "time" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "dev_logs_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "dev_styles_tenant_id_code_key" ON "dev_styles"("tenant_id", "code");
CREATE INDEX "dev_styles_tenant_id_idx" ON "dev_styles"("tenant_id");
CREATE INDEX "dev_styles_category_id_idx" ON "dev_styles"("category_id");
CREATE INDEX "dev_styles_status_idx" ON "dev_styles"("status");

CREATE INDEX "dev_style_variants_style_id_idx" ON "dev_style_variants"("style_id");

CREATE INDEX "dev_boms_tenant_id_idx" ON "dev_boms"("tenant_id");
CREATE INDEX "dev_boms_parent_style_id_idx" ON "dev_boms"("parent_style_id");

CREATE INDEX "dev_bom_items_bom_id_idx" ON "dev_bom_items"("bom_id");

CREATE INDEX "dev_samples_style_id_idx" ON "dev_samples"("style_id");

CREATE INDEX "dev_stages_sample_id_idx" ON "dev_stages"("sample_id");

CREATE INDEX "dev_stage_fields_stage_id_idx" ON "dev_stage_fields"("stage_id");

CREATE INDEX "dev_attachments_stage_id_idx" ON "dev_attachments"("stage_id");

CREATE UNIQUE INDEX "dev_stage_templates_tenant_id_name_key" ON "dev_stage_templates"("tenant_id", "name");
CREATE INDEX "dev_stage_templates_tenant_id_idx" ON "dev_stage_templates"("tenant_id");

CREATE INDEX "dev_stage_template_fields_template_id_idx" ON "dev_stage_template_fields"("template_id");

CREATE INDEX "dev_logs_sample_id_idx" ON "dev_logs"("sample_id");

ALTER TABLE "dev_styles" ADD CONSTRAINT "dev_styles_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "product_categories"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "dev_style_variants" ADD CONSTRAINT "dev_style_variants_style_id_fkey" FOREIGN KEY ("style_id") REFERENCES "dev_styles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "dev_boms" ADD CONSTRAINT "dev_boms_parent_style_id_fkey" FOREIGN KEY ("parent_style_id") REFERENCES "dev_styles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "dev_bom_items" ADD CONSTRAINT "dev_bom_items_bom_id_fkey" FOREIGN KEY ("bom_id") REFERENCES "dev_boms"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "dev_samples" ADD CONSTRAINT "dev_samples_style_id_fkey" FOREIGN KEY ("style_id") REFERENCES "dev_styles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "dev_stages" ADD CONSTRAINT "dev_stages_sample_id_fkey" FOREIGN KEY ("sample_id") REFERENCES "dev_samples"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "dev_stage_fields" ADD CONSTRAINT "dev_stage_fields_stage_id_fkey" FOREIGN KEY ("stage_id") REFERENCES "dev_stages"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "dev_attachments" ADD CONSTRAINT "dev_attachments_stage_id_fkey" FOREIGN KEY ("stage_id") REFERENCES "dev_stages"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "dev_stage_template_fields" ADD CONSTRAINT "dev_stage_template_fields_template_id_fkey" FOREIGN KEY ("template_id") REFERENCES "dev_stage_templates"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "dev_logs" ADD CONSTRAINT "dev_logs_sample_id_fkey" FOREIGN KEY ("sample_id") REFERENCES "dev_samples"("id") ON DELETE CASCADE ON UPDATE CASCADE;
