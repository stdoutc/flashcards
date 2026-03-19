import React, { useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useFlashcard } from '../context/FlashcardContext';

// ── 类型 ─────────────────────────────────────────────────────────────────────
interface DraftCard {
  id: string;
  front: string;
  back: string;
}

type Phase = 'upload' | 'loading' | 'review' | 'done';
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
- 术语、符号、公式尽量保持原意；公式可用 LaTeX
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

  // 修复 JSON 字符串值中的非法转义（如 LaTeX \frac \sum \\ 等）
  // 只处理字符串值内部的反斜杠，保留合法的 JSON 转义序列
  const fixEscapes = (s: string): string =>
    s.replace(/"((?:[^"\\]|\\[\s\S])*?)"/g, (_, inner: string) => {
      const fixed = inner.replace(/\\(?!["\\/bfnrtu])/g, '\\\\');
      return `"${fixed}"`;
    });

  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonStr);
  } catch {
    try {
      parsed = JSON.parse(fixEscapes(jsonStr));
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
  onChange: (id: string, field: 'front' | 'back', value: string) => void;
  onRemove: (id: string) => void;
}> = ({ card, index, onChange, onRemove }) => {
  const autoGrow = (el: HTMLTextAreaElement | null) => {
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${el.scrollHeight}px`;
  };

  return (
    <div className="lab-card">
      <div className="lab-card-header">
        <span className="lab-card-num">#{index + 1}</span>
        <span className="lab-card-front-preview">{card.front || '（未填写正面）'}</span>
        <div className="lab-card-actions">
          <button
            type="button"
            className="button button-danger lab-card-remove"
            onClick={() => onRemove(card.id)}
            title="删除此卡"
          >
            ✕
          </button>
        </div>
      </div>

      <div className="lab-card-body">
        <label className="lab-card-label">正面（问题）</label>
        <textarea
          className="textarea lab-card-textarea"
          value={card.front}
          rows={2}
          ref={autoGrow}
          onInput={(e) => autoGrow(e.currentTarget)}
          onChange={(e) => onChange(card.id, 'front', e.target.value)}
        />
        <label className="lab-card-label" style={{ marginTop: 8 }}>背面（答案）</label>
        <textarea
          className="textarea lab-card-textarea"
          value={card.back}
          rows={3}
          ref={autoGrow}
          onInput={(e) => autoGrow(e.currentTarget)}
          onChange={(e) => onChange(card.id, 'back', e.target.value)}
        />
      </div>
    </div>
  );
};

// ── 实验室页面主体 ────────────────────────────────────────────────────────────
export const LabPage: React.FC = () => {
  const { state, createCard } = useFlashcard();
  const settings = state.settings;

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

  // 完成状态
  const [importedCount, setImportedCount] = useState(0);

  // ── 图片选择 ──────────────────────────────────────────────────────────────
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = '';
    setImageFile(file);
    const reader = new FileReader();
    reader.onload = () => {
      setImageDataUrl(reader.result as string);
      setPhase('upload');
      setError(null);
    };
    reader.readAsDataURL(file);
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    const file = e.dataTransfer.files?.[0];
    if (!file || !file.type.startsWith('image/')) return;
    setImageFile(file);
    const reader = new FileReader();
    reader.onload = () => {
      setImageDataUrl(reader.result as string);
      setPhase('upload');
      setError(null);
    };
    reader.readAsDataURL(file);
  };

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
      const cards = await callDoubaoVision(settings.doubaoApiKey.trim(), model, imageDataUrl, prompt);
      if (cards.length === 0) throw new Error('AI 未识别到任何知识点，请尝试其他图片');
      setDraftCards(cards);
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

  const handleCardRemove = (id: string) => {
    setDraftCards((prev) => prev.filter((c) => c.id !== id));
  };

  // ── 导入卡组 ──────────────────────────────────────────────────────────────
  const handleImport = () => {
    const valid = draftCards.filter((c) => c.front.trim() && c.back.trim());
    if (!targetDeckId || valid.length === 0) return;
    valid.forEach((c) => {
      createCard(targetDeckId, {
        deckId: targetDeckId,
        cardType: 'basic',
        front: c.front.trim(),
        back: c.back.trim(),
        tags: [],
        mastery: 0,
        easeFactor: 2.5,
        interval: 24 * 60 * 60 * 1000,
        nextReview: null,
        lastReviewAt: null,
      });
    });
    setImportedCount(valid.length);
    setPhase('done');
  };

  // ── 重置 ──────────────────────────────────────────────────────────────────
  const handleReset = () => {
    setPhase('upload');
    setImageDataUrl(null);
    setImageFile(null);
    setDraftCards([]);
    setError(null);
    setImportedCount(0);
  };

  // ── 渲染 ──────────────────────────────────────────────────────────────────
  return (
    <div className="lab-page">
      <div className="lab-header">
        <h2 className="lab-title">🧪 实验室</h2>
        <p className="lab-subtitle">测试功能合集（当前开放：AI 图片识别制卡）</p>
      </div>

      {/* 完成状态 */}
      {phase === 'done' && (
        <div className="lab-done card-surface">
          <div className="lab-done-icon">✅</div>
          <p className="lab-done-text">
            已成功将 <strong>{importedCount}</strong> 张卡片导入「
            {state.decks.find((d) => d.id === targetDeckId)?.name ?? '所选卡组'}」
          </p>
          <div className="lab-done-actions">
            <Link to={`/deck/${targetDeckId}/cards`} className="button button-primary">
              查看卡组
            </Link>
            <button type="button" className="button button-ghost" onClick={handleReset}>
              继续测试
            </button>
          </div>
        </div>
      )}

      {/* 上传 + 识别区 */}
      {phase !== 'done' && (
        <div className="lab-main">
          {/* 左：测试功能（AI 图片识别制卡） */}
          <section className="lab-upload-section card-surface">
            <h3 className="lab-section-title">① 测试功能：AI 图片识别制卡</h3>

            <div
              className={`lab-dropzone ${imageDataUrl ? 'lab-dropzone--has-image' : ''}`}
              onClick={() => fileInputRef.current?.click()}
              onDrop={handleDrop}
              onDragOver={(e) => e.preventDefault()}
            >
              {imageDataUrl ? (
                <img src={imageDataUrl} alt={imageFile?.name ?? '预览'} className="lab-preview-img" />
              ) : (
                <div className="lab-dropzone-hint">
                  <span className="lab-dropzone-icon">🖼️</span>
                  <span>点击或拖拽图片到此处</span>
                  <span className="lab-dropzone-sub">支持 JPG / PNG / WEBP 等格式</span>
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

            <div className="lab-mode-picker">
              <span className="lab-mode-label">识别模式</span>
              <div className="lab-mode-buttons">
                <button
                  type="button"
                  className={`button button-ghost lab-mode-btn ${promptMode === 'fast' ? 'active' : ''}`}
                  onClick={() => setPromptMode('fast')}
                  disabled={phase === 'loading'}
                  title="更快返回，适合快速预览"
                >
                  快速模式
                </button>
                <button
                  type="button"
                  className={`button button-ghost lab-mode-btn ${promptMode === 'accurate' ? 'active' : ''}`}
                  onClick={() => setPromptMode('accurate')}
                  disabled={phase === 'loading'}
                  title="规则更完整，结果更细致"
                >
                  精确模式
                </button>
              </div>
              <span className="lab-mode-hint">
                {promptMode === 'fast'
                  ? '优先速度：提示词更短，默认输出更精简'
                  : '优先质量：提示词更完整，输出更细致'}
              </span>
            </div>

            <button
              type="button"
              className="button button-primary lab-recognize-btn"
              disabled={!imageDataUrl || phase === 'loading'}
              onClick={handleRecognize}
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
            <section className="lab-review-section card-surface">
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
                    onChange={handleCardChange}
                    onRemove={handleCardRemove}
                  />
                ))}
              </div>

              <div className="lab-import-bar">
                <select
                  className="input lab-deck-select"
                  value={targetDeckId}
                  onChange={(e) => setTargetDeckId(e.target.value)}
                >
                  {state.decks.length === 0 && (
                    <option value="">— 暂无卡组，请先新建 —</option>
                  )}
                  {state.decks.map((d) => (
                    <option key={d.id} value={d.id}>{d.name}</option>
                  ))}
                </select>
                <button
                  type="button"
                  className="button button-primary"
                  disabled={draftCards.length === 0 || !targetDeckId}
                  onClick={handleImport}
                >
                  导入卡组
                </button>
              </div>
            </section>
          )}
        </div>
      )}
    </div>
  );
};
