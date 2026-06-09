import React, { useCallback, useMemo, useState } from 'react';
import { BookOpen, FileText } from 'lucide-react';
import { toast } from 'sonner';
import { useAuthOptional } from '../../contexts/AuthContext';
import { useConfirm } from '../../contexts/ConfirmContext';
import { hasModulePerm } from '../../utils/hasModulePerm';
import {
  useKnowledgeBaseTree,
  useKnowledgeDocument,
  useKnowledgeBaseMutations,
} from '../../hooks/useKnowledgeBase';
import type { KnowledgeFolderDto, KnowledgeDocumentDto } from '../../types';
import KnowledgeTreeSidebar from './KnowledgeTreeSidebar';
import KnowledgeRichEditor from './KnowledgeRichEditor';
import KnowledgeFolderModal from './KnowledgeFolderModal';

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ''));
    reader.onerror = () => reject(new Error('读取文件失败'));
    reader.readAsDataURL(file);
  });
}

const KnowledgeBaseView: React.FC = () => {
  const auth = useAuthOptional();
  const tenantRole = auth?.tenantCtx?.tenantRole;
  const perms = auth?.tenantCtx?.permissions;
  const confirm = useConfirm();

  const hasKbPerm = useCallback(
    (perm: string) => hasModulePerm(tenantRole, perms, 'knowledge_base', perm),
    [tenantRole, perms],
  );

  const canViewDoc = hasKbPerm('knowledge_base:documents:view');
  const canCreateFolder = hasKbPerm('knowledge_base:folders:create');
  const canEditFolder = hasKbPerm('knowledge_base:folders:edit');
  const canDeleteFolder = hasKbPerm('knowledge_base:folders:delete');
  const canCreateDoc = hasKbPerm('knowledge_base:documents:create');
  const canEditDoc = hasKbPerm('knowledge_base:documents:edit');
  const canDeleteDoc = hasKbPerm('knowledge_base:documents:delete');

  const { data: treeData, isLoading } = useKnowledgeBaseTree();
  const folders = treeData?.folders ?? [];
  const documents = treeData?.documents ?? [];

  const [selectedDocId, setSelectedDocId] = useState<string | null>(null);
  const [draftTitle, setDraftTitle] = useState('');
  const [folderModal, setFolderModal] = useState<{
    open: boolean;
    mode: 'create' | 'rename';
    parentId: string | null;
    folder?: KnowledgeFolderDto;
  }>({ open: false, mode: 'create', parentId: null });

  const { data: selectedDoc, isLoading: docLoading } = useKnowledgeDocument(selectedDocId);
  const {
    createFolder,
    updateFolder,
    deleteFolder,
    createDocument,
    updateDocument,
    deleteDocument,
    uploadAsset,
  } = useKnowledgeBaseMutations();

  const editorTitle = selectedDoc ? draftTitle : '';
  const editorContent = selectedDoc?.content ?? '';

  React.useEffect(() => {
    if (selectedDoc) setDraftTitle(selectedDoc.title);
  }, [selectedDoc?.id]);

  const handleSave = async (payload: { docId: string; title: string; content: string }) => {
    if (!canEditDoc) return;
    const doc = payload.docId === selectedDocId
      ? selectedDoc
      : documents.find(d => d.id === payload.docId);
    const normalized = { title: payload.title.trim(), content: payload.content };
    if (doc && doc.title === normalized.title && doc.content === normalized.content) return;
    try {
      await updateDocument.mutateAsync({
        id: payload.docId,
        body: normalized,
      });
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : '保存失败');
      throw err;
    }
  };

  const handleUploadImage = async (file: File): Promise<string> => {
    const data = await readFileAsDataUrl(file);
    const res = await uploadAsset.mutateAsync({ data, mimeType: file.type });
    return res.url;
  };

  const handleMoveDocument = async (
    docId: string,
    body: { folderId?: string | null; sortOrder: number },
  ) => {
    if (!canEditDoc) return;
    const doc = documents.find(d => d.id === docId);
    if (!doc) return;
    const nextFolderId = body.folderId !== undefined ? body.folderId : doc.folderId;
    if (doc.folderId === nextFolderId && doc.sortOrder === body.sortOrder) return;
    try {
      await updateDocument.mutateAsync({ id: docId, body });
      const folderChanged = body.folderId !== undefined && doc.folderId !== body.folderId;
      toast.success(folderChanged ? '已移动到目标文件夹' : '已更新排序');
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : '移动失败');
    }
  };

  const handleMoveFolder = async (
    folderId: string,
    body: { parentId?: string | null; sortOrder: number },
  ) => {
    if (!canEditFolder) return;
    const folder = folders.find(f => f.id === folderId);
    if (!folder) return;
    const nextParentId = body.parentId !== undefined ? body.parentId : folder.parentId;
    if (folder.parentId === nextParentId && folder.sortOrder === body.sortOrder) return;
    try {
      await updateFolder.mutateAsync({ id: folderId, body });
      toast.success('文件夹已移动');
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : '移动失败');
    }
  };

  const handleCreateFolder = async (name: string) => {
    try {
      await createFolder.mutateAsync({
        name,
        parentId: folderModal.parentId,
      });
      toast.success('文件夹已创建');
      setFolderModal({ open: false, mode: 'create', parentId: null });
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : '创建失败');
    }
  };

  const handleRenameFolder = async (name: string) => {
    if (!folderModal.folder) return;
    try {
      await updateFolder.mutateAsync({ id: folderModal.folder.id, body: { name } });
      toast.success('已重命名');
      setFolderModal({ open: false, mode: 'create', parentId: null });
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : '重命名失败');
    }
  };

  const handleDeleteFolder = async (folder: KnowledgeFolderDto) => {
    const ok = await confirm({
      title: '删除文件夹',
      message: `确定删除「${folder.name}」？`,
      confirmLabel: '删除',
      danger: true,
    });
    if (!ok) return;
    try {
      await deleteFolder.mutateAsync(folder.id);
      toast.success('文件夹已删除');
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : '删除失败');
    }
  };

  const handleCreateDoc = async (folderId: string | null) => {
    try {
      const doc = await createDocument.mutateAsync({
        title: '未命名文档',
        folderId,
        content: '<p></p>',
      });
      setSelectedDocId(doc.id);
      setDraftTitle(doc.title);
      toast.success('文档已创建');
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : '创建失败');
    }
  };

  const handleDeleteDoc = async (doc: KnowledgeDocumentDto) => {
    const ok = await confirm({
      title: '删除文档',
      message: `确定删除「${doc.title}」？`,
      confirmLabel: '删除',
      danger: true,
    });
    if (!ok) return;
    try {
      await deleteDocument.mutateAsync(doc.id);
      if (selectedDocId === doc.id) setSelectedDocId(null);
      toast.success('文档已删除');
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : '删除失败');
    }
  };

  const emptyState = useMemo(() => {
    if (!canViewDoc) {
      return (
        <div className="flex flex-1 flex-col items-center justify-center text-slate-400">
          <BookOpen className="mb-3 h-10 w-10 text-slate-300" />
          <p className="text-sm font-medium">无权查看资料库文档</p>
        </div>
      );
    }
    return (
      <div className="flex flex-1 flex-col items-center justify-center text-slate-400">
        <FileText className="mb-3 h-10 w-10 text-slate-300" />
        <p className="text-sm font-medium">选择或新建文档开始编辑</p>
        <p className="mt-1 text-xs">鼠标移到正文左侧 + 可插入内容块</p>
      </div>
    );
  }, [canViewDoc]);

  if (isLoading) {
    return (
      <div className="-mx-12 -mt-4 -mb-8 flex h-[calc(100vh-5rem)] items-center justify-center border-t border-slate-200 bg-white">
        <p className="text-sm text-slate-400">加载资料库…</p>
      </div>
    );
  }

  return (
    <div className="-mx-12 -mt-4 -mb-8 flex min-h-[calc(100vh-5rem)] h-[calc(100vh-5rem)] overflow-hidden border-t border-slate-200 bg-white">
      <KnowledgeTreeSidebar
        folders={folders}
        documents={documents}
        selectedDocId={selectedDocId}
        canCreateFolder={canCreateFolder}
        canEditFolder={canEditFolder}
        canDeleteFolder={canDeleteFolder}
        canCreateDoc={canCreateDoc}
        canDeleteDoc={canDeleteDoc}
        canMoveDoc={canEditDoc}
        canMoveFolder={canEditFolder}
        onSelectDoc={setSelectedDocId}
        onMoveDocument={handleMoveDocument}
        onMoveFolder={handleMoveFolder}
        onCreateFolder={parentId =>
          setFolderModal({ open: true, mode: 'create', parentId })
        }
        onRenameFolder={folder =>
          setFolderModal({ open: true, mode: 'rename', parentId: folder.parentId, folder })
        }
        onDeleteFolder={handleDeleteFolder}
        onCreateDoc={handleCreateDoc}
        onDeleteDoc={handleDeleteDoc}
      />

      {selectedDocId && selectedDoc && !docLoading ? (
        <div className="min-w-0 flex-1">
          <KnowledgeRichEditor
            documentId={selectedDocId}
            title={editorTitle}
            content={editorContent}
            updatedAt={selectedDoc.updatedAt}
            editable={canEditDoc}
            saving={updateDocument.isPending}
            onTitleChange={setDraftTitle}
            onSave={handleSave}
            onUploadImage={handleUploadImage}
          />
        </div>
      ) : (
        emptyState
      )}

      <KnowledgeFolderModal
        open={folderModal.open}
        mode={folderModal.mode}
        initialName={folderModal.folder?.name ?? ''}
        submitting={createFolder.isPending || updateFolder.isPending}
        onClose={() => setFolderModal({ open: false, mode: 'create', parentId: null })}
        onSubmit={folderModal.mode === 'create' ? handleCreateFolder : handleRenameFolder}
      />
    </div>
  );
};

export default KnowledgeBaseView;
