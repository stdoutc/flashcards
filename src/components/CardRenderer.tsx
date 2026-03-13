import React from 'react';
import ReactMarkdown from 'react-markdown';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import rehypeRaw from 'rehype-raw';
import type { Components } from 'react-markdown';

interface Props {
  content: string;
  className?: string;
}

// 自定义 img 渲染：加响应式样式，支持 width 属性控制大小
const components: Components = {
  img({ src, alt, width, ...rest }) {
    const w = width ? String(width) : undefined;
    return (
      <img
        src={src}
        alt={alt ?? ''}
        style={{
          maxWidth: '100%',
          width: w ? (String(w).endsWith('%') ? w : `${w}px`) : undefined,
          borderRadius: 6,
          display: 'block',
          margin: '6px 0',
        }}
        draggable={false}
        {...(rest as React.ImgHTMLAttributes<HTMLImageElement>)}
      />
    );
  },
};

export const CardRenderer: React.FC<Props> = ({ content, className }) => {
  if (!content) return null;
  return (
    <div className={`md-content ${className ?? ''}`.trim()}>
      <ReactMarkdown
        remarkPlugins={[remarkMath]}
        rehypePlugins={[rehypeKatex, rehypeRaw]}
        components={components}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
};
