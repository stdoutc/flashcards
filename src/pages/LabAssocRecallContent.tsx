import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { AssocTreeMiniMap } from '../components/AssocTreeMiniMap';
import { CardRenderer } from '../components/CardRenderer';
import { findPathFromRoot } from '../domain/assocTree';
import { useFlashcard } from '../context/FlashcardContext';
import type { AssocRecallPayloadV2 } from '../domain/assocRecallPayload';

function countTreeNodes(rootId: string, children: Record<string, string[]>): number {
  let n = 0;
  const walk = (id: string) => {
    n++;
    for (const c of children[id] ?? []) walk(c);
  };
  walk(rootId);
  return n;
}

function collectAllIds(rootId: string, children: Record<string, string[]>): Set<string> {
  const s = new Set<string>();
  const walk = (id: string) => {
    s.add(id);
    for (const c of children[id] ?? []) walk(c);
  };
  walk(rootId);
  return s;
}

function truncateLabel(s: string, n: number): string {
  const t = (s ?? '').replace(/\s+/g, ' ').trim();
  if (!t) return '·';
  return t.length > n ? `${t.slice(0, n - 1)}…` : t;
}

type Phase = 'showFront' | 'showBack' | 'pickChild';

export type AssocRecallContentProps = {
  payload: AssocRecallPayloadV2;
  /** page：独立路由页；panel：图谱页底部浮动层 */
  variant: 'page' | 'panel';
  onClosePanel?: () => void;
};

/**
 * 联想模式主界面（可被路由页或底部浮动层复用）
 */
export const AssocRecallContent: React.FC<AssocRecallContentProps> = ({
  payload,
  variant,
  onClosePanel,
}) => {
  const { state } = useFlashcard();
  const { deckId, rootId, children } = payload;

  const [trail, setTrail] = useState<string[]>([rootId]);
  const [phase, setPhase] = useState<Phase>('showFront');
  const [visitedStarts, setVisitedStarts] = useState<Set<string>>(() => new Set([rootId]));

  useEffect(() => {
    setTrail([rootId]);
    setPhase('showFront');
    setVisitedStarts(new Set([rootId]));
  }, [rootId, deckId, children]);

  const cardById = useMemo(() => {
    return new Map(state.cards.filter((c) => c.deckId === deckId).map((c) => [c.id, c]));
  }, [state.cards, deckId]);

  const treeSize = useMemo(
    () => (rootId ? countTreeNodes(rootId, children) : 0),
    [rootId, children],
  );

  const allIdsInTree = useMemo(
    () => (rootId ? collectAllIds(rootId, children) : new Set<string>()),
    [rootId, children],
  );

  const focusId = trail.length > 0 ? trail[trail.length - 1] : null;
  const focusCard = focusId ? cardById.get(focusId) : null;

  const childIds = useMemo(() => {
    if (!focusId) return [];
    return children[focusId] ?? [];
  }, [focusId, children]);

  const visitedCount = visitedStarts.size;
  const allVisited = treeSize > 0 && visitedCount >= allIdsInTree.size;

  const pickGridStyle = useMemo((): React.CSSProperties => {
    const n = childIds.length;
    if (n <= 0) return {};
    const minW = n === 1 ? 340 : n <= 2 ? 280 : n <= 4 ? 200 : n <= 8 ? 150 : 120;
    const maxH =
      n <= 2
        ? 'min(52vh, 520px)'
        : n <= 4
          ? 'min(42vh, 400px)'
          : n <= 8
            ? 'min(34vh, 320px)'
            : 'min(26vh, 240px)';
    const fontRem = n <= 2 ? 1.02 : n <= 4 ? 0.95 : n <= 8 ? 0.88 : 0.8;
    return {
      ['--assoc-pick-min' as string]: `${minW}px`,
      ['--assoc-pick-max-h' as string]: maxH,
      ['--assoc-pick-font' as string]: `${fontRem}rem`,
    };
  }, [childIds.length]);

  const handleMainCardClick = useCallback(() => {
    if (!focusId || !focusCard) return;
    if (phase === 'showFront') {
      setPhase('showBack');
      return;
    }
    if (phase === 'showBack') {
      setPhase('pickChild');
      return;
    }
  }, [phase, focusId, focusCard]);

  const pickChildAsNewStart = useCallback((childId: string) => {
    setTrail((t) => [...t, childId]);
    setPhase('showFront');
    setVisitedStarts((prev) => new Set(prev).add(childId));
  }, []);

  const goBackLevel = useCallback(() => {
    setTrail((t) => {
      if (t.length <= 1) return t;
      return t.slice(0, -1);
    });
    setPhase('pickChild');
  }, []);

  const jumpToNodeFromMiniMap = useCallback(
    (id: string) => {
      const path = findPathFromRoot(rootId, id, children);
      if (!path?.length) return;
      setTrail(path);
      setPhase('showFront');
      setVisitedStarts((prev) => new Set(prev).add(id));
    },
    [rootId, children],
  );

  const handleKeyDownMain = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        handleMainCardClick();
      }
    },
    [handleMainCardClick],
  );

  const handleKeyDownThumb = useCallback(
    (e: React.KeyboardEvent, id: string) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        pickChildAsNewStart(id);
      }
    },
    [pickChildAsNewStart],
  );

  if (!focusId) {
    return (
      <div className="lab-assoc-recall-inner hint" style={{ padding: 16 }}>
        加载中…
      </div>
    );
  }

  if (!focusCard) {
    return (
      <div className="lab-assoc-recall-inner lab-assoc-recall-error card-surface" style={{ margin: 12 }}>
        <p>找不到当前卡片数据，请确认牌组未变更后重试。</p>
        {variant === 'panel' ? (
          <button type="button" className="button button-primary" onClick={onClosePanel}>
            关闭
          </button>
        ) : (
          <Link to="/lab/assoc" className="button button-primary">
            返回知识联想图谱
          </Link>
        )}
      </div>
    );
  }

  const showFlip = phase === 'showFront' || phase === 'showBack';
  const flipped = phase === 'showBack';

  const pageClass =
    variant === 'panel'
      ? 'lab-assoc-recall-page lab-assoc-recall-page--panel'
      : 'lab-assoc-recall-page lab-assoc-recall-page--fullscreen';

  const recallMinimapEl = (
    <AssocTreeMiniMap
      className="assoc-minimap--recall"
      rootId={rootId}
      children={children}
      focusId={focusId}
      trailIds={trail}
      markedIds={visitedStarts}
      getLabel={(id) => truncateLabel(cardById.get(id)?.front ?? cardById.get(id)?.back ?? id, 10)}
      getTitle={(id) => {
        const c = cardById.get(id);
        if (!c) return id;
        const f = (c.front ?? '').trim();
        const b = (c.back ?? '').trim();
        return b ? `${f}\n——\n${b}` : f;
      }}
      onNodeClick={jumpToNodeFromMiniMap}
      caption="关系缩略图（当前路径高亮，绿环为已复习）"
    />
  );

  return (
    <div className={pageClass}>
      <header className="lab-assoc-recall-toolbar card-surface">
        <span className="lab-assoc-recall-title">联想模式</span>
        <span className="lab-assoc-recall-progress">
          树共 {treeSize} 张 · 已作起始 {visitedCount}/{allIdsInTree.size} · 深度 {trail.length}
        </span>
        <div className="lab-assoc-recall-toolbar-actions">
          {trail.length > 1 && (
            <button type="button" className="button button-ghost button-sm" onClick={goBackLevel}>
              返回上一层
            </button>
          )}
          {variant === 'panel' ? (
            <button type="button" className="button button-ghost button-sm" onClick={onClosePanel}>
              收起面板
            </button>
          ) : (
            <>
              <button type="button" className="button button-ghost button-sm" onClick={() => window.close()}>
                关闭标签页
              </button>
              <Link to="/lab/assoc" className="button button-ghost button-sm">
                返回图谱
              </Link>
            </>
          )}
        </div>
      </header>

      <p className="lab-assoc-recall-hint hint">
        先看<strong>起始卡正面</strong> → 点击看<strong>反面</strong> → 再点击<strong>隐藏起始卡</strong>并同屏显示<strong>所有子卡正面</strong> →
        点击某一子卡将其设为<strong>新起始</strong>并放大；重复直至走遍各分支。
        <span className="lab-assoc-recall-hint-note">
          {' '}
          带「已复习」标记的子卡表示本会话内曾进入过。
          {variant === 'page' ? ' 关闭标签页后不保留。' : ''}
        </span>
      </p>

      {allVisited && (
        <p className="lab-assoc-recall-context hint" style={{ color: 'var(--ok, #4ade80)' }}>
          已从各节点进入过起始流程，遍历完成。仍可返回上一层复习其他路径。
        </p>
      )}

      <div
        className={
          variant === 'page'
            ? 'lab-assoc-recall-main lab-assoc-recall-main--split'
            : 'lab-assoc-recall-main'
        }
      >
        {treeSize > 0 &&
          (variant === 'page' ? (
            <aside className="lab-assoc-recall-aside" aria-label="关系缩略图">
              <div className="lab-assoc-recall-minimap card-surface">{recallMinimapEl}</div>
            </aside>
          ) : (
            <div className="lab-assoc-recall-minimap card-surface">{recallMinimapEl}</div>
          ))}

        <div className="lab-assoc-recall-stage">
          {showFlip && (
            <div className="lab-assoc-recall-start-wrap">
              <div
                className="lab-assoc-flip-scene lab-assoc-recall-start-flip"
                role="button"
                tabIndex={0}
                onClick={handleMainCardClick}
                onKeyDown={handleKeyDownMain}
              >
                <div className={`lab-assoc-flip-inner ${flipped ? 'is-flipped' : ''}`}>
                  <div className="lab-assoc-flip-face lab-assoc-flip-front card-surface">
                    <span className="lab-assoc-recall-face-label">起始 · 正面</span>
                    <div className="lab-assoc-recall-md">
                      <CardRenderer content={focusCard.front} compact />
                    </div>
                  </div>
                  <div className="lab-assoc-flip-face lab-assoc-flip-back card-surface">
                    <span className="lab-assoc-recall-face-label">起始 · 反面</span>
                    <div className="lab-assoc-recall-md">
                      {focusCard.back?.trim() ? (
                        <CardRenderer content={focusCard.back} compact />
                      ) : (
                        <p className="hint">（无背面内容）</p>
                      )}
                    </div>
                  </div>
                </div>
              </div>
              <p className="lab-assoc-recall-start-hint hint">
                {!flipped ? '点击翻面' : '再点击隐藏起始卡，显示子卡片（同屏）'}
              </p>
            </div>
          )}

          {phase === 'pickChild' && (
            <>
              {childIds.length === 0 ? (
                <div className="lab-assoc-recall-empty card-surface">
                  <p>当前节点没有子节点。</p>
                  {trail.length > 1 ? (
                    <button type="button" className="button button-primary" onClick={goBackLevel}>
                      返回上一层
                    </button>
                  ) : (
                    <p className="hint">已到达树根且无分支。</p>
                  )}
                </div>
              ) : (
                <div
                  className="lab-assoc-recall-grid lab-assoc-recall-grid--pick"
                  data-count={childIds.length}
                  style={pickGridStyle}
                >
                  {childIds.map((id) => {
                    const c = cardById.get(id);
                    if (!c) return null;
                    const reviewed = visitedStarts.has(id);
                    return (
                      <button
                        key={id}
                        type="button"
                        className={`lab-assoc-recall-thumb card-surface lab-assoc-recall-thumb--pick${reviewed ? ' is-reviewed' : ''}`}
                        onClick={() => pickChildAsNewStart(id)}
                        onKeyDown={(e) => handleKeyDownThumb(e, id)}
                        aria-label={reviewed ? `已复习的子卡片：${c.front?.slice(0, 40) ?? id}` : undefined}
                      >
                        <span className="lab-assoc-recall-thumb-label">
                          子卡片 · 正面
                          {reviewed && <span className="lab-assoc-recall-reviewed-badge">已复习</span>}
                        </span>
                        <div className="lab-assoc-recall-thumb-md lab-assoc-recall-thumb-md--markdown">
                          <CardRenderer content={c.front} compact />
                        </div>
                        <span className="lab-assoc-recall-thumb-hint">
                          {reviewed ? '已复习 · 点击再次进入' : '点击作为新起始并放大'}
                        </span>
                      </button>
                    );
                  })}
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
};
