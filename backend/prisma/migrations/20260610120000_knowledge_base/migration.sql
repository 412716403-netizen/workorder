-- CreateTable
CREATE TABLE "knowledge_folders" (
    "id" VARCHAR(50) NOT NULL,
    "tenant_id" UUID NOT NULL,
    "parent_id" VARCHAR(50),
    "name" VARCHAR(200) NOT NULL,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "knowledge_folders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "knowledge_documents" (
    "id" VARCHAR(50) NOT NULL,
    "tenant_id" UUID NOT NULL,
    "folder_id" VARCHAR(50),
    "title" VARCHAR(200) NOT NULL,
    "content" TEXT NOT NULL DEFAULT '',
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "knowledge_documents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "knowledge_assets" (
    "id" VARCHAR(50) NOT NULL,
    "tenant_id" UUID NOT NULL,
    "mime_type" VARCHAR(100) NOT NULL,
    "size_bytes" INTEGER NOT NULL,
    "data" BYTEA NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "knowledge_assets_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "knowledge_folders_tenant_id_idx" ON "knowledge_folders"("tenant_id");

-- CreateIndex
CREATE INDEX "knowledge_folders_tenant_id_parent_id_idx" ON "knowledge_folders"("tenant_id", "parent_id");

-- CreateIndex
CREATE INDEX "knowledge_documents_tenant_id_idx" ON "knowledge_documents"("tenant_id");

-- CreateIndex
CREATE INDEX "knowledge_documents_folder_id_idx" ON "knowledge_documents"("folder_id");

-- CreateIndex
CREATE INDEX "knowledge_assets_tenant_id_idx" ON "knowledge_assets"("tenant_id");

-- AddForeignKey
ALTER TABLE "knowledge_folders" ADD CONSTRAINT "knowledge_folders_parent_id_fkey" FOREIGN KEY ("parent_id") REFERENCES "knowledge_folders"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "knowledge_documents" ADD CONSTRAINT "knowledge_documents_folder_id_fkey" FOREIGN KEY ("folder_id") REFERENCES "knowledge_folders"("id") ON DELETE SET NULL ON UPDATE CASCADE;
