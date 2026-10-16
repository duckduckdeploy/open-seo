import { SquareCode } from 'lucide-react';

/**
 * Logos of the tools, services and AI assistants OpenSEO works with (public/brands, licences in
 * public/brands/LICENSE.md). `mono` logos are single-colour: drawn in `color`, or in the text colour
 * so they show in light and dark themes; the rest keep their own colours.
 */
const BRANDS = {
  github: { name: 'GitHub', mono: true },
  docker: { name: 'Docker', mono: true, color: '#2496ED' },
  postgresql: { name: 'PostgreSQL', mono: true, color: '#4169E1' },
  googlesearchconsole: { name: 'Google Search Console', mono: true, color: '#458CF5' },
  googleanalytics: { name: 'Google Analytics', mono: true, color: '#E37400' },
  mcp: { name: 'Model Context Protocol', mono: true },
  chatgpt: { name: 'ChatGPT', mono: true },
  claude: { name: 'Claude', mono: false },
  claudecode: { name: 'Claude Code', mono: false },
  codex: { name: 'Codex', mono: false },
  cursor: { name: 'Cursor', mono: true },
  geminicli: { name: 'Gemini CLI', mono: false },
  opencode: { name: 'OpenCode', mono: true },
  windsurf: { name: 'Windsurf', mono: true },
  gemini: { name: 'Gemini', mono: false },
  perplexity: { name: 'Perplexity', mono: false },
  grok: { name: 'Grok', mono: true },
  metaai: { name: 'Meta AI', mono: false },
  deepseek: { name: 'DeepSeek', mono: false },
} as const satisfies Record<string, { name: string; mono: boolean; color?: string }>;

export type Brand = keyof typeof BRANDS;

/** The logo of an agent client by its display name; VS Code has no free logo and gets a code icon. */
export const CLIENT_BRANDS: Record<string, Brand | null> = {
  ChatGPT: 'chatgpt',
  Claude: 'claude',
  'Claude Code': 'claudecode',
  Cursor: 'cursor',
  'VS Code': null,
  Codex: 'codex',
  'Gemini CLI': 'geminicli',
  OpenCode: 'opencode',
  Windsurf: 'windsurf',
};

/** The AI assistants the AI visibility tools ask, in the order the app offers them. */
export const ASSISTANT_BRANDS: Brand[] = ['chatgpt', 'gemini', 'claude', 'perplexity', 'grok', 'metaai', 'deepseek'];

export const brandName = (brand: Brand) => BRANDS[brand].name;

/** A logo, decorative by default: write the name next to it, or pass `label` when it stands alone. */
export function BrandIcon({ brand, className = 'size-4', label }: { brand: Brand | null; className?: string; label?: string }) {
  const a11y = label ? { role: 'img' as const, 'aria-label': label } : { 'aria-hidden': true as const };
  if (!brand) return <SquareCode className={`shrink-0 ${className}`} {...a11y} />;
  const info: { mono: boolean; color?: string } = BRANDS[brand];
  const src = `/brands/${brand}.svg`;
  if (info.mono) {
    const mask = `url(${src}) center / contain no-repeat`;
    return <span className={`inline-block shrink-0 ${className}`} style={{ mask, WebkitMask: mask, backgroundColor: info.color ?? 'currentColor' }} {...a11y} />;
  }
  // eslint-disable-next-line @next/next/no-img-element -- a tiny static logo
  return <img src={src} alt={label ?? ''} className={`inline-block shrink-0 ${className}`} {...(label ? {} : { 'aria-hidden': true })} />;
}

/** A row of logos with their names, e.g. the agents OpenSEO connects to. */
export function BrandRow({ items, className = '' }: { items: { brand: Brand | null; name: string }[]; className?: string }) {
  return (
    <ul className={`flex flex-wrap gap-2 ${className.includes('justify-') ? '' : 'justify-center'} ${className}`}>
      {items.map((item) => (
        <li key={item.name} className="inline-flex items-center gap-2 rounded-full border border-line bg-surface py-1.5 pr-3.5 pl-2.5 text-sm font-medium">
          <BrandIcon brand={item.brand} className="size-4" />
          {item.name}
        </li>
      ))}
    </ul>
  );
}
