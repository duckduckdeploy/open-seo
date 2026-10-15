'use client';

import { useState } from 'react';
import type { ToolSlug } from '@/content/tools';
import { CountrySelect, Figures, inputClass, Label, n, ResultTable, SubmitButton, ToolStatus } from './tool-ui';
import { SerpSimulator } from './serp-simulator';
import { useTool } from './use-tool';

const formClass = 'grid gap-4 rounded-lg border border-line bg-surface p-6 shadow-hard-sm sm:p-7 sm:grid-cols-[1fr_14rem_auto] sm:items-end';
const ext = 'underline decoration-line underline-offset-2 hover:decoration-ink break-all';

function KeywordGenerator() {
  const tool = useTool<{ keywords: { keyword: string; volume: number | null; difficulty: number | null; cpc: number | null; intent: string | null }[] }>('keyword-generator');
  const [topic, setTopic] = useState('');
  const [country, setCountry] = useState('us');
  return (
    <div className="space-y-6">
      <form
        className={formClass}
        onSubmit={(event) => {
          event.preventDefault();
          void tool.run({ topic, country });
        }}
      >
        <div>
          <Label htmlFor="topic">Topic</Label>
          <input id="topic" className={inputClass} value={topic} onChange={(e) => setTopic(e.target.value)} placeholder="emergency plumber" required minLength={2} maxLength={100} />
        </div>
        <div>
          <Label htmlFor="country">Country</Label>
          <CountrySelect id="country" value={country} onChange={setCountry} />
        </div>
        <SubmitButton pending={tool.pending} disabled={!tool.turnstile.ready}>
          Find keywords
        </SubmitButton>
      </form>
      <ToolStatus error={tool.error} cached={tool.cached} hasData={tool.data !== null} turnstile={tool.turnstile} />
      {tool.data ? (
        tool.data.keywords.length ? (
          <ResultTable
            caption="Keyword ideas"
            head={['Keyword', 'Monthly searches', 'Difficulty', 'CPC', 'Intent']}
            numeric={[1, 2, 3]}
            rows={tool.data.keywords.map((k) => [k.keyword, n(k.volume), k.difficulty ?? '—', k.cpc == null ? '—' : `$${k.cpc.toFixed(2)}`, k.intent ?? '—'])}
          />
        ) : (
          <p className="text-muted">No ideas for that topic in this country. Try a broader term.</p>
        )
      ) : null}
    </div>
  );
}

function BacklinkChecker() {
  type Result = {
    summary: { rank: number; backlinks: number; referringDomains: number; dofollow: number; nofollow: number; brokenBacklinks: number; spamScore: number };
    top: { from: string; fromDomain: string; anchor: string; dofollow: boolean; rank: number }[];
  };
  const tool = useTool<Result>('backlink-checker');
  const [domain, setDomain] = useState('');
  return (
    <div className="space-y-6">
      <form
        className="grid gap-4 rounded-lg border border-line bg-surface p-6 shadow-hard-sm sm:p-7 sm:grid-cols-[1fr_auto] sm:items-end"
        onSubmit={(event) => {
          event.preventDefault();
          void tool.run({ domain });
        }}
      >
        <div>
          <Label htmlFor="domain">Domain</Label>
          <input id="domain" className={inputClass} value={domain} onChange={(e) => setDomain(e.target.value)} placeholder="example.com" required maxLength={253} />
        </div>
        <SubmitButton pending={tool.pending} disabled={!tool.turnstile.ready}>
          Check backlinks
        </SubmitButton>
      </form>
      <ToolStatus error={tool.error} cached={tool.cached} hasData={tool.data !== null} turnstile={tool.turnstile} />
      {tool.data ? (
        <>
          <Figures
            items={[
              { label: 'Backlinks', value: n(tool.data.summary.backlinks) },
              { label: 'Referring domains', value: n(tool.data.summary.referringDomains) },
              { label: 'Dofollow', value: tool.data.summary.backlinks ? `${Math.round((tool.data.summary.dofollow / tool.data.summary.backlinks) * 100)}%` : '—' },
              { label: 'Spam score', value: tool.data.summary.spamScore ?? '—' },
            ]}
          />
          {tool.data.top.length ? (
            <ResultTable
              caption="Strongest linking sites"
              head={['Linking page', 'Anchor', 'Type', 'Rank']}
              numeric={[3]}
              rows={tool.data.top.map((b) => [
                <a key="a" href={b.from} rel="nofollow noopener" className={ext}>
                  {b.fromDomain}
                </a>,
                b.anchor || '—',
                b.dofollow ? 'dofollow' : 'nofollow',
                n(b.rank),
              ])}
            />
          ) : (
            <p className="text-muted">No live backlinks found.</p>
          )}
        </>
      ) : null}
    </div>
  );
}

function TrafficChecker() {
  const tool = useTool<{ organicTraffic: number; organicKeywords: number; domainRank: number; backlinks: number; referringDomains: number }>('website-traffic-checker');
  const [domain, setDomain] = useState('');
  const [country, setCountry] = useState('us');
  return (
    <div className="space-y-6">
      <form
        className={formClass}
        onSubmit={(event) => {
          event.preventDefault();
          void tool.run({ domain, country });
        }}
      >
        <div>
          <Label htmlFor="domain">Domain</Label>
          <input id="domain" className={inputClass} value={domain} onChange={(e) => setDomain(e.target.value)} placeholder="example.com" required maxLength={253} />
        </div>
        <div>
          <Label htmlFor="country">Country</Label>
          <CountrySelect id="country" value={country} onChange={setCountry} />
        </div>
        <SubmitButton pending={tool.pending} disabled={!tool.turnstile.ready}>
          Check traffic
        </SubmitButton>
      </form>
      <ToolStatus error={tool.error} cached={tool.cached} hasData={tool.data !== null} turnstile={tool.turnstile} />
      {tool.data ? (
        <>
          <Figures
            items={[
              { label: 'Organic visits / month', value: n(tool.data.organicTraffic) },
              { label: 'Ranking keywords', value: n(tool.data.organicKeywords) },
              { label: 'Domain rank', value: n(tool.data.domainRank) },
              { label: 'Referring domains', value: n(tool.data.referringDomains) },
            ]}
          />
          <p className="text-sm text-muted">Visits are an estimate from rankings and search volume, not a measurement.</p>
        </>
      ) : null}
    </div>
  );
}

function CompetitorKeywords() {
  const tool = useTool<{ keywords: { keyword: string; position: number; volume: number; url: string; traffic: number }[] }>('competitor-keyword-finder');
  const [domain, setDomain] = useState('');
  const [country, setCountry] = useState('us');
  return (
    <div className="space-y-6">
      <form
        className={formClass}
        onSubmit={(event) => {
          event.preventDefault();
          void tool.run({ domain, country });
        }}
      >
        <div>
          <Label htmlFor="domain">Competitor’s domain</Label>
          <input id="domain" className={inputClass} value={domain} onChange={(e) => setDomain(e.target.value)} placeholder="competitor.com" required maxLength={253} />
        </div>
        <div>
          <Label htmlFor="country">Country</Label>
          <CountrySelect id="country" value={country} onChange={setCountry} />
        </div>
        <SubmitButton pending={tool.pending} disabled={!tool.turnstile.ready}>
          Find keywords
        </SubmitButton>
      </form>
      <ToolStatus error={tool.error} cached={tool.cached} hasData={tool.data !== null} turnstile={tool.turnstile} />
      {tool.data ? (
        tool.data.keywords.length ? (
          <ResultTable
            caption="Keywords bringing the most traffic"
            head={['Keyword', 'Position', 'Monthly searches', 'Est. visits', 'Ranking page']}
            numeric={[1, 2, 3]}
            rows={tool.data.keywords.map((k) => [
              k.keyword,
              k.position,
              n(k.volume),
              n(k.traffic),
              <a key="u" href={k.url} rel="nofollow noopener" className={ext}>
                {k.url.replace(/^https?:\/\//, '')}
              </a>,
            ])}
          />
        ) : (
          <p className="text-muted">No ranking keywords found for this domain in this country.</p>
        )
      ) : null}
    </div>
  );
}

function DomainAge() {
  type Row = { domain: string; registered?: string | null; updated?: string | null; expires?: string | null; registrar?: string | null; age?: { years: number; months: number } | null; error?: string };
  const tool = useTool<{ domains: Row[] }>('domain-age-checker');
  const [text, setText] = useState('');
  const domains = text
    .split(/\s+/)
    .map((d) => d.trim())
    .filter(Boolean);
  const date = (value: string | null | undefined) => (value ? new Date(value).toLocaleDateString(undefined, { dateStyle: 'medium' }) : '—');
  return (
    <div className="space-y-6">
      <form
        className="grid gap-4 rounded-lg border border-line bg-surface p-6 shadow-hard-sm sm:p-7"
        onSubmit={(event) => {
          event.preventDefault();
          void tool.run({ domains: domains.slice(0, 10) });
        }}
      >
        <div>
          <Label htmlFor="domains" hint={`${domains.length}/10`}>
            Domains, one per line
          </Label>
          <textarea id="domains" rows={4} className={`${inputClass} h-auto py-2`} value={text} onChange={(e) => setText(e.target.value)} placeholder={'example.com\nexample.org'} required />
          {domains.length > 10 ? <p className="mt-1 text-sm text-neg">Only the first 10 are checked.</p> : null}
        </div>
        <div>
          <SubmitButton pending={tool.pending} disabled={!tool.turnstile.ready || domains.length === 0}>
            Check age
          </SubmitButton>
        </div>
      </form>
      <ToolStatus error={tool.error} cached={false} hasData={tool.data !== null} turnstile={tool.turnstile} />
      {tool.data ? (
        <ResultTable
          caption="Domain registration dates"
          head={['Domain', 'Age', 'Registered', 'Expires', 'Registrar']}
          rows={tool.data.domains.map((d) =>
            d.error
              ? [d.domain, <span key="e" className="text-neg">{d.error}</span>, '', '', '']
              : [d.domain, d.age ? `${d.age.years} years, ${d.age.months} months` : '—', date(d.registered), date(d.expires), d.registrar ?? '—'],
          )}
        />
      ) : null}
    </div>
  );
}

const TOOLS: Record<ToolSlug, () => React.JSX.Element> = {
  'keyword-generator': KeywordGenerator,
  'backlink-checker': BacklinkChecker,
  'website-traffic-checker': TrafficChecker,
  'competitor-keyword-finder': CompetitorKeywords,
  'domain-age-checker': DomainAge,
  'serp-simulator': SerpSimulator,
};

export function ToolWidget({ slug }: { slug: ToolSlug }) {
  const Tool = TOOLS[slug];
  return <Tool />;
}
