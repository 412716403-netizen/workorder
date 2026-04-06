-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateTable
CREATE TABLE "users" (
    "id" UUID NOT NULL,
    "username" VARCHAR(50) NOT NULL,
    "phone" VARCHAR(20),
    "email" VARCHAR(255),
    "password_hash" VARCHAR(255) NOT NULL,
    "display_name" VARCHAR(100),
    "role" VARCHAR(20) NOT NULL DEFAULT 'user',
    "status" VARCHAR(20) NOT NULL DEFAULT 'active',
    "is_enterprise" BOOLEAN NOT NULL DEFAULT false,
    "account_expires_at" TIMESTAMPTZ,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "refresh_tokens" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "token" TEXT NOT NULL,
    "expires_at" TIMESTAMPTZ NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "refresh_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tenants" (
    "id" UUID NOT NULL,
    "name" VARCHAR(200) NOT NULL,
    "logo" TEXT,
    "invite_code" VARCHAR(50) NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "tenants_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tenant_memberships" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "role" VARCHAR(20) NOT NULL DEFAULT 'worker',
    "permissions" JSONB NOT NULL DEFAULT '[]',
    "role_id" VARCHAR(50),
    "assigned_milestone_ids" JSONB NOT NULL DEFAULT '[]',
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "tenant_memberships_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "roles" (
    "id" VARCHAR(50) NOT NULL,
    "tenant_id" UUID NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "description" TEXT,
    "permissions" JSONB NOT NULL DEFAULT '[]',
    "is_system" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "roles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "join_applications" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "status" VARCHAR(20) NOT NULL DEFAULT 'PENDING',
    "message" TEXT,
    "reviewed_by" UUID,
    "reviewed_at" TIMESTAMPTZ,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "join_applications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "product_categories" (
    "id" VARCHAR(50) NOT NULL,
    "tenant_id" UUID NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "color" VARCHAR(20),
    "has_process" BOOLEAN NOT NULL DEFAULT false,
    "has_sales_price" BOOLEAN NOT NULL DEFAULT false,
    "has_purchase_price" BOOLEAN NOT NULL DEFAULT false,
    "has_color_size" BOOLEAN NOT NULL DEFAULT false,
    "has_batch_management" BOOLEAN NOT NULL DEFAULT false,
    "custom_fields" JSONB NOT NULL DEFAULT '[]',
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "product_categories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "partner_categories" (
    "id" VARCHAR(50) NOT NULL,
    "tenant_id" UUID NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "description" TEXT,
    "custom_fields" JSONB NOT NULL DEFAULT '[]',
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "partner_categories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "global_node_templates" (
    "id" VARCHAR(50) NOT NULL,
    "tenant_id" UUID NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "report_template" JSONB NOT NULL DEFAULT '[]',
    "has_bom" BOOLEAN NOT NULL DEFAULT false,
    "category" VARCHAR(50),
    "enable_worker_assignment" BOOLEAN NOT NULL DEFAULT false,
    "enable_equipment_assignment" BOOLEAN NOT NULL DEFAULT false,
    "enable_equipment_on_report" BOOLEAN NOT NULL DEFAULT false,
    "enable_piece_rate" BOOLEAN NOT NULL DEFAULT false,
    "allow_outsource" BOOLEAN NOT NULL DEFAULT false,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "global_node_templates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "warehouses" (
    "id" VARCHAR(50) NOT NULL,
    "tenant_id" UUID NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "code" VARCHAR(50),
    "category" VARCHAR(50),
    "location" VARCHAR(200),
    "contact" VARCHAR(100),
    "description" TEXT,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "warehouses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "finance_categories" (
    "id" VARCHAR(50) NOT NULL,
    "tenant_id" UUID NOT NULL,
    "kind" VARCHAR(10) NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "link_order" BOOLEAN NOT NULL DEFAULT false,
    "link_partner" BOOLEAN NOT NULL DEFAULT false,
    "select_payment_account" BOOLEAN NOT NULL DEFAULT false,
    "link_worker" BOOLEAN NOT NULL DEFAULT false,
    "link_product" BOOLEAN NOT NULL DEFAULT false,
    "custom_fields" JSONB NOT NULL DEFAULT '[]',
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "finance_categories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "finance_account_types" (
    "id" VARCHAR(50) NOT NULL,
    "tenant_id" UUID NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "finance_account_types_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "dictionary_items" (
    "id" VARCHAR(50) NOT NULL,
    "tenant_id" UUID NOT NULL,
    "type" VARCHAR(20) NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "value" VARCHAR(100) NOT NULL,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "dictionary_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "system_settings" (
    "tenant_id" UUID NOT NULL,
    "key" VARCHAR(100) NOT NULL,
    "value" JSONB NOT NULL,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "system_settings_pkey" PRIMARY KEY ("tenant_id","key")
);

-- CreateTable
CREATE TABLE "partners" (
    "id" VARCHAR(50) NOT NULL,
    "tenant_id" UUID NOT NULL,
    "name" VARCHAR(200) NOT NULL,
    "category_id" VARCHAR(50),
    "contact" VARCHAR(200),
    "custom_data" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "partners_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "workers" (
    "id" VARCHAR(50) NOT NULL,
    "tenant_id" UUID NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "group_name" VARCHAR(50),
    "role" VARCHAR(50),
    "status" VARCHAR(20) NOT NULL DEFAULT 'ACTIVE',
    "skills" JSONB NOT NULL DEFAULT '[]',
    "assigned_milestone_ids" JSONB NOT NULL DEFAULT '[]',
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "workers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "equipment" (
    "id" VARCHAR(50) NOT NULL,
    "tenant_id" UUID NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "code" VARCHAR(50),
    "assigned_milestone_ids" JSONB NOT NULL DEFAULT '[]',
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "equipment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "products" (
    "id" VARCHAR(50) NOT NULL,
    "tenant_id" UUID NOT NULL,
    "sku" VARCHAR(100) NOT NULL,
    "name" VARCHAR(200) NOT NULL,
    "description" TEXT,
    "image_url" TEXT,
    "category_id" VARCHAR(50),
    "sales_price" DECIMAL(12,2),
    "purchase_price" DECIMAL(12,2),
    "supplier_id" VARCHAR(50),
    "unit_id" VARCHAR(50),
    "color_ids" JSONB NOT NULL DEFAULT '[]',
    "size_ids" JSONB NOT NULL DEFAULT '[]',
    "category_custom_data" JSONB NOT NULL DEFAULT '{}',
    "milestone_node_ids" JSONB NOT NULL DEFAULT '[]',
    "node_rates" JSONB NOT NULL DEFAULT '{}',
    "node_pricing_modes" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "products_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "product_variants" (
    "id" VARCHAR(50) NOT NULL,
    "product_id" VARCHAR(50) NOT NULL,
    "color_id" VARCHAR(50),
    "size_id" VARCHAR(50),
    "sku_suffix" VARCHAR(50),
    "node_boms" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "product_variants_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "boms" (
    "id" VARCHAR(50) NOT NULL,
    "tenant_id" UUID NOT NULL,
    "name" VARCHAR(200) NOT NULL,
    "parent_product_id" VARCHAR(50) NOT NULL,
    "variant_id" VARCHAR(50),
    "node_id" VARCHAR(50),
    "version" VARCHAR(20),
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "boms_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bom_items" (
    "id" SERIAL NOT NULL,
    "bom_id" VARCHAR(50) NOT NULL,
    "category_id" VARCHAR(50),
    "product_id" VARCHAR(50) NOT NULL,
    "quantity" DECIMAL(12,4) NOT NULL,
    "note" TEXT,
    "use_shortage_only" BOOLEAN NOT NULL DEFAULT false,
    "sort_order" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "bom_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "plan_orders" (
    "id" VARCHAR(50) NOT NULL,
    "tenant_id" UUID NOT NULL,
    "plan_number" VARCHAR(50) NOT NULL,
    "parent_plan_id" VARCHAR(50),
    "bom_node_id" VARCHAR(50),
    "product_id" VARCHAR(50) NOT NULL,
    "start_date" DATE,
    "due_date" DATE,
    "status" VARCHAR(20) NOT NULL DEFAULT 'DRAFT',
    "customer" VARCHAR(200),
    "priority" VARCHAR(10) NOT NULL DEFAULT 'Medium',
    "assignments" JSONB NOT NULL DEFAULT '{}',
    "custom_data" JSONB NOT NULL DEFAULT '{}',
    "node_pricing_modes" JSONB,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "plan_orders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "plan_items" (
    "id" SERIAL NOT NULL,
    "plan_order_id" VARCHAR(50) NOT NULL,
    "variant_id" VARCHAR(50),
    "quantity" DECIMAL(12,2) NOT NULL,

    CONSTRAINT "plan_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "production_orders" (
    "id" VARCHAR(50) NOT NULL,
    "tenant_id" UUID NOT NULL,
    "order_number" VARCHAR(50) NOT NULL,
    "plan_order_id" VARCHAR(50),
    "parent_order_id" VARCHAR(50),
    "bom_node_id" VARCHAR(50),
    "source_plan_id" VARCHAR(50),
    "product_id" VARCHAR(50) NOT NULL,
    "product_name" VARCHAR(200),
    "sku" VARCHAR(100),
    "customer" VARCHAR(200),
    "start_date" DATE,
    "due_date" DATE,
    "status" VARCHAR(20) NOT NULL DEFAULT 'PLANNING',
    "priority" VARCHAR(10) NOT NULL DEFAULT 'Medium',
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "production_orders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "order_items" (
    "id" SERIAL NOT NULL,
    "production_order_id" VARCHAR(50) NOT NULL,
    "variant_id" VARCHAR(50),
    "quantity" DECIMAL(12,2) NOT NULL,
    "completed_quantity" DECIMAL(12,2) NOT NULL DEFAULT 0,

    CONSTRAINT "order_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "milestones" (
    "id" VARCHAR(50) NOT NULL,
    "production_order_id" VARCHAR(50) NOT NULL,
    "template_id" VARCHAR(50) NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "status" VARCHAR(20) NOT NULL DEFAULT 'PENDING',
    "planned_date" DATE,
    "actual_date" DATE,
    "completed_quantity" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "report_template" JSONB NOT NULL DEFAULT '[]',
    "weight" DECIMAL(5,2) NOT NULL DEFAULT 1,
    "assigned_worker_ids" JSONB NOT NULL DEFAULT '[]',
    "assigned_equipment_ids" JSONB NOT NULL DEFAULT '[]',
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "milestones_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "milestone_reports" (
    "id" VARCHAR(50) NOT NULL,
    "milestone_id" VARCHAR(50) NOT NULL,
    "timestamp" TIMESTAMPTZ NOT NULL,
    "operator" VARCHAR(100),
    "quantity" DECIMAL(12,2) NOT NULL,
    "defective_quantity" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "equipment_id" VARCHAR(50),
    "variant_id" VARCHAR(50),
    "report_batch_id" VARCHAR(50),
    "report_no" VARCHAR(50),
    "custom_data" JSONB NOT NULL DEFAULT '{}',
    "notes" TEXT,
    "rate" DECIMAL(12,2),
    "worker_id" VARCHAR(50),
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "milestone_reports_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "product_milestone_progresses" (
    "id" VARCHAR(50) NOT NULL,
    "tenant_id" UUID NOT NULL,
    "product_id" VARCHAR(50) NOT NULL,
    "variant_id" VARCHAR(50),
    "milestone_template_id" VARCHAR(50) NOT NULL,
    "completed_quantity" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "product_milestone_progresses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "product_progress_reports" (
    "id" VARCHAR(50) NOT NULL,
    "progress_id" VARCHAR(50) NOT NULL,
    "timestamp" TIMESTAMPTZ NOT NULL,
    "operator" VARCHAR(100),
    "quantity" DECIMAL(12,2) NOT NULL,
    "defective_quantity" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "equipment_id" VARCHAR(50),
    "variant_id" VARCHAR(50),
    "report_batch_id" VARCHAR(50),
    "report_no" VARCHAR(50),
    "custom_data" JSONB NOT NULL DEFAULT '{}',
    "notes" TEXT,
    "rate" DECIMAL(12,2),
    "worker_id" VARCHAR(50),
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "product_progress_reports_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "production_op_records" (
    "id" VARCHAR(50) NOT NULL,
    "tenant_id" UUID NOT NULL,
    "type" VARCHAR(20) NOT NULL,
    "order_id" VARCHAR(50),
    "product_id" VARCHAR(50) NOT NULL,
    "variant_id" VARCHAR(50),
    "quantity" DECIMAL(12,2) NOT NULL,
    "reason" TEXT,
    "partner" VARCHAR(200),
    "operator" VARCHAR(100),
    "timestamp" TIMESTAMPTZ NOT NULL,
    "status" VARCHAR(50),
    "warehouse_id" VARCHAR(50),
    "doc_no" VARCHAR(50),
    "node_id" VARCHAR(50),
    "source_node_id" VARCHAR(50),
    "source_rework_id" VARCHAR(50),
    "rework_node_ids" JSONB,
    "completed_node_ids" JSONB,
    "rework_completed_quantity_by_node" JSONB,
    "worker_id" VARCHAR(50),
    "equipment_id" VARCHAR(50),
    "source_product_id" VARCHAR(50),
    "unit_price" DECIMAL(12,2),
    "amount" DECIMAL(12,2),
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "production_op_records_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "psi_records" (
    "id" VARCHAR(50) NOT NULL,
    "tenant_id" UUID NOT NULL,
    "type" VARCHAR(30) NOT NULL,
    "doc_number" VARCHAR(100),
    "partner" VARCHAR(200),
    "partner_id" VARCHAR(50),
    "product_id" VARCHAR(50),
    "variant_id" VARCHAR(50),
    "quantity" DECIMAL(12,2),
    "warehouse_id" VARCHAR(50),
    "from_warehouse_id" VARCHAR(50),
    "to_warehouse_id" VARCHAR(50),
    "purchase_price" DECIMAL(12,2),
    "sales_price" DECIMAL(12,2),
    "amount" DECIMAL(12,2),
    "due_date" DATE,
    "line_group_id" VARCHAR(50),
    "source_order_number" VARCHAR(100),
    "source_line_id" VARCHAR(50),
    "actual_quantity" DECIMAL(12,2),
    "system_quantity" DECIMAL(12,2),
    "diff_quantity" DECIMAL(12,2),
    "allocated_quantity" DECIMAL(12,2),
    "shipped_quantity" DECIMAL(12,2),
    "allocation_warehouse_id" VARCHAR(50),
    "operator" VARCHAR(100),
    "note" TEXT,
    "custom_data" JSONB NOT NULL DEFAULT '{}',
    "batch_no" VARCHAR(100),
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "timestamp" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "psi_records_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "finance_records" (
    "id" VARCHAR(50) NOT NULL,
    "tenant_id" UUID NOT NULL,
    "type" VARCHAR(20) NOT NULL,
    "doc_no" VARCHAR(50),
    "amount" DECIMAL(12,2) NOT NULL,
    "related_id" VARCHAR(50),
    "partner" VARCHAR(200),
    "operator" VARCHAR(100),
    "timestamp" TIMESTAMPTZ NOT NULL,
    "note" TEXT,
    "status" VARCHAR(20) NOT NULL DEFAULT 'PENDING',
    "category_id" VARCHAR(50),
    "worker_id" VARCHAR(50),
    "product_id" VARCHAR(50),
    "payment_account" VARCHAR(100),
    "custom_data" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "finance_records_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_username_key" ON "users"("username");

-- CreateIndex
CREATE UNIQUE INDEX "users_phone_key" ON "users"("phone");

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "refresh_tokens_token_key" ON "refresh_tokens"("token");

-- CreateIndex
CREATE UNIQUE INDEX "tenants_invite_code_key" ON "tenants"("invite_code");

-- CreateIndex
CREATE UNIQUE INDEX "tenant_memberships_user_id_tenant_id_key" ON "tenant_memberships"("user_id", "tenant_id");

-- CreateIndex
CREATE INDEX "roles_tenant_id_idx" ON "roles"("tenant_id");

-- CreateIndex
CREATE UNIQUE INDEX "join_applications_user_id_tenant_id_key" ON "join_applications"("user_id", "tenant_id");

-- CreateIndex
CREATE INDEX "product_categories_tenant_id_idx" ON "product_categories"("tenant_id");

-- CreateIndex
CREATE INDEX "partner_categories_tenant_id_idx" ON "partner_categories"("tenant_id");

-- CreateIndex
CREATE INDEX "global_node_templates_tenant_id_idx" ON "global_node_templates"("tenant_id");

-- CreateIndex
CREATE INDEX "warehouses_tenant_id_idx" ON "warehouses"("tenant_id");

-- CreateIndex
CREATE INDEX "finance_categories_tenant_id_idx" ON "finance_categories"("tenant_id");

-- CreateIndex
CREATE INDEX "finance_account_types_tenant_id_idx" ON "finance_account_types"("tenant_id");

-- CreateIndex
CREATE INDEX "dictionary_items_tenant_id_idx" ON "dictionary_items"("tenant_id");

-- CreateIndex
CREATE INDEX "dictionary_items_type_idx" ON "dictionary_items"("type");

-- CreateIndex
CREATE INDEX "partners_tenant_id_idx" ON "partners"("tenant_id");

-- CreateIndex
CREATE INDEX "workers_tenant_id_idx" ON "workers"("tenant_id");

-- CreateIndex
CREATE INDEX "equipment_tenant_id_idx" ON "equipment"("tenant_id");

-- CreateIndex
CREATE INDEX "products_tenant_id_idx" ON "products"("tenant_id");

-- CreateIndex
CREATE INDEX "products_category_id_idx" ON "products"("category_id");

-- CreateIndex
CREATE INDEX "product_variants_product_id_idx" ON "product_variants"("product_id");

-- CreateIndex
CREATE INDEX "boms_tenant_id_idx" ON "boms"("tenant_id");

-- CreateIndex
CREATE INDEX "boms_parent_product_id_idx" ON "boms"("parent_product_id");

-- CreateIndex
CREATE INDEX "bom_items_bom_id_idx" ON "bom_items"("bom_id");

-- CreateIndex
CREATE UNIQUE INDEX "plan_orders_plan_number_key" ON "plan_orders"("plan_number");

-- CreateIndex
CREATE INDEX "plan_orders_tenant_id_idx" ON "plan_orders"("tenant_id");

-- CreateIndex
CREATE INDEX "plan_orders_parent_plan_id_idx" ON "plan_orders"("parent_plan_id");

-- CreateIndex
CREATE INDEX "plan_orders_product_id_idx" ON "plan_orders"("product_id");

-- CreateIndex
CREATE INDEX "plan_orders_status_idx" ON "plan_orders"("status");

-- CreateIndex
CREATE INDEX "plan_items_plan_order_id_idx" ON "plan_items"("plan_order_id");

-- CreateIndex
CREATE UNIQUE INDEX "production_orders_order_number_key" ON "production_orders"("order_number");

-- CreateIndex
CREATE INDEX "production_orders_tenant_id_idx" ON "production_orders"("tenant_id");

-- CreateIndex
CREATE INDEX "production_orders_parent_order_id_idx" ON "production_orders"("parent_order_id");

-- CreateIndex
CREATE INDEX "production_orders_product_id_idx" ON "production_orders"("product_id");

-- CreateIndex
CREATE INDEX "production_orders_status_idx" ON "production_orders"("status");

-- CreateIndex
CREATE INDEX "order_items_production_order_id_idx" ON "order_items"("production_order_id");

-- CreateIndex
CREATE INDEX "milestones_production_order_id_idx" ON "milestones"("production_order_id");

-- CreateIndex
CREATE INDEX "milestone_reports_milestone_id_idx" ON "milestone_reports"("milestone_id");

-- CreateIndex
CREATE INDEX "milestone_reports_report_batch_id_idx" ON "milestone_reports"("report_batch_id");

-- CreateIndex
CREATE INDEX "product_milestone_progresses_tenant_id_idx" ON "product_milestone_progresses"("tenant_id");

-- CreateIndex
CREATE INDEX "product_milestone_progresses_product_id_idx" ON "product_milestone_progresses"("product_id");

-- CreateIndex
CREATE UNIQUE INDEX "idx_pmp_unique" ON "product_milestone_progresses"("product_id", "variant_id", "milestone_template_id");

-- CreateIndex
CREATE INDEX "product_progress_reports_progress_id_idx" ON "product_progress_reports"("progress_id");

-- CreateIndex
CREATE INDEX "production_op_records_tenant_id_idx" ON "production_op_records"("tenant_id");

-- CreateIndex
CREATE INDEX "production_op_records_type_idx" ON "production_op_records"("type");

-- CreateIndex
CREATE INDEX "production_op_records_order_id_idx" ON "production_op_records"("order_id");

-- CreateIndex
CREATE INDEX "production_op_records_product_id_idx" ON "production_op_records"("product_id");

-- CreateIndex
CREATE INDEX "psi_records_tenant_id_idx" ON "psi_records"("tenant_id");

-- CreateIndex
CREATE INDEX "psi_records_type_idx" ON "psi_records"("type");

-- CreateIndex
CREATE INDEX "psi_records_product_id_idx" ON "psi_records"("product_id");

-- CreateIndex
CREATE INDEX "psi_records_doc_number_idx" ON "psi_records"("doc_number");

-- CreateIndex
CREATE INDEX "psi_records_line_group_id_idx" ON "psi_records"("line_group_id");

-- CreateIndex
CREATE INDEX "finance_records_tenant_id_idx" ON "finance_records"("tenant_id");

-- CreateIndex
CREATE INDEX "finance_records_type_idx" ON "finance_records"("type");

-- CreateIndex
CREATE INDEX "finance_records_status_idx" ON "finance_records"("status");

-- AddForeignKey
ALTER TABLE "refresh_tokens" ADD CONSTRAINT "refresh_tokens_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tenant_memberships" ADD CONSTRAINT "tenant_memberships_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tenant_memberships" ADD CONSTRAINT "tenant_memberships_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tenant_memberships" ADD CONSTRAINT "tenant_memberships_role_id_fkey" FOREIGN KEY ("role_id") REFERENCES "roles"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "join_applications" ADD CONSTRAINT "join_applications_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "join_applications" ADD CONSTRAINT "join_applications_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "partners" ADD CONSTRAINT "partners_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "partner_categories"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "products" ADD CONSTRAINT "products_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "product_categories"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_variants" ADD CONSTRAINT "product_variants_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "boms" ADD CONSTRAINT "boms_parent_product_id_fkey" FOREIGN KEY ("parent_product_id") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bom_items" ADD CONSTRAINT "bom_items_bom_id_fkey" FOREIGN KEY ("bom_id") REFERENCES "boms"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "plan_orders" ADD CONSTRAINT "plan_orders_parent_plan_id_fkey" FOREIGN KEY ("parent_plan_id") REFERENCES "plan_orders"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "plan_items" ADD CONSTRAINT "plan_items_plan_order_id_fkey" FOREIGN KEY ("plan_order_id") REFERENCES "plan_orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "production_orders" ADD CONSTRAINT "production_orders_plan_order_id_fkey" FOREIGN KEY ("plan_order_id") REFERENCES "plan_orders"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "production_orders" ADD CONSTRAINT "production_orders_parent_order_id_fkey" FOREIGN KEY ("parent_order_id") REFERENCES "production_orders"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_production_order_id_fkey" FOREIGN KEY ("production_order_id") REFERENCES "production_orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "milestones" ADD CONSTRAINT "milestones_production_order_id_fkey" FOREIGN KEY ("production_order_id") REFERENCES "production_orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "milestone_reports" ADD CONSTRAINT "milestone_reports_milestone_id_fkey" FOREIGN KEY ("milestone_id") REFERENCES "milestones"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_progress_reports" ADD CONSTRAINT "product_progress_reports_progress_id_fkey" FOREIGN KEY ("progress_id") REFERENCES "product_milestone_progresses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "production_op_records" ADD CONSTRAINT "production_op_records_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "production_orders"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "finance_records" ADD CONSTRAINT "finance_records_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "finance_categories"("id") ON DELETE SET NULL ON UPDATE CASCADE;

