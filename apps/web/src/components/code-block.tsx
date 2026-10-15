import { CopyButton } from './copy-button';

interface CodeBlockProps {
  code: string;
  /** Shown in the title bar: a filename, a shell name or a short description. */
  label: string;
  className?: string;
}

function isComment(line: string): boolean {
  const trimmed = line.trimStart();
  return trimmed.startsWith('#') || trimmed.startsWith('//');
}

/** Dark code panel with a title bar and a copy button. Comment lines are dimmed. */
export function CodeBlock({ code, label, className = '' }: CodeBlockProps) {
  const lines = code.replace(/\n+$/, '').split('\n');

  return (
    <figure className={`min-w-0 overflow-hidden rounded-lg border border-code-line bg-code shadow-hard text-code-fg ${className}`}>
      <figcaption className="flex h-11 items-center justify-between gap-3 border-b border-code-line pr-1.5 pl-4">
        <span className="truncate font-mono text-xs text-code-muted">{label}</span>
        <CopyButton text={lines.join('\n')} />
      </figcaption>
      <pre className="overflow-x-auto p-5 font-mono text-[0.8125rem] leading-relaxed" tabIndex={0}>
        <code>
          {lines.map((line, index) => (
            <span key={index} className={isComment(line) ? 'text-code-muted' : undefined}>
              {line}
              {index < lines.length - 1 ? '\n' : ''}
            </span>
          ))}
        </code>
      </pre>
    </figure>
  );
}
