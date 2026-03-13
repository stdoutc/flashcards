import React, { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useFlashcard } from '../context/FlashcardContext';
import { CardRenderer } from '../components/CardRenderer';
import { getDailyProgress, getTodayStart, previewNextIntervals } from '../domain/scheduler';
import type { ReviewRating } from '../domain/models';


// 进度条（带数字标注）
const LimitBar: React.FC<{
  label: string;
  done: number;
  limit: number;
  colorClass: string;
}> = ({ label, done, limit, colorClass }) => {
  const pct = Math.min(100, (done / limit) * 100);
  const reached = done >= limit;
  return (
    <div className="limit-bar-wrap">
      <div className="limit-bar-header">
        <span className="limit-bar-label">{label}</span>
        <span className={`limit-bar-count ${reached ? 'limit-reached' : ''}`}>
          {done} / {limit}
        </span>
      </div>
      <div className="limit-bar-track">
        <div
          className={`limit-bar-fill ${colorClass} ${reached ? 'limit-bar-full' : ''}`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
};

export const StudyPage: React.FC = () => {
  const { deckId } = useParams<{ deckId: string }>();
  const { state, selectDeck, currentStudyCard, reviewCurrentCard, dailyProgress, getNow } =
    useFlashcard();

  const [revealed, setRevealed] = useState(false);
  const [sessionTotal, setSessionTotal] = useState(0);
  const [sessionCorrect, setSessionCorrect] = useState(0);

  useEffect(() => {
    if (deckId) selectDeck(deckId);
  }, [deckId, selectDeck]);

  // 翻牌后切下一张时收起反面
  useEffect(() => {
    setRevealed(false);
  }, [currentStudyCard?.id]);

  const deck = useMemo(
    () => state.decks.find((d) => d.id === deckId) ?? null,
    [state.decks, deckId],
  );

  const cardsOfDeck = useMemo(
    () => state.cards.filter((c) => c.deckId === deckId),
    [state.cards, deckId],
  );

  // 今日各分类卡片数量（受每日上限限制，与 LimitBar 保持一致）
  const todayStats = useMemo(() => {
    const now = getNow();
    const todayStart = getTodayStart(now);

    const newCardsAll    = cardsOfDeck.filter((c) => c.lastReviewAt === null);
    const learningCards  = cardsOfDeck.filter(
      (c) => c.lastReviewAt !== null && c.lastReviewAt >= todayStart && (c.nextReview ?? 0) <= now,
    );
    const reviewCardsAll = cardsOfDeck.filter(
      (c) => c.lastReviewAt !== null && c.lastReviewAt < todayStart && (c.nextReview ?? 0) <= now,
    );
    const masteredCards  = cardsOfDeck.filter((c) => c.mastery >= 3);

    // 计算今日已用配额，推算今日还能学的上限
    const { newToday, reviewToday } = deckId
      ? getDailyProgress(state.reviewLogs, deckId, now)
      : { newToday: 0, reviewToday: 0 };
    const newLimit    = deck?.newPerDay    ?? 0;
    const reviewLimit = deck?.reviewPerDay ?? 0;

    // 今日还能学的新卡数（不超过实际可用新卡数）
    const newRemaining    = Math.min(newCardsAll.length,    Math.max(0, newLimit    - newToday));
    // 今日还能复习的旧卡数（不超过实际到期卡数）
    const reviewRemaining = Math.min(reviewCardsAll.length, Math.max(0, reviewLimit - reviewToday));

    return {
      newRemaining,
      learningRemaining: learningCards.length,
      reviewRemaining,
      masteredCount: masteredCards.length,
      total: cardsOfDeck.length,
      // 原始数量（供完成画面判断用）
      totalNewCards: newCardsAll.length,
      totalReviewCards: reviewCardsAll.length,
    };
  }, [cardsOfDeck, deck, state.reviewLogs, deckId, getNow]);

  const intervalPreview = useMemo(
    () => (currentStudyCard ? previewNextIntervals(currentStudyCard) : null),
    [currentStudyCard],
  );

  const handleReveal = () => setRevealed(true);

  const handleRate = (rating: ReviewRating) => {
    reviewCurrentCard(rating);
    setSessionTotal((n) => n + 1);
    if (rating === 'good' || rating === 'easy') setSessionCorrect((n) => n + 1);
  };

  const sessionAccuracy =
    sessionTotal > 0 ? Math.round((sessionCorrect / sessionTotal) * 100) : null;

  // 当前卡属于哪种类型（用于标签显示）
  const currentCardType = useMemo(() => {
    if (!currentStudyCard) return null;
    const todayStart = getTodayStart(getNow());
    if (currentStudyCard.lastReviewAt === null) return 'new';
    if (currentStudyCard.lastReviewAt >= todayStart) return 'learning';
    return 'review';
  }, [currentStudyCard, getNow]);

  // 完成原因分析
  const doneReason = useMemo(() => {
    if (!deck) return 'no-deck';
    if (todayStats.total === 0) return 'no-cards';
    if (dailyProgress) {
      const newFull    = dailyProgress.newToday >= dailyProgress.newLimit;
      const reviewFull = dailyProgress.reviewToday >= dailyProgress.reviewLimit;
      const noLearning = todayStats.learningRemaining === 0;
      if (noLearning && newFull && reviewFull) return 'limits-reached';
      if (noLearning && reviewFull && todayStats.newRemaining === 0) return 'limits-reached';
    }
    return 'all-done';
  }, [deck, todayStats, dailyProgress]);

  if (!deckId || !deck) {
    return (
      <div className="card-surface">
        <p className="hint">未找到该卡组。</p>
        <Link to="/" className="button button-ghost">返回首页</Link>
      </div>
    );
  }

  const ratings: { key: ReviewRating; label: string; cls: string }[] = [
    { key: 'again', label: '重来', cls: 'button-rating-again' },
    { key: 'hard',  label: '困难', cls: 'button-rating-hard'  },
    { key: 'good',  label: '记住', cls: 'button-rating-good'  },
    { key: 'easy',  label: '简单', cls: 'button-rating-easy'  },
  ];

  return (
    <div className="study-page">
      {/* 顶部导航 */}
      <div className="study-topbar">
        <Link to="/" className="button button-ghost">← 返回</Link>
        <div className="study-deck-title">{deck.name}</div>
        <Link to={`/deck/${deckId}/cards`} className="button button-ghost">管理卡片</Link>
      </div>

      {/* 每日进度条（与设置的学习计划对应） */}
      {dailyProgress && (
        <div className="daily-progress-panel">
          <LimitBar
            label="今日新卡"
            done={dailyProgress.newToday}
            limit={dailyProgress.newLimit}
            colorClass="limit-bar-blue"
          />
          <LimitBar
            label="今日复习"
            done={dailyProgress.reviewToday}
            limit={dailyProgress.reviewLimit}
            colorClass="limit-bar-amber"
          />
        </div>
      )}

      {/* 剩余卡片概览 */}
      <div className="study-progress-row">
        {todayStats.learningRemaining > 0 && (
          <span className="progress-chip progress-chip-learning">
            学习中 {todayStats.learningRemaining}
          </span>
        )}
        <span className="progress-chip progress-chip-due">
          待复习 {todayStats.reviewRemaining}
        </span>
        <span className="progress-chip progress-chip-new">
          新卡 {todayStats.newRemaining}
        </span>
        <span className="progress-chip progress-chip-mastered">
          掌握 {todayStats.masteredCount}/{todayStats.total}
        </span>
        {sessionTotal > 0 && (
          <span className="progress-chip progress-chip-session">
            本次 {sessionTotal} 张 · {sessionAccuracy}%
          </span>
        )}
      </div>

      {/* 主学习区 */}
      {currentStudyCard ? (
        <div className="study-main">
          {/* 卡片类型标签 */}
          {currentCardType && (
            <div className="study-card-type-row">
              {currentCardType === 'new'      && <span className="card-type-badge card-type-new">新卡</span>}
              {currentCardType === 'learning' && <span className="card-type-badge card-type-learning">学习中</span>}
              {currentCardType === 'review'   && <span className="card-type-badge card-type-review">复习</span>}
            </div>
          )}

          {/* 卡片正反面 */}
          <div className={`study-card-wrap ${revealed ? 'revealed' : ''}`}>
            <div className="study-face study-front-face">
              <div className="study-face-label">正面</div>
              <CardRenderer content={currentStudyCard.front} className="study-content" />
            </div>
            <div className="study-back-reveal">
              <div className="study-face-divider" />
              <div className="study-face study-back-face">
                <div className="study-face-label">反面</div>
                <CardRenderer content={currentStudyCard.back} className="study-content" />
              </div>
            </div>
          </div>

          {/* 操作按钮 */}
          {!revealed ? (
            <div className="study-actions-wrap">
              <button type="button" className="button-show-answer" onClick={handleReveal}>
                显示答案
              </button>
            </div>
          ) : (
            <div className="study-actions-wrap">
              <div className="rating-group">
                {ratings.map(({ key, label, cls }) => (
                  <button
                    key={key}
                    type="button"
                    className={`button-rating ${cls}`}
                    onClick={() => handleRate(key)}
                  >
                    <span className="rating-label">{label}</span>
                    {intervalPreview && (
                      <span className="rating-interval">{intervalPreview[key]}</span>
                    )}
                  </button>
                ))}
              </div>
              <p className="hint small" style={{ textAlign: 'center', marginTop: 8 }}>
                根据记忆质量选择——系统会按间隔重复算法安排下次复习时间。
              </p>
            </div>
          )}

          {/* 标签 */}
          {currentStudyCard.tags?.length > 0 && (
            <div className="tag-list" style={{ justifyContent: 'center', marginTop: 8 }}>
              {currentStudyCard.tags.map((t) => <span key={t} className="tag">{t}</span>)}
            </div>
          )}
        </div>
      ) : (
        /* 完成画面 */
        <div className="study-done-wrap">
          <div className="study-done-icon">
            {doneReason === 'limits-reached' ? '✅' : '🎉'}
          </div>
          <div className="study-done-title">
            {doneReason === 'no-cards'
              ? '卡组还没有卡片'
              : doneReason === 'limits-reached'
              ? '今日学习计划已完成！'
              : '本轮已完成！'}
          </div>
          <div className="study-done-sub">
            {doneReason === 'no-cards' && '先去「管理卡片」添加一些卡片吧。'}
            {doneReason === 'limits-reached' && (
              <>
                已达到今日每日新卡（{dailyProgress?.newLimit ?? 0} 张）或复习上限（{dailyProgress?.reviewLimit ?? 0} 张）。
                <br />可在「设置」中调整每日学习计划，或明天继续。
              </>
            )}
            {doneReason === 'all-done' && '所有到期卡片已复习完毕，系统会在记忆遗忘前提醒你再次复习。'}
          </div>
          {sessionTotal > 0 && (
            <div className="study-done-stats">
              <span>本次 <b>{sessionTotal}</b> 张</span>
              <span>正确率 <b>{sessionAccuracy}%</b></span>
              <span>掌握 <b>{todayStats.masteredCount}</b> / {todayStats.total}</span>
            </div>
          )}
          <div style={{ display: 'flex', gap: 10, marginTop: 16, flexWrap: 'wrap', justifyContent: 'center' }}>
            <Link to="/" className="button button-ghost">返回首页</Link>
            <Link to={`/deck/${deckId}/cards`} className="button">管理卡片</Link>
            <Link to="/settings" className="button button-ghost">调整设置</Link>
          </div>
        </div>
      )}
    </div>
  );
};
