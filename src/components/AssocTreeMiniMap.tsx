import React, { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import { layoutAssocTreeMiniMap } from '../domain/assocTree';

export type AssocTreeMiniMapProps = {
  rootId: string;
  children: Record<string, string[]>;
  /** 节点短标签（纯文本） */
  getLabel: (id: string) => string;
  /** 完整提示（hover） */
  getTitle?: (id: string) => string;
  /** 当前焦点（编辑：起始卡；联想：当前起始） */
  focusId: string | null;
  /** 根到当前的路径 id（联想模式传 trail，用于高亮整条路径） */
  trailIds?: readonly string[] | null;
  /** 额外标记（如联想「已复习」） */
  markedIds?: ReadonlySet<string> | null;
  onNodeClick?: (id: string) => void;
  className?: string;
  caption?: string;
};

/** 逻辑坐标系：底部预留 LABEL_RESERVE，保证默认全图视角下文字不裁切 */
const MAP_W = 100;
const MAP_H = 128;
const PAD = { x: 7, y: 9 };
/** 节点列底部留白（用户单位），专供节点下方 SVG 文字 */
const LABEL_RESERVE = 14;

const MIN_VW = 15;
const MAX_VW = MAP_W;

/** 标签字号（用户单位），随 viewBox 缩放，与节点相对几何关系不变 */
const LABEL_FONT_U = 2.65;
/** 圆底边到文字顶边的间隙（用户单位） */
const LABEL_GAP_U = 0.55;

function clamp(n: number, a: number, b: number): number {
  return Math.min(b, Math.max(a, n));
}

function vhFromVw(vw: number): number {
  return vw * (MAP_H / MAP_W);
}

function toSvgCoords(
  nx: number,
  depth: number,
  maxDepth: number,
): { cx: number; cy: number } {
  const innerW = MAP_W - PAD.x * 2;
  const innerH = MAP_H - PAD.y * 2 - LABEL_RESERVE;
  const cx = PAD.x + nx * innerW;
  const cy =
    maxDepth <= 0
      ? PAD.y + innerH / 2
      : PAD.y + (depth / maxDepth) * innerH;
  return { cx, cy };
}

type ViewBoxState = { vx: number; vy: number; vw: number };

const INITIAL_VB: ViewBoxState = { vx: 0, vy: 0, vw: MAP_W };

function shortLabelText(raw: string, maxLen: number): string {
  const t = (raw ?? '').replace(/\s+/g, ' ').trim();
  if (!t) return '·';
  return t.length > maxLen ? `${t.slice(0, maxLen - 1)}…` : t;
}

/**
 * 整棵树关系缩略图：有向边 + 节点 + SVG 文字标签（与节点同一坐标系，缩放/平移不改变相对位置）。
 */
export const AssocTreeMiniMap: React.FC<AssocTreeMiniMapProps> = ({
  rootId,
  children,
  getLabel,
  getTitle,
  focusId,
  trailIds,
  markedIds,
  onNodeClick,
  className,
  caption,
}) => {
  const { layout, edges, maxDepth } = useMemo(() => {
    const { positions, maxDepth: md } = layoutAssocTreeMiniMap(rootId, children);
    const edgesOut: { parent: string; child: string }[] = [];
    for (const [p, arr] of Object.entries(children)) {
      if (!positions.has(p)) continue;
      for (const c of arr) {
        if (positions.has(c)) edgesOut.push({ parent: p, child: c });
      }
    }
    return { layout: positions, edges: edgesOut, maxDepth: md };
  }, [rootId, children]);

  const trailSet = useMemo(() => (trailIds ? new Set(trailIds) : null), [trailIds]);
  const arrowMarkerId = useId().replace(/:/g, '');

  const [vb, setVb] = useState<ViewBoxState>(INITIAL_VB);
  const viewportRef = useRef<HTMLDivElement>(null);
  const panning = useRef(false);
  const lastPtr = useRef({ x: 0, y: 0 });
  const applyZoomAtRef = useRef<(sx: number, sy: number, factor: number) => void>(() => {});

  const resetView = useCallback(() => setVb(INITIAL_VB), []);

  const applyZoomAt = useCallback((sx: number, sy: number, factor: number) => {
    setVb((prev) => {
      const prevVh = vhFromVw(prev.vw);
      const vw = clamp(prev.vw * factor, MIN_VW, MAX_VW);
      const vh = vhFromVw(vw);
      const vx = prev.vx + sx * (prev.vw - vw);
      const vy = prev.vy + sy * (prevVh - vh);
      return {
        vx: clamp(vx, 0, MAP_W - vw),
        vy: clamp(vy, 0, MAP_H - vh),
        vw,
      };
    });
  }, []);

  applyZoomAtRef.current = applyZoomAt;

  useEffect(() => {
    const el = viewportRef.current;
    if (!el) return;
    const onWheelNative = (e: WheelEvent) => {
      e.preventDefault();
      e.stopPropagation();
      const rect = el.getBoundingClientRect();
      const sx = (e.clientX - rect.left) / rect.width;
      const sy = (e.clientY - rect.top) / rect.height;
      const factor = e.deltaY < 0 ? 0.92 : 1.08;
      applyZoomAtRef.current(sx, sy, factor);
    };
    el.addEventListener('wheel', onWheelNative, { passive: false });
    return () => el.removeEventListener('wheel', onWheelNative);
  }, []);

  const zoomInBtn = useCallback(() => {
    applyZoomAt(0.5, 0.5, 0.92);
  }, [applyZoomAt]);

  const zoomOutBtn = useCallback(() => {
    applyZoomAt(0.5, 0.5, 1.08);
  }, [applyZoomAt]);

  const [grabbing, setGrabbing] = useState(false);

  const onPanPointerDown = useCallback((e: React.PointerEvent) => {
    if (e.button !== 0) return;
    e.preventDefault();
    panning.current = true;
    setGrabbing(true);
    lastPtr.current = { x: e.clientX, y: e.clientY };
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  }, []);

  const onPanPointerMove = useCallback((e: React.PointerEvent) => {
    if (!panning.current || !viewportRef.current) return;
    const rect = viewportRef.current.getBoundingClientRect();
    const dx = e.clientX - lastPtr.current.x;
    const dy = e.clientY - lastPtr.current.y;
    lastPtr.current = { x: e.clientX, y: e.clientY };
    setVb((prev) => {
      const prevVh = vhFromVw(prev.vw);
      const dvx = (-dx / rect.width) * prev.vw;
      const dvy = (-dy / rect.height) * prevVh;
      return {
        vx: clamp(prev.vx + dvx, 0, MAP_W - prev.vw),
        vy: clamp(prev.vy + dvy, 0, MAP_H - prevVh),
        vw: prev.vw,
      };
    });
  }, []);

  const onPanPointerUp = useCallback((e: React.PointerEvent) => {
    panning.current = false;
    setGrabbing(false);
    try {
      (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
    } catch {
      /* ignore */
    }
  }, []);

  const onDoubleClickViewport = useCallback(
    (e: React.MouseEvent) => {
      if ((e.target as HTMLElement).closest('.assoc-minimap-node')) return;
      resetView();
    },
    [resetView],
  );

  const vbVh = vhFromVw(vb.vw);

  const labelMaxChars = layout.size > 14 ? 7 : layout.size > 8 ? 8 : 10;

  return (
    <div className={`assoc-minimap ${className ?? ''}`.trim()}>
      {caption ? <div className="assoc-minimap-caption">{caption}</div> : null}
      <div className="assoc-minimap-toolbar">
        <span className="assoc-minimap-zoom-label" aria-hidden>
          视角
        </span>
        <button type="button" className="assoc-minimap-tool-btn" onClick={zoomInBtn} title="放大">
          +
        </button>
        <button type="button" className="assoc-minimap-tool-btn" onClick={zoomOutBtn} title="缩小">
          −
        </button>
        <button type="button" className="assoc-minimap-tool-btn" onClick={resetView} title="重置视角">
          ⟲
        </button>
      </div>
      <div
        ref={viewportRef}
        className={`assoc-minimap-viewport${grabbing ? ' is-grabbing' : ''}`}
        onDoubleClick={onDoubleClickViewport}
        role="presentation"
      >
        <svg
          className="assoc-minimap-svg"
          viewBox={`${vb.vx} ${vb.vy} ${vb.vw} ${vbVh}`}
          preserveAspectRatio="xMidYMid meet"
          role="img"
          aria-label="知识树关系缩略图"
        >
          <defs>
            <marker
              id={arrowMarkerId}
              markerWidth="5"
              markerHeight="5"
              refX="4"
              refY="2.5"
              orient="auto"
              markerUnits="strokeWidth"
            >
              <path d="M0,0 L5,2.5 L0,5 Z" fill="rgba(129,140,248,0.55)" />
            </marker>
          </defs>
          <rect
            x={0}
            y={0}
            width={MAP_W}
            height={MAP_H}
            fill="transparent"
            className="assoc-minimap-pan-layer"
            onPointerDown={onPanPointerDown}
            onPointerMove={onPanPointerMove}
            onPointerUp={onPanPointerUp}
            onPointerCancel={onPanPointerUp}
          />
          {edges.map(({ parent: pid, child: cid }) => {
            const pp = layout.get(pid);
            const cp = layout.get(cid);
            if (!pp || !cp) return null;
            const a = toSvgCoords(pp.x, pp.depth, maxDepth);
            const b = toSvgCoords(cp.x, cp.depth, maxDepth);
            return (
              <line
                key={`${pid}-${cid}`}
                x1={a.cx}
                y1={a.cy}
                x2={b.cx}
                y2={b.cy}
                className="assoc-minimap-edge"
                markerEnd={`url(#${arrowMarkerId})`}
              />
            );
          })}
          {[...layout.entries()].map(([id, pos]) => {
            const { cx, cy } = toSvgCoords(pos.x, pos.depth, maxDepth);
            const isRoot = id === rootId;
            const isFocus = focusId === id;
            const onTrail = trailSet?.has(id) ?? false;
            const marked = markedIds?.has(id) ?? false;
            const title = getTitle?.(id) ?? getLabel(id);
            const r = isFocus ? 5.2 : onTrail ? 4.4 : 3.6;
            const clickable = Boolean(onNodeClick);
            const raw = getLabel(id);
            const labelText = shortLabelText(raw, labelMaxChars);
            const labelY = cy + r + LABEL_GAP_U + LABEL_FONT_U / 2;
            return (
              <g
                key={id}
                className={`assoc-minimap-node${isFocus ? ' is-focus' : ''}${isRoot ? ' is-root' : ''}${onTrail ? ' is-trail' : ''}${marked ? ' is-marked' : ''}`}
                onDoubleClick={(e) => e.stopPropagation()}
              >
                <title>{title}</title>
                {marked ? (
                  <circle cx={cx} cy={cy} r={r + 2.2} className="assoc-minimap-mark-ring" />
                ) : null}
                <circle
                  cx={cx}
                  cy={cy}
                  r={r}
                  className="assoc-minimap-node-circle"
                  role={clickable ? 'button' : undefined}
                  tabIndex={clickable ? 0 : undefined}
                  onClick={clickable ? () => onNodeClick?.(id) : undefined}
                  onPointerDown={(e) => e.stopPropagation()}
                  onKeyDown={
                    clickable
                      ? (e) => {
                          if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault();
                            onNodeClick?.(id);
                          }
                        }
                      : undefined
                  }
                />
                <text
                  x={cx}
                  y={labelY}
                  textAnchor="middle"
                  dominantBaseline="middle"
                  fontSize={LABEL_FONT_U}
                  className="assoc-minimap-node-label"
                >
                  {labelText}
                </text>
              </g>
            );
          })}
        </svg>
      </div>
      <p className="assoc-minimap-hint hint">
        {onNodeClick
          ? '滚轮缩放 · 空白处拖拽平移 · 双击空白重置 · 点击节点定位'
          : '滚轮缩放 · 空白处拖拽平移 · 双击空白重置'}
      </p>
    </div>
  );
};
