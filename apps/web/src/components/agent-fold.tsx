import Link from 'next/link';
import { AGENT_CLIENTS, AGENT_SKILLS } from '@openseo/shared';
import { setupPrompt } from '@/content/snippets';
import { CopyPromptButton } from './copy-prompt-button';
import { SectionHeader } from './section';

type Line = { kind: 'prompt' | 'call' | 'out' | 'ok' | 'muted' | 'blank'; text: string };

// An example session: priced first, run under a limit, saved. Figures are illustrative.
const session: Line[] = [
  { kind: 'prompt', text: '› find keywords for emergency plumbing in austin, keep it under $0.20' },
  { kind: 'blank', text: '' },
  { kind: 'call', text: '⏺ openseo.keyword_ideas(keyword: "emergency plumber austin", dry_run: true)' },
  { kind: 'muted', text: '  price: up to $0.08 · a repeat within 7 days is free' },
  { kind: 'blank', text: '' },
  { kind: 'call', text: '⏺ openseo.keyword_ideas(…, maxDifficulty: 30, max_cost_usd: 0.20)' },
  { kind: 'out', text: '  keyword                        volume   kd' },
  { kind: 'out', text: '  emergency plumber austin        1,900   24' },
  { kind: 'out', text: '  24 hour plumber austin            880   19' },
  { kind: 'out', text: '  burst pipe repair austin          320   11' },
  { kind: 'blank', text: '' },
  { kind: 'call', text: '⏺ openseo.save_keywords(3, tags: ["topic:emergency"])' },
  { kind: 'ok', text: '✓ Saved 3 keywords. Spent $0.08 of your $0.20 limit.' },
];

const tone: Record<Line['kind'], string> = {
  prompt: 'text-code-fg font-semibold',
  call: 'text-[#8ab4ff]',
  out: 'text-code-fg',
  ok: 'text-[#4ade94]',
  muted: 'text-code-muted',
  blank: '',
};

export function AgentFold() {
  return (
    <section aria-labelledby="agents-title" className="container-page py-20 md:py-28 xl:py-32">
      <SectionHeader
        align="center"
        eyebrow="Agents and MCP"
        id="agents-title"
        title="Give your AI agent SEO skills"
        lede="Connect your agent in two minutes, then use ready-made skills or just ask. Every paid call shows its price first and stays under the limit you set."
      />

      <figure className="mx-auto mt-14 max-w-4xl md:mt-16">
        <div className="overflow-hidden rounded-xl border border-code-line bg-code shadow-hard-lg">
          <div className="flex items-center justify-between border-b border-code-line px-5 py-3 text-xs text-code-muted">
            <span className="flex gap-1.5" aria-hidden="true">
              <span className="size-2.5 rounded-full bg-code-line" />
              <span className="size-2.5 rounded-full bg-code-line" />
              <span className="size-2.5 rounded-full bg-code-line" />
            </span>
            <span>agent · openseo mcp</span>
          </div>
          <pre className="overflow-x-auto p-5 font-mono text-[0.75rem] leading-relaxed sm:p-7 sm:text-[0.875rem]" role="img" aria-label="Example agent session: the agent prices a keyword lookup first, runs it under a 20 cent limit, and saves three keywords, spending 8 cents.">
            {session.map((line, index) => (
              <span key={index} className={`block ${line.kind === 'out' ? '' : 'whitespace-pre-wrap break-words'} ${tone[line.kind]}`}>
                {line.text || ' '}
              </span>
            ))}
          </pre>
        </div>
        <figcaption className="mt-4 text-center text-sm text-faint">Example session with illustrative figures.</figcaption>
      </figure>

      <ul className="mx-auto mt-14 grid max-w-4xl grid-cols-1 gap-3 sm:grid-cols-2">
        {AGENT_SKILLS.map((skill) => (
          <li key={skill.name} className="rounded-md border border-line bg-surface px-5 py-4">
            <p className="font-mono text-sm font-semibold text-accent-text">/{skill.name}</p>
            <p className="mt-1.5 text-sm leading-relaxed text-muted">{skill.summary}</p>
          </li>
        ))}
      </ul>

      <div className="mx-auto mt-10 max-w-2xl text-center">
        <p className="text-[0.9375rem] text-muted">
          Works with <span className="text-ink">{AGENT_CLIENTS.slice(0, -1).join(', ')}</span> and <span className="text-ink">{AGENT_CLIENTS.at(-1)}</span>, and
          any client that connects to an MCP server.
        </p>
        <div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row sm:items-center">
          <CopyPromptButton text={setupPrompt} />
          <Link href="/docs/mcp" className="inline-flex h-12 items-center justify-center rounded-md border border-edge bg-surface px-6 font-medium transition-colors hover:border-faint hover:bg-sunken">
            Setup guide
          </Link>
        </div>
        <p className="mt-4 text-sm text-faint">Paste the prompt into your agent. It connects itself and checks the connection without spending anything.</p>
      </div>
    </section>
  );
}
