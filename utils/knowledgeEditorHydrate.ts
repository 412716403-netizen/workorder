/** 判断是否应将服务端正文写入 Tiptap（避免自动保存回写时重置光标） */
export function shouldApplyRemoteContentHydrate(opts: {
  documentSwitched: boolean;
  remoteContent: string;
  editorHtml: string;
  isDirty: boolean;
  isEditorFocused: boolean;
}): boolean {
  if (opts.documentSwitched) return true;
  if (opts.remoteContent === opts.editorHtml) return false;
  if (opts.isDirty || opts.isEditorFocused) return false;
  return true;
}
