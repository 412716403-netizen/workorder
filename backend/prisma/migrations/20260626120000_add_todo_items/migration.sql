-- CreateTable
CREATE TABLE "todo_items" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "source_type" VARCHAR(40) NOT NULL DEFAULT 'standalone',
    "source_id" VARCHAR(50),
    "source_doc_no" VARCHAR(100),
    "source_title" VARCHAR(200),
    "href" TEXT,
    "note" TEXT NOT NULL,
    "remind_enabled" BOOLEAN NOT NULL DEFAULT false,
    "remind_at" TIMESTAMPTZ,
    "reminded_at" TIMESTAMPTZ,
    "status" VARCHAR(20) NOT NULL DEFAULT 'open',
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "todo_items_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "todo_items_tenant_id_user_id_status_idx" ON "todo_items"("tenant_id", "user_id", "status");

-- CreateIndex
CREATE INDEX "todo_items_tenant_id_user_id_remind_enabled_remind_at_idx" ON "todo_items"("tenant_id", "user_id", "remind_enabled", "remind_at");

-- AddForeignKey
ALTER TABLE "todo_items" ADD CONSTRAINT "todo_items_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "todo_items" ADD CONSTRAINT "todo_items_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
