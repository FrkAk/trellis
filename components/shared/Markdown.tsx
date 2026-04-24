'use client';

import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeSanitize, { defaultSchema } from 'rehype-sanitize';

const schema = {
  ...defaultSchema,
  attributes: {
    ...defaultSchema.attributes,
    code: [...(defaultSchema.attributes?.code ?? []), 'className'],
    pre: [...(defaultSchema.attributes?.pre ?? []), 'className'],
    a: [...(defaultSchema.attributes?.a ?? []), 'target', 'rel'],
  },
};

export interface MarkdownProps {
  /** @param children - Markdown source text to render. */
  children: string;
  /** @param variant - Visual style: `chat` (informal, 1.65 line-height) or `spec` (dense, 1.5). Default `spec`. */
  variant?: 'chat' | 'spec';
  /** @param className - Additional classes appended to the prose wrapper. */
  className?: string;
}

/**
 * Shared markdown renderer with GFM support and XSS sanitization.
 * @param props - Markdown configuration.
 * @returns A prose-styled div wrapping sanitized, GFM-enabled markdown.
 */
export function Markdown({ children, variant = 'spec', className = '' }: MarkdownProps) {
  const variantClass = variant === 'chat' ? 'prose-chat' : 'prose-spec';
  const wrapperClass = className ? `${variantClass} ${className}` : variantClass;
  return (
    <div className={wrapperClass}>
      <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[[rehypeSanitize, schema]]}>
        {children}
      </ReactMarkdown>
    </div>
  );
}

export default Markdown;
