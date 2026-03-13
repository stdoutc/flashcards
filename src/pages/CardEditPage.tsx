import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import type { Card } from '../domain/models';
import { useFlashcard } from '../context/FlashcardContext';
import { CardRenderer } from '../components/CardRenderer';
import { Modal } from '../components/Modal';

interface CardDraft {
  id?: string;
  front: string;
  back: string;
  tagsText: string;
}

const EMPTY_DRAFT: CardDraft = { front: '', back: '', tagsText: '' };

function insertAtCursor(
  el: HTMLTextAreaElement,
  before: string,
  after = '',
  placeholder = '',
): string {
  const start = el.selectionStart;
  const end = el.selectionEnd;
  const selected = el.value.slice(start, end) || placeholder;
  return el.value.slice(0, start) + before + selected + after + el.value.slice(end);
}

// ── 卡片编辑 Modal 内容组件 ─────────────────────────────────────
interface CardEditorProps {
  draft: CardDraft;
  onChange: (draft: CardDraft) => void;
  onSave: () => void;
  onCancel: () => void;
}

const CardEditor: React.FC<CardEditorProps> = ({ draft, onChange, onSave, onCancel }) => {
  const [previewOpen, setPreviewOpen] = useState(true);
  const [activeField, setActiveField] = useState<'front' | 'back'>('front');

  // 图片链接插入状态
  const [imgPickerOpen, setImgPickerOpen] = useState(false);
  const [imgUrl, setImgUrl] = useState('');
  const [imgAlt, setImgAlt] = useState('');
  const imgUrlRef = useRef<HTMLInputElement>(null);

  // draft 变化时（新卡 vs 编辑卡切换）重置状态
  const draftId = draft.id;
  useEffect(() => { setActiveField('front'); setImgPickerOpen(false); }, [draftId]);

  const handleToolbar = useCallback((
    field: 'front' | 'back',
    before: string,
    after = '',
    placeholder = '',
  ) => {
    const el = document.getElementById(
      field === 'front' ? 'modal-editor-front' : 'modal-editor-back',
    ) as HTMLTextAreaElement | null;
    if (!el) return;
    const newVal = insertAtCursor(el, before, after, placeholder);
    onChange({ ...draft, [field]: newVal });
    setTimeout(() => el.focus(), 0);
  }, [draft, onChange]);

  const openImgPicker = () => {
    setImgPickerOpen(true);
    setImgUrl('');
    setImgAlt('');
    setTimeout(() => imgUrlRef.current?.focus(), 50);
  };

  const handleInsertImageUrl = () => {
    const url = imgUrl.trim();
    if (!url) return;
    const alt = imgAlt.trim() || 'image';
    const mdImg = `![${alt}](${url})`;
    const elId = activeField === 'front' ? 'modal-editor-front' : 'modal-editor-back';
    const el = document.getElementById(elId) as HTMLTextAreaElement | null;
    const newVal = el
      ? insertAtCursor(el, mdImg, '', '')
      : draft[activeField] + mdImg;
    onChange({ ...draft, [activeField]: newVal });
    setImgPickerOpen(false);
    setTimeout(() => el?.focus(), 0);
  };

  const canSave = draft.front.trim().length > 0 && draft.back.trim().length > 0;

  const tags = draft.tagsText
    ? draft.tagsText.split(',').map((t) => t.trim()).filter(Boolean)
    : [];

  return (
    <>
      {/* Markdown 工具栏 */}
      <div className="md-toolbar">
        {(['front', 'back'] as const).map((f) => (
          <button
            key={f}
            type="button"
            className={`button button-ghost md-toolbar-tab ${activeField === f ? 'active' : ''}`}
            onClick={() => setActiveField(f)}
          >
            {f === 'front' ? '正面' : '反面'}
          </button>
        ))}
        <span className="toolbar-spacer" />
        <button type="button" className="button button-ghost md-tool" title="粗体"
          onClick={() => handleToolbar(activeField, '**', '**', '粗体文本')}>B</button>
        <button type="button" className="button button-ghost md-tool" title="斜体"
          onClick={() => handleToolbar(activeField, '*', '*', '斜体文本')}><i>I</i></button>
        <button type="button" className="button button-ghost md-tool" title="行内代码"
          onClick={() => handleToolbar(activeField, '`', '`', 'code')}>`</button>
        <button type="button" className="button button-ghost md-tool" title="代码块"
          onClick={() => handleToolbar(activeField, '```\n', '\n```', '代码')}>{ }</button>
        <button type="button" className="button button-ghost md-tool" title="行内公式 $...$"
          onClick={() => handleToolbar(activeField, '$', '$', 'x^2')}>𝑓</button>
        <button type="button" className="button button-ghost md-tool" title="块级公式 $$...$$"
          onClick={() => handleToolbar(activeField, '$$\n', '\n$$', '\\int_0^\\infty')}>Σ</button>
        <span className="toolbar-divider" />
        <button
          type="button"
          className={`button button-ghost md-tool${imgPickerOpen ? ' active' : ''}`}
          title="插入图片链接"
          onClick={() => imgPickerOpen ? setImgPickerOpen(false) : openImgPicker()}
        >
          🖼
        </button>
        <span className="toolbar-divider" />
        <button
          type="button"
          className={`button button-ghost md-tool${previewOpen ? ' active' : ''}`}
          title={previewOpen ? '隐藏预览' : '显示预览'}
          onClick={() => setPreviewOpen((v) => !v)}
        >
          👁
        </button>
      </div>

      {/* 图片链接输入面板 */}
      {imgPickerOpen && (
        <div className="img-size-picker">
          <div className="img-size-picker-header">
            <span className="img-size-picker-title">插入图片到「{activeField === 'front' ? '正面' : '反面'}」</span>
          </div>
          <div className="img-size-picker-custom">
            <span className="img-size-custom-label">图片 URL：</span>
            <input
              ref={imgUrlRef}
              type="url"
              className="input"
              style={{ flex: 1, minWidth: 0 }}
              placeholder="https://example.com/image.png"
              value={imgUrl}
              onChange={(e) => setImgUrl(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleInsertImageUrl()}
            />
          </div>
          <div className="img-size-picker-custom">
            <span className="img-size-custom-label">替代文字：</span>
            <input
              type="text"
              className="input"
              style={{ flex: 1, minWidth: 0 }}
              placeholder="图片描述（可选）"
              value={imgAlt}
              onChange={(e) => setImgAlt(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleInsertImageUrl()}
            />
          </div>
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
            <button type="button" className="button button-ghost img-size-cancel"
              onClick={() => setImgPickerOpen(false)}>取消</button>
            <button type="button" className="button button-primary"
              disabled={!imgUrl.trim()} onClick={handleInsertImageUrl}>插入</button>
          </div>
        </div>
      )}

      {/* 编辑 + 实时预览分屏 */}
      <div className={`editor-split${previewOpen ? ' editor-split--with-preview' : ''}`}>

        {/* 左：编辑区 */}
        <div className="editor-split-main">
          <div className="field">
            <label className="label" htmlFor="modal-editor-front">
              正面<span className="label-sub">单词 / 问题 / 提示</span>
            </label>
            <textarea
              id="modal-editor-front"
              className={`textarea editor-textarea ${activeField === 'front' ? 'active-field' : ''}`}
              value={draft.front}
              onChange={(e) => onChange({ ...draft, front: e.target.value })}
              onFocus={() => setActiveField('front')}
              placeholder={"例如：什么是牛顿第二定律？\n\n支持 Markdown：**粗体** *斜体* `code`\n支持 LaTeX：$F=ma$"}
              autoFocus
            />
          </div>

          <div className="field">
            <label className="label" htmlFor="modal-editor-back">
              反面<span className="label-sub">解释 / 答案</span>
            </label>
            <textarea
              id="modal-editor-back"
              className={`textarea editor-textarea ${activeField === 'back' ? 'active-field' : ''}`}
              value={draft.back}
              onChange={(e) => onChange({ ...draft, back: e.target.value })}
              onFocus={() => setActiveField('back')}
              placeholder={"$$F = ma$$\n\n其中 $F$ 为合力，$m$ 为质量，$a$ 为加速度。"}
            />
          </div>

          <div className="field">
            <label className="label" htmlFor="modal-editor-tags">
              标签<span className="label-sub">逗号分隔</span>
            </label>
            <input
              id="modal-editor-tags"
              className="input"
              value={draft.tagsText}
              onChange={(e) => onChange({ ...draft, tagsText: e.target.value })}
              placeholder="物理, 力学, 重要"
            />
          </div>
        </div>

        {/* 右：实时预览 */}
        {previewOpen && (
          <div className="editor-split-preview">
            <div className="editor-preview-label">实时预览</div>
            <div className="preview-face-label">正面</div>
            <div className="card-preview-face">
              <CardRenderer content={draft.front || ''} />
              {!draft.front && <span className="editor-preview-empty">（空）</span>}
            </div>
            <div className="preview-face-label" style={{ marginTop: 12 }}>反面</div>
            <div className="card-preview-face">
              <CardRenderer content={draft.back || ''} />
              {!draft.back && <span className="editor-preview-empty">（空）</span>}
            </div>
            {tags.length > 0 && (
              <div className="tag-list" style={{ marginTop: 10 }}>
                {tags.map((t) => <span key={t} className="tag">{t}</span>)}
              </div>
            )}
          </div>
        )}
      </div>

      <div className="editor-actions">
        <button type="button" className="button button-ghost" onClick={onCancel}>
          取消
        </button>
        <button
          type="button"
          className="button button-primary"
          onClick={onSave}
          disabled={!canSave}
        >
          {draft.id ? '保存修改' : '添加卡片'}
        </button>
      </div>

      {/* Markdown 语法速查 */}
      <details className="md-cheatsheet">
        <summary>Markdown / LaTeX 语法速查</summary>
        <div className="md-cheatsheet-body">
          <div className="cheat-row"><code>**粗体**</code><span>→ <strong>粗体</strong></span></div>
          <div className="cheat-row"><code>*斜体*</code><span>→ <em>斜体</em></span></div>
          <div className="cheat-row"><code>`行内代码`</code><span>→ 代码高亮</span></div>
          <div className="cheat-row"><code>```语言 ... ```</code><span>→ 代码块</span></div>
          <div className="cheat-row"><code>- item</code><span>→ 无序列表</span></div>
          <div className="cheat-row"><code>1. item</code><span>→ 有序列表</span></div>
          <div className="cheat-row"><code>$E=mc^2$</code><span>→ 行内公式</span></div>
          <div className="cheat-row"><code>$$\int_0^\infty$$</code><span>→ 块级公式</span></div>
          <div className="cheat-row"><code>\frac{"{a}"}{"{b}"}</code><span>→ 分数</span></div>
          <div className="cheat-row"><code>\sqrt{"{x}"}</code><span>→ 根号</span></div>
        </div>
      </details>
    </>
  );
};

// ── 主页面 ─────────────────────────────────────────────────────
export const CardEditPage: React.FC = () => {
  const { deckId } = useParams<{ deckId: string }>();
  const { state, selectDeck, createCard, updateCard, deleteCard, deleteCards, updateDeck } = useFlashcard();

  // 编辑 Modal 状态
  const [editorOpen, setEditorOpen] = useState(false);
  const [cardDraft, setCardDraft] = useState<CardDraft>(EMPTY_DRAFT);

  // 搜索
  const [searchQuery, setSearchQuery] = useState('');
  const searchRef = useRef<HTMLInputElement>(null);

  // 批量选择
  const [bulkMode, setBulkMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (deckId) selectDeck(deckId);
  }, [deckId, selectDeck]);

  const deck = useMemo(
    () => state.decks.find((d) => d.id === deckId) ?? null,
    [state.decks, deckId],
  );

  const cardsOfDeck = useMemo(
    () => [...state.cards.filter((c) => c.deckId === deckId)].reverse(),
    [state.cards, deckId],
  );

  const filteredCards = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return cardsOfDeck;
    return cardsOfDeck.filter((c) => {
      const inContent = c.front.toLowerCase().includes(q) || c.back.toLowerCase().includes(q);
      const inTags = (c.tags ?? []).some((t) => t.toLowerCase().includes(q));
      return inContent || inTags;
    });
  }, [cardsOfDeck, searchQuery]);

  const masteredCount = cardsOfDeck.filter((c) => c.mastery >= 3).length;
  const newCount = cardsOfDeck.filter((c) => (c.mastery ?? 0) === 0).length;

  // 打开新建窗口
  const openCreateModal = () => {
    setCardDraft(EMPTY_DRAFT);
    setEditorOpen(true);
  };

  // 打开编辑窗口
  const openEditModal = (card: Card) => {
    setCardDraft({
      id: card.id,
      front: card.front,
      back: card.back,
      tagsText: (card.tags ?? []).join(', '),
    });
    setEditorOpen(true);
  };

  // 保存后自动关闭
  const handleSave = () => {
    if (!deckId) return;
    const front = cardDraft.front.trim();
    const back = cardDraft.back.trim();
    if (!front || !back) return;
    const tags = cardDraft.tagsText.split(',').map((t) => t.trim()).filter(Boolean);

    if (cardDraft.id) {
      updateCard(cardDraft.id, { front, back, tags });
    } else {
      createCard(deckId, {
        deckId,
        cardType: 'basic',
        front,
        back,
        tags,
        mastery: 0,
        easeFactor: 2.5,
        interval: 24 * 60 * 60 * 1000,
        nextReview: null,
        lastReviewAt: null,
      });
    }
    setEditorOpen(false);
    setCardDraft(EMPTY_DRAFT);
  };

  const handleCloseEditor = () => {
    setEditorOpen(false);
    setCardDraft(EMPTY_DRAFT);
  };

  const handleDeleteCard = (card: Card) => {
    if (!window.confirm(`确定删除该卡片？\n\n${card.front}`)) return;
    deleteCard(card.id);
  };

  const toggleBulkMode = () => {
    setBulkMode((v) => !v);
    setSelectedIds(new Set());
  };

  const toggleSelectCard = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleSelectAll = () => {
    if (selectedIds.size === filteredCards.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(filteredCards.map((c) => c.id)));
    }
  };

  const handleBulkDelete = () => {
    if (selectedIds.size === 0) return;
    if (!window.confirm(`确定删除选中的 ${selectedIds.size} 张卡片？此操作不可撤销。`)) return;
    deleteCards(Array.from(selectedIds));
    setSelectedIds(new Set());
    setBulkMode(false);
  };

  if (!deckId || !deck) {
    return (
      <div className="card-surface">
        <p className="hint">未找到该卡组。</p>
        <Link to="/" className="button button-ghost">返回首页</Link>
      </div>
    );
  }

  return (
    <div className="edit-page">
      {/* 顶部栏 */}
      <div className="edit-topbar">
        <Link to="/" className="button button-ghost">← 返回</Link>
        <div className="edit-deck-title">{deck.name}</div>
        <Link to={`/deck/${deckId}/study`} className="button button-primary">开始复习</Link>
      </div>

      {/* 卡组日限设置 */}
      <div className="card-surface deck-limit-bar">
        <span className="deck-limit-label">📅 每日学习计划</span>
        <label className="deck-limit-item">
          <span>新卡上限</span>
          <input
            type="number"
            className="input deck-limit-input"
            min={1}
            max={9999}
            value={deck.newPerDay}
            onChange={(e) => updateDeck(deckId, { newPerDay: Math.max(1, Number(e.target.value)) })}
          />
          <span className="deck-limit-unit">张 / 天</span>
        </label>
        <label className="deck-limit-item">
          <span>复习上限</span>
          <input
            type="number"
            className="input deck-limit-input"
            min={1}
            max={9999}
            value={deck.reviewPerDay}
            onChange={(e) => updateDeck(deckId, { reviewPerDay: Math.max(1, Number(e.target.value)) })}
          />
          <span className="deck-limit-unit">张 / 天</span>
        </label>
      </div>

      {/* 卡片列表（全宽） */}
      <section className="card-surface edit-list-panel edit-list-panel--full">
        <div className="section-header">
          <span className="section-header-title">卡片列表</span>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span className="pill">
              {cardsOfDeck.length} 张 · 新 {newCount} · 掌握 {masteredCount}
            </span>
            <button type="button" className="button button-primary" onClick={openCreateModal}>
              ＋ 新建卡片
            </button>
          </div>
        </div>

        {/* 搜索栏 */}
        <div className="card-list-search-bar">
          <div className="card-list-search-wrap">
            <span className="card-list-search-icon">🔍</span>
            <input
              ref={searchRef}
              className="card-list-search-input"
              type="text"
              placeholder="搜索内容或标签…"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
            {searchQuery && (
              <button
                type="button"
                className="card-list-search-clear"
                onClick={() => { setSearchQuery(''); searchRef.current?.focus(); }}
              >
                ✕
              </button>
            )}
          </div>
          <button
            type="button"
            className={`button button-ghost card-list-bulk-btn ${bulkMode ? 'active' : ''}`}
            onClick={toggleBulkMode}
            title={bulkMode ? '退出批量模式' : '批量选择'}
          >
            {bulkMode ? '取消' : '批量'}
          </button>
        </div>

        {/* 批量操作工具栏 */}
        {bulkMode && (
          <div className="card-list-bulk-toolbar">
            <button type="button" className="button button-ghost" onClick={handleSelectAll}>
              {selectedIds.size === filteredCards.length && filteredCards.length > 0
                ? '取消全选'
                : `全选 (${filteredCards.length})`}
            </button>
            <span className="card-list-bulk-count">已选 {selectedIds.size} 张</span>
            <button
              type="button"
              className="button button-danger"
              disabled={selectedIds.size === 0}
              onClick={handleBulkDelete}
            >
              删除所选
            </button>
          </div>
        )}

        <div className="card-list-full">
          {filteredCards.length === 0 && (
            <p className="hint">
              {searchQuery
                ? `未找到与"${searchQuery}"匹配的卡片。`
                : '当前卡组暂无卡片，点击右上角"新建卡片"添加第一张吧。'}
            </p>
          )}
          {filteredCards.map((card) => {
            const isSelected = selectedIds.has(card.id);
            return (
              <div
                key={card.id}
                className={`card-row ${bulkMode && isSelected ? 'card-row-selected' : ''}`}
                onClick={bulkMode ? () => toggleSelectCard(card.id) : undefined}
              >
                {bulkMode && (
                  <label className="card-row-checkbox" onClick={(e) => e.stopPropagation()}>
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={() => toggleSelectCard(card.id)}
                    />
                  </label>
                )}
                <div
                  className="card-row-main"
                  onClick={bulkMode ? undefined : () => openEditModal(card)}
                >
                  <div className="card-front">
                    <CardRenderer content={card.front} />
                  </div>
                  <div className="card-back">
                    <CardRenderer content={card.back} />
                  </div>
                  {card.tags?.length > 0 && (
                    <div className="tag-list" style={{ marginTop: 4 }}>
                      {card.tags.map((t) => (
                        <span key={t} className="tag">{t}</span>
                      ))}
                    </div>
                  )}
                </div>
                {!bulkMode && (
                  <div className="card-row-actions">
                    <button
                      type="button"
                      className="button button-ghost"
                      onClick={(e) => { e.stopPropagation(); openEditModal(card); }}
                    >
                      编辑
                    </button>
                    <button
                      type="button"
                      className="button button-danger"
                      onClick={(e) => { e.stopPropagation(); handleDeleteCard(card); }}
                    >
                      删除
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </section>

      {/* 卡片编辑 / 新建 Modal */}
      <Modal
        open={editorOpen}
        title={cardDraft.id ? '编辑卡片' : '新建卡片'}
        onClose={handleCloseEditor}
        wide
      >
        <CardEditor
          draft={cardDraft}
          onChange={setCardDraft}
          onSave={handleSave}
          onCancel={handleCloseEditor}
        />
      </Modal>
    </div>
  );
};
