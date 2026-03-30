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

function getMasteryMeta(mastery: number): { label: string; cls: string } {
  const m = Math.max(0, Math.min(5, Math.floor(mastery || 0)));
  if (m >= 5) return { label: '精通', cls: 'is-mastered' };
  if (m >= 4) return { label: '掌握', cls: 'is-proficient' };
  if (m >= 3) return { label: '熟练', cls: 'is-learning' };
  if (m >= 2) return { label: '学习中', cls: 'is-beginner' };
  if (m >= 1) return { label: '初学', cls: 'is-beginner' };
  return { label: '未学习', cls: 'is-new' };
}

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
  // 当编辑器折叠显示内容（省略长图片链接）时，用于“删除提示”展示同一份省略编码
  onFoldedContentChange?: (id: string, foldedFront: string, foldedBack: string) => void;
}

// 长 URL 折叠阈值（超过此长度用占位符代替）
const LONG_URL_THRESHOLD = 80;
// 正则：匹配折叠占位符 img-xxxxxxxx
const IMG_REF_RE = /img-[a-z0-9]{8}/g;

function hash8Base36(input: string): string {
  // 生成稳定的 8 位 a-z0-9（确保占位符形如 img-xxxxxxxx）
  let h = 0;
  for (let i = 0; i < input.length; i++) {
    h = (h * 31 + input.charCodeAt(i)) >>> 0;
  }
  return h.toString(36).padStart(8, '0').slice(-8);
}

function foldLongImageUrlsInText(text: string): string {
  const foldMd = (match: string, alt: string, url: string) => {
    if (url.length <= LONG_URL_THRESHOLD) return match;
    const key = `img-${hash8Base36(url)}`;
    return `![${alt}](${key})`;
  };
  const foldHtml = (match: string, attrs: string, src: string) => {
    if (src.length <= LONG_URL_THRESHOLD) return match;
    const altMatch = attrs.match(/alt=["']([^"']*)["']/i);
    const alt = altMatch?.[1] ?? '';
    const key = `img-${hash8Base36(src)}`;
    return `![${alt}](${key})`;
  };

  // Markdown 图片：![alt](url)
  let result = text.replace(/!\[([^\]]*)\]\(([^)]+)\)/g, foldMd);
  // HTML 图片：<img ... src="...">
  result = result.replace(/<img\b([^>]*?)src="([^"]*)"[^>]*>/gi, foldHtml);
  result = result.replace(/<img\b([^>]*?)src='([^']*)'[^>]*>/gi, foldHtml);
  return result;
}

const CardEditor: React.FC<CardEditorProps> = ({
  draft,
  onChange,
  onSave,
  onCancel,
  onFoldedContentChange,
}) => {
  const [isCompactLayout, setIsCompactLayout] = useState(
    () => typeof window !== 'undefined' && window.matchMedia('(max-width: 860px)').matches,
  );
  const [previewOpen, setPreviewOpen] = useState(
    () => !(typeof window !== 'undefined' && window.matchMedia('(max-width: 860px)').matches),
  );
  const [activeField, setActiveField] = useState<'front' | 'back'>('front');

  // 图片链接插入状态
  const [imgPickerOpen, setImgPickerOpen] = useState(false);
  const [imgInsertMode, setImgInsertMode] = useState<'link' | 'local'>('link');
  const [imgLinkUrl, setImgLinkUrl] = useState('');
  const [imgLocalDataUrl, setImgLocalDataUrl] = useState('');
  const [imgAlt, setImgAlt] = useState('');
  const imgUrlRef = useRef<HTMLInputElement>(null);
  const imgFileRef = useRef<HTMLInputElement>(null);
  const [imgDropHover, setImgDropHover] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined') return undefined;
    const media = window.matchMedia('(max-width: 860px)');
    const applyLayout = (isCompact: boolean) => {
      setIsCompactLayout(isCompact);
      setPreviewOpen((prev) => (isCompact ? false : prev));
    };

    applyLayout(media.matches);
    const onChange = (event: MediaQueryListEvent) => applyLayout(event.matches);
    media.addEventListener('change', onChange);
    return () => media.removeEventListener('change', onChange);
  }, []);

  const handleLocalFileByFile = useCallback((file: File) => {
    setImgInsertMode('local');
    setImgLinkUrl('');
    const reader = new FileReader();
    reader.onload = () => {
      setImgLocalDataUrl(reader.result as string);
      // 图片描述两种方式共用：只有为空时才自动带入文件名
      const derivedAlt = file.name.replace(/\.[^.]+$/, '');
      setImgAlt((prev) => (prev ? prev : derivedAlt));
    };
    reader.readAsDataURL(file);
  }, []);

  // 读取本地图片为 base64，并填入 URL 输入框（长 URL 在插入时自动折叠）
  const handleLocalFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = '';
    setImgLocalDataUrl('');
    handleLocalFileByFile(file);
  };

  // 支持 Ctrl+V / Cmd+V 粘贴图片（仅在“插入图片”面板打开时启用）
  useEffect(() => {
    if (!imgPickerOpen) return;
    const handlePaste = (e: ClipboardEvent) => {
      const items = e.clipboardData?.items;
      if (!items) return;
      for (const item of Array.from(items)) {
        if (!item.type.startsWith('image/')) continue;
        const file = item.getAsFile();
        if (!file) continue;
        e.preventDefault();
        handleLocalFileByFile(file);
        break;
      }
    };
    window.addEventListener('paste', handlePaste);
    return () => window.removeEventListener('paste', handlePaste);
  }, [imgPickerOpen, handleLocalFileByFile]);

  // 长 URL 折叠缓存：ref（不需要触发渲染）
  const localImagesRef = useRef<Record<string, string>>({});
  // 展示用草稿（textarea 中显示，含短占位符）
  const [displayDraft, setDisplayDraft] = useState<CardDraft>(draft);

  // 将展示文本中的占位符展开为真实 URL
  const expand = useCallback((text: string) =>
    text.replace(IMG_REF_RE, (key) => localImagesRef.current[key] ?? key),
  []);

  // 为长字符串生成/复用折叠 key
  const getOrCreateKey = useCallback((longVal: string): string => {
    const key = `img-${hash8Base36(longVal)}`;
    if (!localImagesRef.current[key]) localImagesRef.current[key] = longVal;
    return key;
  }, []);

  // 将内容中所有长 URL 折叠为占位符（用于加载已有卡片时）
  const foldContent = useCallback((text: string): string => {
    // 折叠 Markdown 图片语法中的长 URL：![alt](longurl)
    let result = text.replace(/!\[([^\]]*)\]\(([^)]+)\)/g, (match, alt, url) => {
      if (url.length <= LONG_URL_THRESHOLD) return match;
      return `![${alt}](${getOrCreateKey(url)})`;
    });

    // 折叠 HTML <img> 标签中的长 src，同时转为 Markdown 语法统一显示风格（双引号/单引号均处理）
    const foldImgTag = (match: string, attrs: string, src: string): string => {
      if (src.length <= LONG_URL_THRESHOLD) return match;
      // 尝试从 alt 属性提取图片名
      const altMatch = attrs.match(/alt=["']([^"']*)["']/i);
      const alt = altMatch?.[1] ?? '';
      return `![${alt}](${getOrCreateKey(src)})`;
    };
    result = result.replace(/<img\b([^>]*?)src="([^"]*)"[^>]*>/gi,
      (match, attrs, src) => foldImgTag(match, attrs, src));
    result = result.replace(/<img\b([^>]*?)src='([^']*)'[^>]*>/gi,
      (match, attrs, src) => foldImgTag(match, attrs, src));

    return result;
  }, [getOrCreateKey]);

  // draft 变化时（新卡 vs 编辑卡切换）重置状态，并折叠已有长 URL
  const draftId = draft.id;
  useEffect(() => {
    setActiveField('front');
    setImgPickerOpen(false);
    localImagesRef.current = {};
    setDisplayDraft({
      ...draft,
      front: foldContent(draft.front),
      back: foldContent(draft.back),
    });
  }, [draftId]); // eslint-disable-line react-hooks/exhaustive-deps

  // 将“编辑器当前显示（省略后）”的内容同步给父组件，用于删除提示保持完全相同编码
  useEffect(() => {
    if (!draft.id || !onFoldedContentChange) return;
    onFoldedContentChange(draft.id, displayDraft.front, displayDraft.back);
  }, [draft.id, onFoldedContentChange, displayDraft.front, displayDraft.back]);

  // textarea 普通编辑：同步展示草稿，并把展开后的内容同步给父组件
  const handleFieldChange = useCallback((field: 'front' | 'back', value: string) => {
    setDisplayDraft((prev) => ({ ...prev, [field]: value }));
    onChange({ ...draft, [field]: expand(value) });
  }, [draft, onChange, expand]);

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
    const newDisplayVal = insertAtCursor(el, before, after, placeholder);
    setDisplayDraft((prev) => ({ ...prev, [field]: newDisplayVal }));
    onChange({ ...draft, [field]: expand(newDisplayVal) });
    setTimeout(() => el.focus(), 0);
  }, [draft, onChange, expand]);

  const openImgPicker = () => {
    setImgPickerOpen(true);
    setImgInsertMode('link');
    setImgLinkUrl('');
    setImgLocalDataUrl('');
    setImgAlt('');
    setImgDropHover(false);
    setTimeout(() => imgUrlRef.current?.focus(), 50);
  };

  const handleInsertImageUrl = () => {
    const url = (imgInsertMode === 'link' ? imgLinkUrl : imgLocalDataUrl).trim();
    if (!url) return;
    const alt = imgAlt.trim() || 'image';

    // 长 URL（base64 等）折叠为短占位符
    let displayUrl = url;
    if (url.length > LONG_URL_THRESHOLD) {
      const key = `img-${Math.random().toString(36).slice(2, 10)}`;
      localImagesRef.current[key] = url;
      displayUrl = key;
    }

    const displaySyntax = `![${alt}](${displayUrl})`;
    const realSyntax = `![${alt}](${url})`;

    const elId = activeField === 'front' ? 'modal-editor-front' : 'modal-editor-back';
    const el = document.getElementById(elId) as HTMLTextAreaElement | null;

    let newDisplayVal: string;
    let newRealVal: string;

    if (el) {
      // 用 display 文本的光标位置分割，再分别 expand 以正确映射到 real 文本坐标
      // （display 含短占位符，real 含完整 URL，两者长度差距悬殊，不能直接用同一偏移量）
      const dispBefore = displayDraft[activeField].slice(0, el.selectionStart);
      const dispAfter  = displayDraft[activeField].slice(el.selectionEnd);
      newDisplayVal = dispBefore + displaySyntax + dispAfter;
      newRealVal    = expand(dispBefore) + realSyntax + expand(dispAfter);
    } else {
      newDisplayVal = displayDraft[activeField] + displaySyntax;
      newRealVal    = expand(displayDraft[activeField]) + realSyntax;
    }

    setDisplayDraft((prev) => ({ ...prev, [activeField]: newDisplayVal }));
    onChange({ ...draft, [activeField]: newRealVal });
    setImgPickerOpen(false);
    setTimeout(() => el?.focus(), 0);
  };

  const canSave = draft.front.trim().length > 0 && draft.back.trim().length > 0;

  const tags = draft.tagsText
    ? draft.tagsText.split(',').map((t) => t.trim()).filter(Boolean)
    : [];

  return (
    <div className="card-editor-modal-layout">
      <div className="card-editor-modal-scroll">
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
            onClick={() => handleToolbar(activeField, '```\n', '\n```', '代码')}>{'```'}</button>
          <button type="button" className="button button-ghost md-tool" title="行内公式 $...$"
            onClick={() => handleToolbar(activeField, '$', '$', 'x^2')}>𝑓</button>
          <button type="button" className="button button-ghost md-tool" title="块级公式 $$...$$"
            onClick={() => handleToolbar(activeField, '$$\n', '\n$$', '\\int_0^\\infty')}>Σ</button>
          <span className="toolbar-divider" />
          <button
            type="button"
            className={`button button-ghost md-tool${imgPickerOpen ? ' active' : ''}`}
            title="插入图片"
            onClick={() => imgPickerOpen ? setImgPickerOpen(false) : openImgPicker()}
          >
            插入图片
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

        {/* 隐藏的本地文件输入 */}
        <input
          ref={imgFileRef}
          type="file"
          accept="image/*"
          style={{ display: 'none' }}
          onChange={handleLocalFile}
        />

        {/* 插入图片面板：链接 / 本地两种方式二选一 */}
        {imgPickerOpen && (
          <div className="img-size-picker">
            <div className="img-size-picker-header">
              <span className="img-size-picker-title">
                插入图片到「{activeField === 'front' ? '正面' : '反面'}」
              </span>
            </div>

            <div style={{ display: 'flex', gap: 12, marginTop: 10 }}>
              {/* 左：图片链接 */}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                  <span style={{ fontWeight: 600 }}>图片 URL</span>
                </div>

                <div className="img-size-picker-custom">
                  <span className="img-size-custom-label">图片 URL：</span>
                  <input
                    ref={imgUrlRef}
                    type="url"
                    className="input"
                    style={{ flex: 1, minWidth: 0 }}
                    placeholder="https://example.com/image.png"
                    value={imgLinkUrl}
                    onFocus={() => setImgInsertMode('link')}
                    disabled={imgInsertMode !== 'link'}
                    onChange={(e) => setImgLinkUrl(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleInsertImageUrl()}
                  />
                </div>
              </div>

              {/* 右：本地图片（支持拖拽） */}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div
                  className={`lab-dropzone${imgLocalDataUrl ? ' lab-dropzone--has-image' : ''}`}
                  onClick={() => {
                    setImgInsertMode('local');
                    setImgDropHover(false);
                    imgFileRef.current?.click();
                  }}
                  onDragEnter={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    setImgDropHover(true);
                    setImgInsertMode('local');
                  }}
                  onDragOver={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    setImgDropHover(true);
                    setImgInsertMode('local');
                  }}
                  onDragLeave={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    setImgDropHover(false);
                  }}
                  onDrop={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    setImgDropHover(false);
                    setImgInsertMode('local');
                    const file = e.dataTransfer.files?.[0];
                    if (file) handleLocalFileByFile(file);
                  }}
                >
                  {imgLocalDataUrl ? (
                    <img src={imgLocalDataUrl} alt="本地图片" className="lab-preview-img" />
                  ) : (
                    <div className="lab-dropzone-hint">
                      <span className="lab-dropzone-icon">🖼️</span>
                      <span>点击或拖拽图片到此处</span>
                      <span className="lab-dropzone-sub">支持 JPG / PNG / WEBP，以及 Ctrl+V 粘贴图片</span>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* 图片描述：链接 / 本地共用 */}
            <div className="img-size-picker-custom" style={{ marginTop: 12 }}>
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

            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 12 }}>
              <button type="button" className="button button-ghost img-size-cancel"
                onClick={() => { setImgPickerOpen(false); setImgDropHover(false); }}>取消</button>
              <button type="button" className="button button-primary"
                disabled={!((imgInsertMode === 'link' ? imgLinkUrl : imgLocalDataUrl).trim())} onClick={handleInsertImageUrl}>插入</button>
            </div>
          </div>
        )}

        {/* 编辑 + 实时预览分屏 */}
        <div
          className={`editor-split${previewOpen ? ' editor-split--with-preview' : ''}${isCompactLayout && previewOpen ? ' editor-split--preview-only' : ''}`}
        >
          {/* 左：编辑区 */}
          <div className="editor-split-main">
            <div className="field">
              <label className="label" htmlFor="modal-editor-front">
                正面<span className="label-sub">单词 / 问题 / 提示</span>
              </label>
              <textarea
                id="modal-editor-front"
                className={`textarea editor-textarea ${activeField === 'front' ? 'active-field' : ''}`}
                value={displayDraft.front}
                onChange={(e) => handleFieldChange('front', e.target.value)}
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
                value={displayDraft.back}
                onChange={(e) => handleFieldChange('back', e.target.value)}
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
                value={displayDraft.tagsText}
                onChange={(e) => { setDisplayDraft((p) => ({ ...p, tagsText: e.target.value })); onChange({ ...draft, tagsText: e.target.value }); }}
                placeholder="物理, 力学, 重要"
              />
            </div>

            {/* Markdown 语法速查（标签下方） */}
            <div className="editor-cheatsheet-wrap">
              <details className="md-cheatsheet">
                <summary>Markdown / LaTeX 语法速查</summary>
                <div className="md-cheatsheet-body">
                  <div className="cheat-row"><code>{'**粗体**'}</code><span>→ <strong>粗体</strong></span></div>
                  <div className="cheat-row"><code>{'*斜体*'}</code><span>→ <em>斜体</em></span></div>
                  <div className="cheat-row"><code>{'`行内代码`'}</code><span>→ 代码高亮</span></div>
                  <div className="cheat-row"><code>{'```语言 ... ```'}</code><span>→ 代码块</span></div>
                  <div className="cheat-row"><code>{'- item'}</code><span>→ 无序列表</span></div>
                  <div className="cheat-row"><code>{'1. item'}</code><span>→ 有序列表</span></div>
                  <div className="cheat-row"><code>{'$E=mc^2$'}</code><span>→ 行内公式</span></div>
                  <div className="cheat-row"><code>{'$$\\int_0^\\infty$$'}</code><span>→ 块级公式</span></div>
                  <div className="cheat-row"><code>{'\\frac{a}{b}'}</code><span>→ 分数</span></div>
                  <div className="cheat-row"><code>{'\\sqrt{x}'}</code><span>→ 根号</span></div>
                </div>
              </details>
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

      </div>

      {/* 底部按钮：始终固定在右下角（不随滚动区域变化） */}
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
    </div>
  );
};

// ── 主页面 ─────────────────────────────────────────────────────
export const CardEditPage: React.FC = () => {
  const { deckId } = useParams<{ deckId: string }>();
  const { state, selectDeck, createCard, updateCard, deleteCard, deleteCards, updateDeck } = useFlashcard();
  const cardDisplayMode = state.settings.cardDisplayMode ?? 'both';

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

  const foldedContentByCardIdRef = useRef<Record<string, { front: string; back: string }>>({});

  const filteredCards = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return cardsOfDeck;
    return cardsOfDeck.filter((c) => {
      const inContent = c.front.toLowerCase().includes(q) || c.back.toLowerCase().includes(q);
      const inTags = (c.tags ?? []).some((t) => t.toLowerCase().includes(q));
      return inContent || inTags;
    });
  }, [cardsOfDeck, searchQuery]);

  const masteredCount = cardsOfDeck.filter((c) => c.mastery >= 4).length;
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
    const cached = foldedContentByCardIdRef.current[card.id];
    const folded = cached ? cached.front : foldLongImageUrlsInText(card.front);
    if (!window.confirm(`确定删除该卡片？\n\n${folded}`)) return;
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
            const masteryMeta = getMasteryMeta(card.mastery);
            const masteryLv = Math.max(0, Math.min(5, Math.floor(card.mastery || 0)));
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
                  <div className="card-row-head">
                    <span className={`card-mastery-badge ${masteryMeta.cls}`}>
                      {masteryMeta.label} · Lv{masteryLv}
                    </span>
                  </div>
                  <div className="card-front">
                    <CardRenderer content={card.front} compact />
                  </div>
                {cardDisplayMode !== 'frontOnly' && (
                  <div className="card-back">
                    <CardRenderer content={card.back} compact />
                  </div>
                )}
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
          onFoldedContentChange={(id, foldedFront, foldedBack) => {
            foldedContentByCardIdRef.current[id] = { front: foldedFront, back: foldedBack };
          }}
        />
      </Modal>
    </div>
  );
};
