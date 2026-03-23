import React, { useCallback, useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { layoutAssocTreeMiniMap, preorderSubtree } from '../domain/assocTree';
import { measureAssocMinimapLabelPx } from '../utils/minimapLabelMeasure';

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
/** 底部留白（用户单位），为同层标签自动避让（多行）预留空间 */
const LABEL_RESERVE = 40;

const MIN_VW = 15;

/** 标签在屏幕上的目标字号（px），不随缩略图缩放变化（与 assocTree 中标签宽度估算联动） */
const LABEL_FONT_PX = 13.5;
/** 布局测量与展示都用固定截断长度；拥挤场景通过拉开节点间距解决，不调标签长度 */
const LAYOUT_LABEL_MAX_CHARS = 10;
/**
 * 将标签像素半宽换算为归一化横坐标时的参考视口宽度（与常见右栏固定宽度下缩略图可视区同量级）。
 */
const MINIMAP_REF_CONTENT_WIDTH_PX = 500;
/** 实测宽度后略放大，避免 SVG 与 Canvas 字距差异导致仍重叠 */
const LABEL_MEASURE_SAFETY = 1.18;
/** 圆底边到文字顶边的屏幕间隙（px） */
const LABEL_GAP_PX = 4;
/** 尚无视口宽度时的回退：用户单位字号 */
const LABEL_FONT_U_FALLBACK = 3.1;
const LABEL_GAP_U_FALLBACK = 0.65;
const LABEL_LANE_GAP_PX = 2.5;

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
 * 整棵树关系缩略图：有向边 + 节点 + SVG 文字标签。
 * 缩放/平移时节点与边随 viewBox 变化；文字保持屏幕绝对字号（位置仍跟节点走）。
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
  /** 视口 CSS 宽度，用于把标签字号固定为屏幕像素 */
  const [viewportPxW, setViewportPxW] = useState(0);

  const treeNodeIds = useMemo(() => preorderSubtree(rootId, children), [rootId, children]);

  /** 每节点标签在归一化 x 上的半宽，由 Canvas 实测截断后文本得到 */
  const labelHalfWidthNorm = useMemo(() => {
    const map = new Map<string, number>();
    for (const id of treeNodeIds) {
      const text = shortLabelText(getLabel(id), LAYOUT_LABEL_MAX_CHARS);
      const wPx = measureAssocMinimapLabelPx(text, 600, LABEL_FONT_PX) * LABEL_MEASURE_SAFETY;
      const halfNorm = wPx / 2 / MINIMAP_REF_CONTENT_WIDTH_PX;
      map.set(id, Math.min(Math.max(halfNorm, 0.02), 0.48));
    }
    return map;
  }, [treeNodeIds, getLabel]);

  const { layout, edges, maxDepth } = useMemo(() => {
    const { positions, maxDepth: md } = layoutAssocTreeMiniMap(rootId, children, {
      getLabel,
      labelMaxChars: LAYOUT_LABEL_MAX_CHARS,
      labelHalfWidthNorm,
    });
    const edgesOut: { parent: string; child: string }[] = [];
    for (const [p, arr] of Object.entries(children)) {
      if (!positions.has(p)) continue;
      for (const c of arr) {
        if (positions.has(c)) edgesOut.push({ parent: p, child: c });
      }
    }
    return { layout: positions, edges: edgesOut, maxDepth: md };
  }, [rootId, children, getLabel, labelHalfWidthNorm]);

  /** 布局允许 x>1（横向展开），这里按实际 span 扩展逻辑宽度，通过平移查看 */
  const contentMaxXNorm = useMemo(() => {
    let mx = 1;
    for (const p of layout.values()) mx = Math.max(mx, p.x);
    return mx;
  }, [layout]);
  const mapW = MAP_W * contentMaxXNorm;
  const maxVw = mapW;
  const [vb, setVb] = useState<ViewBoxState>(INITIAL_VB);

  useEffect(() => {
    // 内容宽度变化时重置到全图，确保新增节点后可见
    setVb({ vx: 0, vy: 0, vw: mapW });
  }, [mapW, rootId]);

  const trailSet = useMemo(() => (trailIds ? new Set(trailIds) : null), [trailIds]);
  const arrowMarkerId = useId().replace(/:/g, '');

  const viewportRef = useRef<HTMLDivElement>(null);
  const panning = useRef(false);
  const lastPtr = useRef({ x: 0, y: 0 });
  const applyZoomAtRef = useRef<(sx: number, sy: number, factor: number) => void>(() => {});

  const resetView = useCallback(() => setVb({ vx: 0, vy: 0, vw: mapW }), [mapW]);

  const applyZoomAt = useCallback((sx: number, sy: number, factor: number) => {
    setVb((prev) => {
      const prevVh = vhFromVw(prev.vw);
      const vw = clamp(prev.vw * factor, MIN_VW, maxVw);
      const vh = vhFromVw(vw);
      const vx = prev.vx + sx * (prev.vw - vw);
      const vy = prev.vy + sy * (prevVh - vh);
      return {
        vx: clamp(vx, 0, mapW - vw),
        vy: clamp(vy, 0, MAP_H - vh),
        vw,
      };
    });
  }, [maxVw, mapW]);

  applyZoomAtRef.current = applyZoomAt;

  useLayoutEffect(() => {
    const el = viewportRef.current;
    if (!el) return;
    const update = () => setViewportPxW(el.getBoundingClientRect().width);
    update();
    const ro = new ResizeObserver(() => update());
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

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
        vx: clamp(prev.vx + dvx, 0, mapW - prev.vw),
        vy: clamp(prev.vy + dvy, 0, MAP_H - prevVh),
        vw: prev.vw,
      };
    });
  }, [mapW]);

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

  const vpW = Math.max(viewportPxW, 1);
  const labelFontUser =
    viewportPxW > 0 ? (LABEL_FONT_PX * vb.vw) / vpW : LABEL_FONT_U_FALLBACK;
  const labelGapUser =
    viewportPxW > 0 ? (LABEL_GAP_PX * vb.vw) / vpW : LABEL_GAP_U_FALLBACK;
  const labelLaneGapUser = viewportPxW > 0 ? (LABEL_LANE_GAP_PX * vb.vw) / vpW : 0.4;

  const labelTextById = useMemo(() => {
    const m = new Map<string, string>();
    for (const id of layout.keys()) {
      m.set(id, shortLabelText(getLabel(id), LAYOUT_LABEL_MAX_CHARS));
    }
    return m;
  }, [layout, getLabel]);

  /** 按同层碰撞检测为标签分配 lane（0,1,2...），不改字号，仅通过多行错位提升可读性 */
  const labelLaneById = useMemo(() => {
    const byDepth = new Map<number, Array<{ id: string; cx: number; w: number }>>();
    const minGapUser = labelFontUser * 0.35;
    for (const [id, pos] of layout.entries()) {
      const p = toSvgCoords(pos.x / contentMaxXNorm, pos.depth, maxDepth);
      const cx = p.cx * contentMaxXNorm;
      const text = labelTextById.get(id) ?? '';
      const wPx = measureAssocMinimapLabelPx(text, 600, LABEL_FONT_PX) * LABEL_MEASURE_SAFETY;
      const wUser = (wPx * vb.vw) / vpW;
      if (!byDepth.has(pos.depth)) byDepth.set(pos.depth, []);
      byDepth.get(pos.depth)!.push({ id, cx, w: wUser });
    }
    const out = new Map<string, number>();
    for (const items of byDepth.values()) {
      items.sort((a, b) => a.cx - b.cx);
      const laneRightBound: number[] = [];
      for (const item of items) {
        let lane = 0;
        while (lane < laneRightBound.length) {
          if (item.cx - item.w / 2 >= laneRightBound[lane] + minGapUser) break;
          lane += 1;
        }
        if (lane === laneRightBound.length) laneRightBound.push(-Infinity);
        laneRightBound[lane] = item.cx + item.w / 2;
        out.set(item.id, lane);
      }
    }
    return out;
  }, [layout, contentMaxXNorm, maxDepth, labelTextById, vb.vw, vpW, labelFontUser]);

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
            width={mapW}
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
            const a = toSvgCoords(pp.x / contentMaxXNorm, pp.depth, maxDepth);
            const b = toSvgCoords(cp.x / contentMaxXNorm, cp.depth, maxDepth);
            a.cx *= contentMaxXNorm;
            b.cx *= contentMaxXNorm;
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
            const p = toSvgCoords(pos.x / contentMaxXNorm, pos.depth, maxDepth);
            const cx = p.cx * contentMaxXNorm;
            const cy = p.cy;
            const isRoot = id === rootId;
            const isFocus = focusId === id;
            const onTrail = trailSet?.has(id) ?? false;
            const marked = markedIds?.has(id) ?? false;
            const title = getTitle?.(id) ?? getLabel(id);
            const r = isFocus ? 5.2 : onTrail ? 4.4 : 3.6;
            const clickable = Boolean(onNodeClick);
            const raw = getLabel(id);
            const labelText = shortLabelText(raw, LAYOUT_LABEL_MAX_CHARS);
            const lane = labelLaneById.get(id) ?? 0;
            const labelY =
              cy +
              r +
              labelGapUser +
              labelFontUser / 2 +
              lane * (labelFontUser + labelLaneGapUser);
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
                  fontSize={labelFontUser}
                  stroke="rgba(2,6,23,0.9)"
                  strokeWidth={0.9}
                  paintOrder="stroke"
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
          ? '滚轮缩放 · 空白处拖拽平移 · 双击空白重置 · 点击节点定位 · 标签自动错行避让'
          : '滚轮缩放 · 空白处拖拽平移 · 双击空白重置 · 标签自动错行避让'}
      </p>
    </div>
  );
};
