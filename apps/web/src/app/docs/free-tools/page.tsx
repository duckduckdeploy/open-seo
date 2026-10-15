import Link from 'next/link';
import { Callout, DocTable } from '@/components/doc-blocks';
import { CodeBlock } from '@/components/code-block';
import { DocArticle } from '@/components/doc-page';
import { getDoc } from '@/content/docs';
import { pageMeta } from '@/lib/metadata';

const slug = 'free-tools';
const doc = getDoc(slug);

export const metadata = pageMeta({ title: doc.title, description: doc.description, path: `/docs/${slug}` });

const apiEnv = `# The API (.env)
FREE_TOOLS_YEPAPI_KEY=yep_sk_...           # pays for every visitor's lookups
FREE_TOOLS_DAILY_BUDGET_USD=5              # across everyone, per UTC day
TURNSTILE_SECRET_KEY=0x...                 # Cloudflare Turnstile
CLIENT_IP_HEADER=cf-connecting-ip          # the visitor's address, set by your edge proxy`;

const webEnv = `# The site (apps/web/.env)
API_URL=http://localhost:4100              # where /api/public is forwarded
NEXT_PUBLIC_TURNSTILE_SITE_KEY=0x...`;

export default function FreeToolsDocsPage() {
  return (
    <DocArticle slug={slug}>
      <p>
        The site has six <Link href="/tools">free tools</Link> anyone can use without an account. Two need no data
        provider: the search result preview runs in the browser, and the domain age checker reads the registries&apos;
        free RDAP records. The other four call YepAPI, and on a public site someone has to pay for that: the operator,
        with a key of their own. They are off until you set one.
      </p>

      <h2 id="enable">Turn them on</h2>
      <CodeBlock label="Terminal" code={apiEnv} />
      <CodeBlock label="Terminal" code={webEnv} />
      <p>
        Use a separate YepAPI key with a small balance, so a mistake or an attack can never spend more than you put on
        it. The site forwards only <code>/api/public</code> to the API; the dashboard&apos;s API is not reachable
        through it.
      </p>

      <h2 id="guards">What protects your key</h2>
      <p>Every request to a paid tool passes these checks, in this order, and stops at the first one it fails:</p>
      <DocTable
        caption="Free tool guards"
        head={['Check', 'Refused with']}
        rows={[
          ['JSON only, at most 16 KiB, with every field validated', '415, 413 or 400'],
          ['A browser on another site (an Origin other than WEB_URL)', '403'],
          ['In production: Turnstile and CLIENT_IP_HEADER must be configured, and the header present', '503'],
          ['5 requests a minute per visitor address, across all tools', '429 with Retry-After: 60'],
          ['Turnstile: the token must be valid, for your site, with the action free_tool. A slow or failed check counts as a fail', '403'],
          ['A result someone asked for in the last 24 hours is served without spending', '(cached)'],
          ['The run’s calls and worst-case cost are reserved before any paid call: your daily budget and 6,000 calls a day overall, each tool’s own daily cap, and 40 calls a day per visitor', '503 for the budget, 429 for a visitor'],
        ]}
      />
      <ul>
        <li>The reservation is one database transaction, so concurrent visitors cannot overshoot the budget together.</li>
        <li>
          A failed lookup is not refunded and is cached for two minutes, so retrying a broken input does not spend
          again. Paid calls are never retried after a server error, since the failed attempt may already have been
          billed.
        </li>
        <li>Visitors see plain error messages; YepAPI&apos;s own errors go only to the server log.</li>
        <li>Counters and cached results are deleted once they expire, every 15 minutes.</li>
      </ul>

      <Callout title="The visitor's address">
        <p>
          Rate limits are per visitor address, so it has to be one a visitor cannot make up. Set{' '}
          <code>CLIENT_IP_HEADER</code> to a header your edge proxy sets itself and overwrites, such as{' '}
          <code>cf-connecting-ip</code> behind Cloudflare or <code>x-real-ip</code> from nginx. Do not use{' '}
          <code>x-forwarded-for</code> through Next.js: it keeps whatever value the visitor sent. For the same reason{' '}
          <code>TRUST_PROXY_HOPS</code> defaults to 0. Only the hashed address is stored, for at most three days.
        </p>
      </Callout>

      <h2 id="costs">What it costs you</h2>
      <DocTable
        caption="Worst-case cost per free tool run"
        head={['Tool', 'YepAPI calls', 'Reserved per run']}
        mono={[2]}
        rows={[
          ['Keyword generator', '1 (20 ideas)', '$0.04'],
          ['Backlink checker', '2 (summary and 15 links)', '$0.11'],
          ['Website traffic checker', '1', '$0.08'],
          ['Competitor keyword finder', '1 (20 keywords)', '$0.04'],
          ['Domain age checker, search result preview', 'none', '$0'],
        ]}
      />
      <p>
        With the default $5 budget, that is around 60 traffic checks a day across all visitors, fewer once
        cache hits are taken out. Raise <code>FREE_TOOLS_DAILY_BUDGET_USD</code> once you see real use.
      </p>
    </DocArticle>
  );
}
