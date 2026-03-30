import React, { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { CardRenderer, normalizeLatexDelimiters } from '../components/CardRenderer';
import { useFlashcard } from '../context/FlashcardContext';
import { shrinkImageDataUrl } from '../utils/shrinkImageDataUrl';

// ── 类型 ─────────────────────────────────────────────────────────────────────
interface DraftCard {
  id: string;
  front: string;
  back: string;
}

type Phase = 'upload' | 'loading' | 'review';
type PromptMode = 'fast' | 'accurate';

// ── 豆包 API 调用 ────────────────────────────────────────────────────────────
const ACCURATE_PROMPT = `你是一位专业的教育助手。请先完成“内容类型判断”，再按对应策略制卡。

【第 1 步：判断类型】
先判断图片主体更接近以下哪一类：
1) 题目类：如选择题、填空题、简答题、计算题、编程题、真题截图、练习题讲解页
2) 知识点类：如概念定义、公式定理、知识总结、课堂笔记、思维导图、教材段落

【第 2 步：按类型制卡】
A. 若是“题目类”：
- 优先抽取“题干 + 关键条件/选项”作为 front（尽量完整但简洁）
- 若存在选项，必须“另起一行、一行一个”展示，不得把多个选项写在同一行。
- 选项建议使用如下格式：
  A. ...
  B. ...
  C. ...
  D. ...
- back 给出：正确答案 + 简明解析 + 易错点/考点
- 如果图片有多道题，可生成多张卡；每题至少 1 张

B. 若是“知识点类”：
- 先提炼核心知识点，再转为“问答式记忆卡”
- front 用提问句（定义是什么/如何判断/适用条件/推导结论等）
- back 给出结构化答案（可用要点列表、公式、简短示例）

【通用要求】
- 仅输出高质量学习卡，去除无关噪音（页码、水印、装饰）
- 术语、符号、公式尽量保持原意；公式须以 KaTeX 可解析的 LaTeX 编写（本应用使用 KaTeX 渲染）
- 每张卡包含：
  - front：正面提问，简洁精准（一句话优先）
  - back：背面答案，可包含解释、公式、要点列表（支持 Markdown）

请直接以 JSON 数组输出，格式如下（不要有任何多余文字）：
[
  {"front": "问题1", "back": "答案1"},
  {"front": "问题2", "back": "答案2"}
]`;

// 快速模式：沿用最初简洁提示词，仅增加“题目/知识点判断与处理”
const FAST_PROMPT = `你是一位专业的教育助手。请先判断图片内容是“题目类”还是“知识点类”，再生成闪卡。

处理规则：
- 若是题目类（如选择题）：front 以题干为主；若有选项，选项另起一行且一行一个。back 给出正确答案和简明解析。
- 若是知识点类：提取关键知识点并转为问答式闪卡。

每张闪卡包含：
- front：正面提问，简洁精准（一句话）
- back：背面答案，可包含解释、公式、要点列表（支持 Markdown）
- 公式须以 KaTeX 可解析的 LaTeX 编写（本应用使用 KaTeX 渲染）

请直接以 JSON 数组输出，格式如下（不要有任何多余文字）：
[
  {"front": "问题1", "back": "答案1"},
  {"front": "问题2", "back": "答案2"}
]`;

async function callDoubaoVision(
  apiKey: string,
  model: string,
  imageDataUrl: string,
  prompt: string,
): Promise<DraftCard[]> {
  const resp = await fetch('https://ark.cn-beijing.volces.com/api/v3/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      messages: [
        {
          role: 'user',
          content: [
            { type: 'image_url', image_url: { url: imageDataUrl } },
            { type: 'text', text: prompt },
          ],
        },
      ],
    }),
  });

  if (!resp.ok) {
    const err = await resp.text().catch(() => resp.statusText);
    throw new Error(`API 请求失败（${resp.status}）：${err}`);
  }

  const data = await resp.json();
  const raw: string = data.choices?.[0]?.message?.content ?? '';

  // 从 AI 输出中提取 JSON 数组（兼容带 ```json 代码块的情况）
  let jsonStr = raw
    .replace(/```(?:json)?\s*/gi, '')
    .replace(/```/g, '')
    .trim();

  // 提取第一个 [ ... ] 区间，防止 AI 在数组前后输出多余文字
  const arrStart = jsonStr.indexOf('[');
  const arrEnd   = jsonStr.lastIndexOf(']');
  if (arrStart !== -1 && arrEnd > arrStart) {
    jsonStr = jsonStr.slice(arrStart, arrEnd + 1);
  }

  // 在字符串内部修复常见非法 JSON 内容：
  // 1) LaTeX 等导致的非法反斜杠转义（\frac / \( / \sum）
  // 2) 原始换行、回车、制表符等控制字符
  const sanitizeJsonStringContent = (s: string): string => {
    let out = '';
    let inString = false;
    let escaped = false;

    for (let i = 0; i < s.length; i += 1) {
      const ch = s[i];

      if (!inString) {
        out += ch;
        if (ch === '"') inString = true;
        continue;
      }

      if (escaped) {
        const isUnicodeStart = ch === 'u';
        const isSimpleValidEscape = /["\\/]/.test(ch);
        const isControlEscape = /[bfnrt]/.test(ch);
        const next = s[i + 1] ?? '';
        // \begin \frac \theta \neq 等 LaTeX 指令会以 b/f/t/n/r 开头，需保留反斜杠
        const looksLikeLatexCommand = isControlEscape && /[a-zA-Z]/.test(next);
        const isValidEscape = isSimpleValidEscape || isUnicodeStart || (isControlEscape && !looksLikeLatexCommand);

        if (isValidEscape) {
          out += ch;
        } else {
          // 前一个反斜杠是非法转义起点，把它转义成普通字符
          out += `\\${ch}`;
        }
        escaped = false;
        continue;
      }

      if (ch === '\\') {
        out += ch;
        escaped = true;
        continue;
      }

      if (ch === '"') {
        out += ch;
        inString = false;
        continue;
      }

      if (ch === '\n') {
        out += '\\n';
        continue;
      }
      if (ch === '\r') {
        out += '\\r';
        continue;
      }
      if (ch === '\t') {
        out += '\\t';
        continue;
      }

      const code = ch.charCodeAt(0);
      if (code < 0x20) {
        out += `\\u${code.toString(16).padStart(4, '0')}`;
        continue;
      }

      out += ch;
    }

    // 末尾孤立反斜杠，补一个反斜杠避免 JSON 崩溃
    if (escaped) out += '\\';
    return out;
  };

  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonStr);
  } catch {
    try {
      parsed = JSON.parse(sanitizeJsonStringContent(jsonStr));
    } catch (e2) {
      throw new Error(`AI 返回内容无法解析为 JSON，请重试。\n原始内容：${jsonStr.slice(0, 200)}`);
    }
  }

  if (!Array.isArray(parsed)) throw new Error('AI 返回格式不正确，请重试');

  return parsed
    .filter((item: unknown) =>
      item && typeof item === 'object' &&
      'front' in (item as object) && 'back' in (item as object),
    )
    .map((item: { front: string; back: string }) => ({
      id: Math.random().toString(36).slice(2, 10),
      front: String(item.front).trim(),
      back: String(item.back).trim(),
    }));
}

// ── 单张可编辑卡片 ────────────────────────────────────────────────────────────
const DraftCardItem: React.FC<{
  card: DraftCard;
  index: number;
  batchSelect: boolean;
  selected: boolean;
  onToggleSelect: (id: string) => void;
  onChange: (id: string, field: 'front' | 'back', value: string) => void;
}> = ({ card, index, batchSelect, selected, onToggleSelect, onChange }) => {
  const [editing, setEditing] = useState(false);
  const frontTaRef = useRef<HTMLTextAreaElement>(null);
  const backTaRef = useRef<HTMLTextAreaElement>(null);

  const autoGrow = (el: HTMLTextAreaElement | null) => {
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${el.scrollHeight}px`;
  };

  useEffect(() => {
    if (!editing) return;
    const id = requestAnimationFrame(() => {
      autoGrow(frontTaRef.current);
      autoGrow(backTaRef.current);
    });
    return () => cancelAnimationFrame(id);
  }, [editing]);

  return (
    <div className="lab-card">
      <div className="lab-card-header">
        {batchSelect && (
          <label className="lab-card-select-hit">
            <input
              type="checkbox"
              className="lab-card-select-cb"
              checked={selected}
              onChange={() => onToggleSelect(card.id)}
              aria-label={`选择第 ${index + 1} 张卡片`}
            />
          </label>
        )}
        <span className="lab-card-num">#{index + 1}</span>
        <div className="lab-card-actions">
          <button
            type="button"
            className="button button-ghost lab-card-edit-btn"
            onClick={() => setEditing((v) => !v)}
          >
            {editing ? '完成' : '编辑'}
          </button>
        </div>
      </div>

      <div className="lab-card-body">
        {editing ? (
          <>
            <label className="lab-card-label">正面（问题）</label>
            <textarea
              ref={frontTaRef}
              className="textarea lab-card-textarea"
              value={card.front}
              rows={2}
              onInput={(e) => autoGrow(e.currentTarget)}
              onChange={(e) => onChange(card.id, 'front', e.target.value)}
            />
            <label className="lab-card-label" style={{ marginTop: 8 }}>背面（答案）</label>
            <textarea
              ref={backTaRef}
              className="textarea lab-card-textarea"
              value={card.back}
              rows={3}
              onInput={(e) => autoGrow(e.currentTarget)}
              onChange={(e) => onChange(card.id, 'back', e.target.value)}
            />
          </>
        ) : (
          <>
            <label className="lab-card-label">正面（问题）</label>
            <div className="lab-card-md-preview">
              {card.front.trim() ? (
                <CardRenderer content={card.front} />
              ) : (
                <span className="lab-card-front-placeholder">（未填写正面）</span>
              )}
            </div>
            <label className="lab-card-label" style={{ marginTop: 8 }}>背面（答案）</label>
            <div className="lab-card-md-preview">
              {card.back.trim() ? (
                <CardRenderer content={card.back} />
              ) : (
                <span className="lab-card-front-placeholder">（未填写背面）</span>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
};

// ── 实验室页面主体 ────────────────────────────────────────────────────────────
export const LabPage: React.FC = () => {
  const { state, createCard } = useFlashcard();
  const settings = state.settings;
  const [helpOpen, setHelpOpen] = useState(false);
  const [helpStep, setHelpStep] = useState(0);

  // 阶段控制
  const [phase, setPhase] = useState<Phase>('upload');
  const [error, setError] = useState<string | null>(null);

  // 图片
  const [imageDataUrl, setImageDataUrl] = useState<string | null>(null);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // AI 生成的草稿卡片
  const [draftCards, setDraftCards] = useState<DraftCard[]>([]);

  // 目标卡组
  const [targetDeckId, setTargetDeckId] = useState<string>(
    state.decks[0]?.id ?? '',
  );
  const [promptMode, setPromptMode] = useState<PromptMode>('fast');

  /** 审核阶段：批量勾选后仅导入选中项；关闭时导入全部有效卡片 */
  const [batchSelectMode, setBatchSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set());
  const [importToast, setImportToast] = useState<string | null>(null);

  useEffect(() => {
    if (!importToast) return;
    const t = window.setTimeout(() => setImportToast(null), 4200);
    return () => window.clearTimeout(t);
  }, [importToast]);

  // ── 图片选择 ──────────────────────────────────────────────────────────────
  const loadImageFile = (file: File) => {
    setImageFile(file);
    const reader = new FileReader();
    reader.onload = () => {
      setImageDataUrl(reader.result as string);
      setPhase('upload');
      setError(null);
    };
    reader.readAsDataURL(file);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = '';
    loadImageFile(file);
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    const file = e.dataTransfer.files?.[0];
    if (!file || !file.type.startsWith('image/')) return;
    loadImageFile(file);
  };

  // 支持 Ctrl+V / Cmd+V 粘贴图片
  useEffect(() => {
    const handlePaste = (e: ClipboardEvent) => {
      const items = e.clipboardData?.items;
      if (!items || items.length === 0) return;
      for (const item of Array.from(items)) {
        if (!item.type.startsWith('image/')) continue;
        const file = item.getAsFile();
        if (!file) continue;
        e.preventDefault();
        loadImageFile(file);
        break;
      }
    };
    window.addEventListener('paste', handlePaste);
    return () => window.removeEventListener('paste', handlePaste);
  }, []);

  // ── AI 识别 ────────────────────────────────────────────────────────────────
  const handleRecognize = async () => {
    if (!imageDataUrl) return;
    if (!settings.doubaoApiKey?.trim()) {
      setError('请先在「设置 → AI 智能识别」中填写豆包 API Key。');
      return;
    }
    const model = settings.doubaoModel?.trim() || 'doubao-1-5-vision-pro-32k-250115';
    const prompt = promptMode === 'fast' ? FAST_PROMPT : ACCURATE_PROMPT;
    setPhase('loading');
    setError(null);
    try {
      const urlForApi =
        promptMode === 'fast'
          ? await shrinkImageDataUrl(imageDataUrl, { maxLongEdge: 1280, jpegQuality: 0.82 })
          : imageDataUrl;
      const cards = await callDoubaoVision(settings.doubaoApiKey.trim(), model, urlForApi, prompt);
      if (cards.length === 0) throw new Error('AI 未识别到任何知识点，请尝试其他图片');
      setDraftCards(
        cards.map((c) => ({
          ...c,
          front: normalizeLatexDelimiters(c.front),
          back: normalizeLatexDelimiters(c.back),
        })),
      );
      setBatchSelectMode(false);
      setSelectedIds(new Set());
      setPhase('review');
      if (!targetDeckId && state.decks.length > 0) {
        setTargetDeckId(state.decks[0].id);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setPhase('upload');
    }
  };

  // ── 卡片编辑 ──────────────────────────────────────────────────────────────
  const handleCardChange = (id: string, field: 'front' | 'back', value: string) => {
    setDraftCards((prev) =>
      prev.map((c) => (c.id === id ? { ...c, [field]: value } : c)),
    );
  };

  const handleToggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleImport = () => {
    const deckName = state.decks.find((d) => d.id === targetDeckId)?.name ?? '所选卡组';
    if (!targetDeckId) {
      setImportToast('请先选择目标卡组');
      return;
    }
    let pool: DraftCard[];
    if (batchSelectMode) {
      if (selectedIds.size === 0) {
        setImportToast('请勾选要导入的卡片');
        return;
      }
      pool = draftCards.filter((c) => selectedIds.has(c.id));
    } else {
      pool = draftCards;
    }
    const valid = pool.filter((c) => c.front.trim() && c.back.trim());
    if (valid.length === 0) {
      setImportToast('没有可导入的卡片（请填写正反面）');
      return;
    }
    valid.forEach((c) => {
      createCard(targetDeckId, {
        deckId: targetDeckId,
        cardType: 'basic',
        front: c.front.trim(),
        back: c.back.trim(),
        tags: [],
        mastery: 0,
        reps: 0,
        easeFactor: 2.5,
        interval: 24 * 60 * 60 * 1000,
        nextReview: null,
        lastReviewAt: null,
      });
    });
    const imported = new Set(valid.map((c) => c.id));
    setDraftCards((prev) => prev.filter((c) => !imported.has(c.id)));
    setSelectedIds((prev) => {
      const next = new Set(prev);
      imported.forEach((id) => next.delete(id));
      return next;
    });
    setImportToast(`已导入 ${valid.length} 张到「${deckName}」`);
  };

  // ── 重置 ──────────────────────────────────────────────────────────────────
  const handleReset = () => {
    setPhase('upload');
    setImageDataUrl(null);
    setImageFile(null);
    setDraftCards([]);
    setError(null);
    setBatchSelectMode(false);
    setSelectedIds(new Set());
    setImportToast(null);
  };

  // ── 渲染 ──────────────────────────────────────────────────────────────────
  const helpSteps = [
    { title: '上传/粘贴图片', desc: '点击上传、拖拽图片，或直接 Ctrl+V 粘贴截图。' },
    { title: '选择识别模式', desc: '先选“快速模式”或“精确模式”。' },
    { title: '运行 AI 识别', desc: '点击“运行此测试功能”开始识别。' },
    { title: '审核卡片', desc: '先检查并编辑识别出的正反面内容。' },
    { title: '导入卡组', desc: '确认无误后，在页面底部固定工具栏选择卡组并点击「导入到卡组」。' },
  ];

  const openHelpGuide = () => {
    setHelpStep(0);
    setHelpOpen(true);
  };

  const closeHelpGuide = () => setHelpOpen(false);
  const isStep = (idx: number) => helpOpen && helpStep === idx;
  const advanceGuideOnTarget = (idx: number) => {
    if (!helpOpen || helpStep !== idx) return false;
    if (helpStep >= helpSteps.length - 1) closeHelpGuide();
    else setHelpStep((s) => s + 1);
    return true;
  };

  const importDisabled =
    !targetDeckId ||
    draftCards.length === 0 ||
    (batchSelectMode && selectedIds.size === 0);

  return (
    <div className={`lab-page${phase === 'review' ? ' lab-page--ai-toolbar' : ''}`}>
      {helpOpen && <div className="lab-guide-backdrop" aria-hidden />}

      <div className="lab-header">
        <div className="lab-header-row">
          <h2 className="lab-title">🧪 实验室</h2>
          <button
            type="button"
            className="button button-ghost lab-help-btn"
            onClick={() => (helpOpen ? closeHelpGuide() : openHelpGuide())}
          >
            {helpOpen ? '收起帮助' : '使用帮助'}
          </button>
        </div>
        <p className="lab-subtitle">测试功能合集（当前开放：AI 图片识别制卡）</p>
      </div>

      {helpOpen && (
        <section className="lab-help card-surface lab-guide-panel">
          <h3 className="lab-section-title">
            引导步骤 {helpStep + 1}/{helpSteps.length}：{helpSteps[helpStep].title}
          </h3>
          <p className="lab-guide-desc">{helpSteps[helpStep].desc}</p>
          <div className="lab-guide-actions">
            <button
              type="button"
              className="button button-ghost"
              onClick={() => setHelpStep((s) => Math.max(0, s - 1))}
              disabled={helpStep === 0}
            >
              上一步
            </button>
            <button
              type="button"
              className="button button-primary"
              onClick={() => {
                if (helpStep >= helpSteps.length - 1) closeHelpGuide();
                else setHelpStep((s) => s + 1);
              }}
            >
              {helpStep >= helpSteps.length - 1 ? '完成' : '下一步'}
            </button>
          </div>
        </section>
      )}
      {helpOpen && isStep(4) && (
        <div className="lab-guide-fixed-arrow" aria-hidden>
          <div className="lab-guide-fixed-text">请在页面底部固定栏点击「导入到卡组」</div>
          <div className="lab-guide-fixed-icon">⬇</div>
        </div>
      )}

      {/* 上传 + 识别区 */}
      <div className="lab-main">
          {/* 左：测试功能（AI 图片识别制卡） */}
          <section className="lab-upload-section card-surface">
            <h3 className="lab-section-title">① 测试功能：AI 图片识别制卡</h3>

            <div
              className={`lab-dropzone ${imageDataUrl ? 'lab-dropzone--has-image' : ''} ${isStep(0) ? 'lab-guide-focus' : ''}`}
              onClick={() => {
                if (advanceGuideOnTarget(0)) return;
                fileInputRef.current?.click();
              }}
              onDrop={handleDrop}
              onDragOver={(e) => e.preventDefault()}
            >
              {imageDataUrl ? (
                <img src={imageDataUrl} alt={imageFile?.name ?? '预览'} className="lab-preview-img" />
              ) : (
                <div className="lab-dropzone-hint">
                  <span className="lab-dropzone-icon">🖼️</span>
                  <span>点击或拖拽图片到此处</span>
                  <span className="lab-dropzone-sub">支持 JPG / PNG / WEBP，以及 Ctrl+V 粘贴图片</span>
                </div>
              )}
            </div>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              style={{ display: 'none' }}
              onChange={handleFileChange}
            />

            {imageDataUrl && (
              <button
                type="button"
                className="button button-ghost lab-change-btn"
                onClick={() => fileInputRef.current?.click()}
              >
                更换图片
              </button>
            )}

            {error && <p className="lab-error">{error}</p>}

            <div
              className={`lab-mode-picker ${isStep(1) ? 'lab-guide-focus' : ''}`}
              onClick={() => { advanceGuideOnTarget(1); }}
            >
              <span className="lab-mode-label">识别模式</span>
              <div className="lab-mode-buttons">
                <button
                  type="button"
                  className={`button button-ghost lab-mode-btn ${promptMode === 'fast' ? 'active' : ''}`}
                  onClick={(e) => {
                    e.stopPropagation();
                    setPromptMode('fast');
                  }}
                  disabled={phase === 'loading'}
                  title="更快返回，适合快速预览"
                >
                  快速模式
                </button>
                <button
                  type="button"
                  className={`button button-ghost lab-mode-btn ${promptMode === 'accurate' ? 'active' : ''}`}
                  onClick={(e) => {
                    e.stopPropagation();
                    setPromptMode('accurate');
                  }}
                  disabled={phase === 'loading'}
                  title="规则更完整，结果更细致"
                >
                  精确模式
                </button>
              </div>
              <span className="lab-mode-hint">
                {promptMode === 'fast'
                  ? '优先速度：提示词更短；上传前会将图片缩至长边约 1280px 并以 JPEG 压缩以加快识别'
                  : '优先质量：提示词更完整，输出更细致（原图上传）'}
              </span>
            </div>

            <button
              type="button"
              className={`button button-primary lab-recognize-btn ${isStep(2) ? 'lab-guide-focus' : ''}`}
              disabled={!imageDataUrl || phase === 'loading'}
              onClick={() => {
                if (advanceGuideOnTarget(2)) return;
                handleRecognize();
              }}
            >
              {phase === 'loading' ? (
                <><span className="lab-spinner" />AI 处理中…</>
              ) : '✨ 运行此测试功能'}
            </button>

            {!settings.doubaoApiKey && (
              <p className="lab-hint">
                未配置 API Key，请先前往{' '}
                <Link to="/settings" className="setting-link">设置</Link>{' '}
                填写豆包 API Key。
              </p>
            )}
          </section>

          {/* 右：测试结果预览与导入 */}
          {phase === 'review' && (
            <section
              className={`lab-review-section card-surface ${isStep(3) ? 'lab-guide-focus' : ''}`}
              onClick={() => { advanceGuideOnTarget(3); }}
            >
              <div className="lab-review-header">
                <h3 className="lab-section-title">② 审核卡片（{draftCards.length} 张）</h3>
                <button
                  type="button"
                  className="button button-ghost"
                  style={{ fontSize: '0.8rem' }}
                  onClick={() => setDraftCards((prev) => [
                    ...prev,
                    { id: Math.random().toString(36).slice(2, 10), front: '', back: '' },
                  ])}
                >
                  ＋ 手动添加
                </button>
              </div>

              <div className="lab-cards-list">
                {draftCards.length === 0 && (
                  <p className="hint">已删除全部卡片，可手动添加或重新识别。</p>
                )}
                {draftCards.map((card, i) => (
                  <DraftCardItem
                    key={card.id}
                    card={card}
                    index={i}
                    batchSelect={batchSelectMode}
                    selected={selectedIds.has(card.id)}
                    onToggleSelect={handleToggleSelect}
                    onChange={handleCardChange}
                  />
                ))}
              </div>
            </section>
          )}
        </div>

      {phase === 'review' && (
        <>
          {importToast && (
            <div className="lab-import-toast" role="status">
              {importToast}
            </div>
          )}
          <div className="lab-ai-toolbar">
            <div className="lab-ai-toolbar-inner">
              <button
                type="button"
                className={`button button-ghost lab-ai-toolbar-btn${batchSelectMode ? ' active' : ''}`}
                onClick={() => {
                  setBatchSelectMode((prev) => {
                    if (prev) setSelectedIds(new Set());
                    return !prev;
                  });
                }}
                title={batchSelectMode ? '关闭后，导入将包含全部有效卡片' : '开启后仅导入选中的卡片'}
              >
                {batchSelectMode ? '✓ 批量选择中' : '批量选择'}
              </button>
              {batchSelectMode && (
                <>
                  <button
                    type="button"
                    className="button button-ghost lab-ai-toolbar-btn"
                    onClick={() => setSelectedIds(new Set(draftCards.map((c) => c.id)))}
                    disabled={draftCards.length === 0}
                  >
                    全选
                  </button>
                  <button
                    type="button"
                    className="button button-ghost lab-ai-toolbar-btn"
                    onClick={() => setSelectedIds(new Set())}
                    disabled={selectedIds.size === 0}
                  >
                    取消全选
                  </button>
                  <span className="lab-ai-toolbar-meta">
                    已选 {selectedIds.size} / {draftCards.length}
                  </span>
                </>
              )}
              <label className="lab-ai-toolbar-deck-label">
                <span className="lab-ai-toolbar-deck-text">导入到</span>
                <select
                  className="input lab-deck-select lab-ai-toolbar-select"
                  value={targetDeckId}
                  onChange={(e) => setTargetDeckId(e.target.value)}
                >
                  {state.decks.length === 0 && (
                    <option value="">— 暂无卡组 —</option>
                  )}
                  {state.decks.map((d) => (
                    <option key={d.id} value={d.id}>{d.name}</option>
                  ))}
                </select>
              </label>
              <button
                type="button"
                className={`button button-primary lab-ai-toolbar-import${isStep(4) ? ' lab-guide-focus' : ''}`}
                disabled={importDisabled}
                onClick={() => {
                  if (advanceGuideOnTarget(4)) return;
                  handleImport();
                }}
              >
                导入到卡组
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
};
