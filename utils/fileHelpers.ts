export function getFileExtFromDataUrl(dataUrl: string): string {
  const m = dataUrl.match(/^data:([^;]+);/);
  if (!m) return 'bin';
  const map: Record<string, string> = {
    'image/png': 'png', 'image/jpeg': 'jpg', 'image/gif': 'gif', 'image/webp': 'webp',
    'application/pdf': 'pdf',
  };
  return map[m[1]] || 'bin';
}
