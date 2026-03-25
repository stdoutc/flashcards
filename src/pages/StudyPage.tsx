import React, { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useFlashcard } from '../context/FlashcardContext';
import { CardRenderer } from '../components/CardRenderer';
import {
  getDailyProgress,
  getTodayStart,
  isRetiredCard,
  previewNextIntervals,
  RETIRED_MASTERY,
} from '../domain/scheduler';
import type { ReviewRating } from '../domain/models';


// 进度条（带数字标注）
const LimitBar: React.FC<{
  label: string;
  done: number;
  limit: number;
  colorClass: string;
}> = ({ label, done, limit, colorClass }) => {
  const safeLimit = Math.max(0, limit, done);
  const pct = safeLimit > 0 ? Math.min(100, (done / safeLimit) * 100) : 0;
  const reached = done >= safeLimit;
  return (
    <div className="limit-bar-wrap">
      <div className="limit-bar-header">
        <span className="limit-bar-label">{label}</span>
        <span className={`limit-bar-count ${reached ? 'limit-reached' : ''}`}>
          {done} / {safeLimit}
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

function getMasteryMeta(mastery: number): { label: string; cls: string; lv: number } {
  const lv = Math.max(0, Math.min(5, Math.floor(mastery || 0)));
  if (lv >= 5) return { label: '精通', cls: 'is-mastered', lv };
  if (lv >= 4) return { label: '掌握', cls: 'is-proficient', lv };
  if (lv >= 3) return { label: '熟练', cls: 'is-learning', lv };
  if (lv >= 2) return { label: '学习中', cls: 'is-beginner', lv };
  if (lv >= 1) return { label: '初学', cls: 'is-beginner', lv };
  return { label: '未学习', cls: 'is-new', lv };
}

export const StudyPage: React.FC = () => {
  const { deckId } = useParams<{ deckId: string }>();
  const { state, selectDeck, currentStudyCard, reviewCurrentCard, markCurrentCardMastered, dailyProgress, getNow, practiceSession, startPracticeCards } =
    useFlashcard();

  const [revealed, setRevealed] = useState(false);
  const [sessionTotal, setSessionTotal] = useState(0);
  const [practiceCountInput, setPracticeCountInput] = useState('10');
  const parsedPracticeN = parseInt(practiceCountInput, 10);
  const canStartPractice = Number.isFinite(parsedPracticeN) && parsedPracticeN > 0;

  useEffect(() => {
    if (deckId) selectDeck(deckId);
  }, [deckId, selectDeck]);

  // 翻牌后切下一张时收起反面
  useEffect(() => {
    setRevealed(false);
  }, [currentStudyCard?.id]);

  // 开启“再学”会话后，清零当前统计（本次计数只算练习卡数）
  useEffect(() => {
    if (!practiceSession) return;
    setSessionTotal(0);
  }, [practiceSession?.runId]);

  const deck = useMemo(
    () => state.decks.find((d) => d.id === deckId) ?? null,
    [state.decks, deckId],
  );

  const cardsOfDeck = useMemo(
    () => state.cards.filter((c) => c.deckId === deckId),
    [state.cards, deckId],
  );

  // 今日各分类卡片数量
  const todayStats = useMemo(() => {
    const now = getNow();
    const todayStart = getTodayStart(now);
    const activeCards = cardsOfDeck.filter((c) => !isRetiredCard(c));

    const newCardsAll    = activeCards.filter((c) => c.lastReviewAt === null);
    const learningCards  = activeCards.filter(
      (c) => c.lastReviewAt !== null && c.lastReviewAt >= todayStart && (c.nextReview ?? 0) <= now,
    );
    const reviewCardsAll = activeCards.filter(
      (c) => c.lastReviewAt !== null && c.lastReviewAt < todayStart && (c.nextReview ?? 0) <= now,
    );
    const masteredCards  = cardsOfDeck.filter((c) => (c.mastery ?? 0) >= RETIRED_MASTERY);

    // 计算今日已用新卡配额，推算今日还能学的新卡上限
    const { newToday, reviewToday } = deckId
      ? getDailyProgress(state.reviewLogs, deckId, now)
      : { newToday: 0, reviewToday: 0 };
    const extraLimit = practiceSession?.target ?? 0;
    const newLimit    = (deck?.newPerDay ?? 0) + extraLimit;

    // 今日还能学的新卡数（不超过实际可用新卡数）
    const newRemaining    = Math.min(newCardsAll.length,    Math.max(0, newLimit    - newToday));
    // 当前需要复习的旧卡数（复习不设上限，直接按到期数量）
    // 注意：reviewCardsAll 已经是“此刻到期且待复习”的数量，不能再减 reviewToday。
    const reviewRemaining = reviewCardsAll.length;

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
  }, [cardsOfDeck, deck, state.reviewLogs, deckId, getNow, practiceSession]);

  const intervalPreview = useMemo(
    () => (currentStudyCard ? previewNextIntervals(currentStudyCard) : null),
    [currentStudyCard],
  );

  // “今日复习”分母采用：今日已复习 + 当前待复习（含学习中到期），
  // 与实际仍需处理的复习任务口径保持一致。
  const reviewNeedTotal = useMemo(() => {
    if (!dailyProgress) return 0;
    return dailyProgress.reviewToday + todayStats.reviewRemaining + todayStats.learningRemaining;
  }, [todayStats.reviewRemaining, todayStats.learningRemaining, dailyProgress]);

  const handleReveal = () => setRevealed(true);

  const handleRate = (rating: ReviewRating) => {
    reviewCurrentCard(rating);
    setSessionTotal((n) => n + 1);
  };

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
    if (practiceSession) {
      if (practiceSession.remaining <= 0) return 'practice-done';
      // 练习期间但当前没有可学卡片（例如卡组为空）
      if (!currentStudyCard) return 'practice-stopped';
    }
    if (!deck) return 'no-deck';
    if (todayStats.total === 0) return 'no-cards';
    if (dailyProgress) {
      const newFull    = dailyProgress.newToday >= dailyProgress.newLimit;
      const noLearning = todayStats.learningRemaining === 0;
      if (noLearning && newFull && todayStats.newRemaining === 0) return 'limits-reached';
    }
    return 'all-done';
  }, [deck, todayStats, dailyProgress, practiceSession, currentStudyCard]);

  const handleStartPractice = () => {
    const n = parseInt(practiceCountInput, 10);
    if (!Number.isFinite(n) || n <= 0) return;
    startPracticeCards(n);
  };

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
    { key: 'good',  label: '良好', cls: 'button-rating-good'  },
    { key: 'easy',  label: '简单', cls: 'button-rating-easy'  },
  ];

  const masteryMeta = currentStudyCard ? getMasteryMeta(currentStudyCard.mastery) : null;

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
            limit={reviewNeedTotal}
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
            本次 {sessionTotal} 张
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
              {masteryMeta && (
                <span className={`card-mastery-badge ${masteryMeta.cls}`}>
                  {masteryMeta.label} · Lv{masteryMeta.lv}
                </span>
              )}
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
              <div style={{ display: 'flex', justifyContent: 'center', marginTop: 10 }}>
                <button
                  type="button"
                  className="button button-ghost"
                  onClick={markCurrentCardMastered}
                >
                  直接标记为掌握
                </button>
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
              : doneReason === 'practice-done'
              ? `再学完 ${practiceSession?.target ?? parsedPracticeN} 张！`
              : doneReason === 'practice-stopped'
              ? '再学提前结束！'
              : '本轮已完成！'}
          </div>
          <div className="study-done-sub">
            {doneReason === 'no-cards' && '先去「管理卡片」添加一些卡片吧。'}
            {doneReason === 'limits-reached' && (
              <>
                已达到今日每日新卡上限（{dailyProgress?.newLimit ?? 0} 张）。
                <br />可在「设置」中调整每日学习计划，或明天继续学习到期复习卡。
              </>
            )}
            {doneReason === 'all-done' && '所有到期卡片已复习完毕，系统会在记忆遗忘前提醒你再次复习。'}
            {doneReason === 'practice-done' && '练习已完成。你可以继续再学或返回首页。'}
            {doneReason === 'practice-stopped' && '当前没有可学卡片可继续练习。'}
          </div>
          {sessionTotal > 0 && (
            <div className="study-done-stats">
              <span>本次 <b>{sessionTotal}</b> 张</span>
              <span>掌握 <b>{todayStats.masteredCount}</b> / {todayStats.total}</span>
            </div>
          )}
          <div style={{ display: 'flex', gap: 10, marginTop: 16, flexWrap: 'wrap', justifyContent: 'center' }}>
            <Link to="/" className="button button-ghost">返回首页</Link>
            <Link to={`/deck/${deckId}/cards`} className="button">管理卡片</Link>
            <Link to="/settings" className="button button-ghost">调整设置</Link>
          </div>

          <div
            style={{
              display: 'flex',
              gap: 10,
              marginTop: 12,
              flexWrap: 'wrap',
              justifyContent: 'center',
              alignItems: 'center',
            }}
          >
            <input
              className="input"
              type="number"
              min={1}
              max={500}
              step={1}
              value={practiceCountInput}
              onChange={(e) => setPracticeCountInput(e.target.value)}
              style={{ width: 110, textAlign: 'center' }}
            />
            <button
              type="button"
              className="button button-primary"
              disabled={!canStartPractice}
              onClick={handleStartPractice}
            >
              再学 {canStartPractice ? parsedPracticeN : practiceCountInput.trim() || 'n'} 张
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
