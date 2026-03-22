import React, { useId, useMemo } from 'react';
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

const VB = { w: 100, h: 100 };
const PAD = { x: 7, y: 9 };

function toSvgCoords(
  nx: number,
  depth: number,
  maxDepth: number,
): { cx: number; cy: number } {
  const innerW = VB.w - PAD.x * 2;
  const innerH = VB.h - PAD.y * 2;
  const cx = PAD.x + nx * innerW;
  const cy =
    maxDepth <= 0
      ? PAD.y + innerH / 2
      : PAD.y + (depth / maxDepth) * innerH;
  return { cx, cy };
}

/**
 * 整棵树关系缩略图：有向边 + 节点，可点击快速定位。
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

  return (
    <div className={`assoc-minimap ${className ?? ''}`.trim()}>
      {caption ? <div className="assoc-minimap-caption">{caption}</div> : null}
      <svg
        className="assoc-minimap-svg"
        viewBox={`0 0 ${VB.w} ${VB.h}`}
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
          const label = getLabel(id);
          const title = getTitle?.(id) ?? label;
          const r = isFocus ? 5.2 : onTrail ? 4.4 : 3.6;
          const clickable = Boolean(onNodeClick);
          return (
            <g
              key={id}
              className={`assoc-minimap-node${isFocus ? ' is-focus' : ''}${isRoot ? ' is-root' : ''}${onTrail ? ' is-trail' : ''}${marked ? ' is-marked' : ''}`}
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
                y={cy + r + 6.5}
                textAnchor="middle"
                className="assoc-minimap-node-label"
                pointerEvents="none"
              >
                {label.length > 8 ? `${label.slice(0, 7)}…` : label}
              </text>
            </g>
          );
        })}
      </svg>
      <p className="assoc-minimap-hint hint">
        {onNodeClick ? '点击节点可快速定位' : '树结构概览'}
      </p>
    </div>
  );
};
