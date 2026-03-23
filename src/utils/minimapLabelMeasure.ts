/**
 * 用 Canvas measureText 测量缩略图标签宽度（与 SVG 标签字重/字体族一致），供树布局计算横向占位。
 */
let _canvas: HTMLCanvasElement | null = null;

/** 与 AssocTreeMiniMap 中 LABEL_FONT_PX、.assoc-minimap-node-label 一致 */
const DEFAULT_FONT_PX = 13.5;

export function measureAssocMinimapLabelPx(
  text: string,
  fontWeight = 600,
  fontPx = DEFAULT_FONT_PX,
): number {
  const t = text ?? '';
  if (typeof document === 'undefined') {
    return Math.max(4, t.length) * fontPx * 0.62;
  }
  if (!_canvas) _canvas = document.createElement('canvas');
  const ctx = _canvas.getContext('2d');
  if (!ctx) return Math.max(4, t.length) * fontPx * 0.62;
  ctx.font = `${fontWeight} ${fontPx}px system-ui, -apple-system, "Segoe UI", "Segoe UI Emoji", sans-serif`;
  return ctx.measureText(t).width;
}
