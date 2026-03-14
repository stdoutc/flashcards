import React, { useMemo } from 'react';
import { Marked } from 'marked';
import katex from 'katex';

interface Props {
  content: string;
  className?: string;
}

// ── 创建独立 marked 实例，不影响全局 ────────────────────────────
const md = new Marked({ gfm: true, breaks: true });

// KaTeX 数学公式扩展
md.use({
  extensions: [
    // 块级公式 $$...$$
    {
      name: 'math_block',
      level: 'block',
      start(src: string) { return src.indexOf('$$'); },
      tokenizer(src: string) {
        const m = /^\$\$([\s\S]+?)\$\$/.exec(src);
        if (m) return { type: 'math_block', raw: m[0], math: m[1].trim() };
      },
      renderer(token) {
        try { return katex.renderToString((token as { math: string }).math, { displayMode: true, throwOnError: false }); }
        catch { return `<code>$$${(token as { math: string }).math}$$</code>`; }
      },
    },
    // 行内公式 $...$
    {
      name: 'math_inline',
      level: 'inline',
      start(src: string) { return src.indexOf('$'); },
      tokenizer(src: string) {
        const m = /^\$([^$\n]+?)\$/.exec(src);
        if (m) return { type: 'math_inline', raw: m[0], math: m[1].trim() };
      },
      renderer(token) {
        try { return katex.renderToString((token as { math: string }).math, { displayMode: false, throwOnError: false }); }
        catch { return `<code>$${(token as { math: string }).math}$</code>`; }
      },
    },
  ],
});

// 自定义图片渲染：解析 alt 文字中的 |宽度 后缀
md.use({
  renderer: {
    image({ href, text }: { href: string; text: string; title: string | null }) {
      const match = (text ?? '').match(/^(.*?)(?:\|(\d+%?))?$/);
      const alt = match?.[1] ?? '';
      const w = match?.[2];
      const widthStyle = w
        ? (w.endsWith('%') ? `width:${w};` : `width:${w}px;`)
        : '';
      return `<img src="${href}" alt="${alt}" style="max-width:100%;${widthStyle}border-radius:6px;display:block;margin:6px 0;" draggable="false">`;
    },
  },
});

export const CardRenderer: React.FC<Props> = ({ content, className }) => {
  if (!content) return null;
  const html = useMemo(() => md.parse(content) as string, [content]);
  return (
    <div
      className={`md-content ${className ?? ''}`.trim()}
      // marked 原生支持 HTML 直通，<img>、<br> 等均可正常渲染
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
};
