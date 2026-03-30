/**
 * 将 data URL 图片按长边上限缩放并以 JPEG 压缩，用于减小视觉 API 上传体积与推理耗时。
 * 失败时回退为原始 data URL。
 */
export async function shrinkImageDataUrl(
  dataUrl: string,
  options?: { maxLongEdge?: number; jpegQuality?: number },
): Promise<string> {
  const maxLongEdge = options?.maxLongEdge ?? 1280;
  const jpegQuality = options?.jpegQuality ?? 0.82;

  if (typeof document === 'undefined' || !dataUrl.startsWith('data:image')) {
    return dataUrl;
  }

  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      try {
        let w = img.naturalWidth || img.width;
        let h = img.naturalHeight || img.height;
        if (!w || !h) {
          resolve(dataUrl);
          return;
        }

        const long = Math.max(w, h);
        if (long > maxLongEdge) {
          const scale = maxLongEdge / long;
          w = Math.max(1, Math.round(w * scale));
          h = Math.max(1, Math.round(h * scale));
        }

        const canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          resolve(dataUrl);
          return;
        }
        ctx.drawImage(img, 0, 0, w, h);
        const out = canvas.toDataURL('image/jpeg', jpegQuality);
        resolve(out || dataUrl);
      } catch {
        resolve(dataUrl);
      }
    };
    img.onerror = () => resolve(dataUrl);
    img.src = dataUrl;
  });
}
