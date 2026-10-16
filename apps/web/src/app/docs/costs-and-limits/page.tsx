import Link from 'next/link';
import { Callout, DocTable, Ui } from '@/components/doc-blocks';
import { DocArticle } from '@/components/doc-page';
import { getDoc } from '@/content/docs';
import { pageMeta } from '@/lib/metadata';

const slug = 'costs-and-limits';
const doc = getDoc(slug);

export const metadata = pageMeta({ title: doc.title, description: doc.description, path: `/docs/${slug}` });

export default function CostsPage() {
  return (
    <DocArticle slug={slug}>
      <p>
        OpenSEO charges nothing. Every paid action is billed by YepAPI to your own key at YepAPI&apos;s price, and the
        app shows that price before anything runs. This page explains how the prices are worked out and the controls
        you have over spending. Prices are YepAPI&apos;s at the time of writing; YepAPI sets them.
      </p>

      <h2 id="price-kinds">How prices are worked out</h2>
      <DocTable
        caption="Kinds of price"
        head={['Kind', 'How it is billed', 'Examples']}
        rows={[
          ['Flat', 'A fixed price per call.', 'Domain overview totals $0.08, Lighthouse $0.05, Maps search $0.07, business profile $0.05'],
          ['Per results page', '$0.01 for every 10 search results fetched.', 'Google results: top 20 is $0.02, top 100 is $0.10'],
          ['Per row', 'A base price plus a price per 100 rows returned, rounded up to the cent.', 'Keyword ideas: $0.03 + $0.03 per 100 keywords. Backlink lists: $0.05 + $0.01 per 100 rows'],
          ['Per token', 'AI models charge by the length of the question and answer, at least $0.01 per answer. Web search adds roughly a cent or more.', 'AI visibility, Prompt explorer, prompt suggestions'],
        ]}
      />
      <p>
        Per-row prices are billed on the rows that actually come back, so the price you see is the most a lookup can
        cost. Where a price is a range, the app shows both ends, for example <code>$0.03 – $0.08</code>.
      </p>
      <p>
        A paid call is never retried automatically when retrying could bill you twice. OpenSEO retries it only when
        YepAPI turned it away for sending too fast, or when the connection failed before the request left. After a
        server error, a timeout or a connection lost mid-call, the request may already have run and been billed, so
        the error is shown and you decide whether to try again. Free calls, such as the balance, are retried as usual.
      </p>

      <h3 id="rank-price">Rank checks read the top 100</h3>
      <p>
        Every rank check reads the top 100 Google results, 10 pages at $0.01 each, so it records your position wherever
        it is and the full field of competitors. A check costs $0.10 per keyword and device; desktop and mobile are
        separate checks. A run costs <code>keywords × devices × $0.10</code>, and the tracker shows it per run and per
        month on its schedule.
      </p>

      <h3 id="ai-price">AI answers have no fixed price</h3>
      <p>
        Because models charge by length, an AI visibility run shows a minimum ($0.01 per answer) and, once every selected
        model has answered before, an expected figure based on what its answers cost you. Web search is on by default
        because it is needed for citations.
      </p>

      <h2 id="caching">When results are free</h2>
      <p>
        Results are kept for your account. Repeating the same request within its cache time costs nothing, and the
        result says <Ui>cached, free</Ui>. To pay for fresh data, use <Ui>Refresh (pay again)</Ui>; it shows its price next to it.
      </p>
      <DocTable
        caption="How long results are reused"
        head={['Lookup', 'Reused for']}
        mono={[1]}
        rows={[
          ['Keyword ideas, keyword metrics, organic and SERP competitors, keyword gap', '7 days'],
          ['Domain overview, top keywords, top pages, all backlink reports, autocomplete, trends, Maps search, business profile', '1 day'],
          ['Reviews', '6 hours'],
          ['Google results, on-page check, Lighthouse', '1 hour'],
          ['Prompt explorer', 'never'],
        ]}
      />
      <p>
        Rank checks, AI visibility runs and geo-grids are not cached: each run fetches fresh data, which is the point of
        tracking. A plain site audit is free whatever you do.
      </p>

      <h2 id="controls">Controls that stop spending</h2>
      <h3 id="budget">Monthly spending limit</h3>
      <p>
        Under <Ui>Settings and usage</Ui> you can set a monthly limit in dollars. Before every paid call, OpenSEO adds up
        what your account has spent this calendar month (UTC) and refuses the call once the limit is reached, with the
        error <code>budget_reached</code>. This covers the dashboard, the REST API, agents and scheduled runs, and it
        stops a long run part way instead of only checking when it starts.
      </p>
      <p>
        Free actions keep working when the limit is reached: cached results, price checks, your saved data and the
        YepAPI balance. Calls already in flight when the limit is crossed still complete, so a month can end a few cents
        over.
      </p>

      <h3 id="ceilings">Per-call ceilings</h3>
      <p>
        Agents and scripts can pass a ceiling with each paid call: <code>max_cost_usd</code> on MCP tools,{' '}
        <code>?maxCostUsd=</code> on REST lookups and <code>maxCostUsd</code> when starting an AI visibility run. A call
        whose worst-case price is above the ceiling is refused before anything is spent, with{' '}
        <code>cost_ceiling_exceeded</code>.
      </p>
      <p>
        AI answers have no worst case, so for them the ceiling works while the call runs: models are asked one at a
        time, each answer reserves its expected cost, and the run stops before an answer that would likely cross the
        ceiling. Since an answer&apos;s price is only known afterwards, the total can end above the ceiling by up to the
        cost of one answer. A run stopped this way is marked cancelled and is left out of your trend.
      </p>

      <h3 id="confirm">Confirmations in the app</h3>
      <p>
        Background runs that spend (rank checks, AI visibility, rendered audits and geo-grids) ask you to confirm with
        the price on the button. Creating trackers, adding keywords or prompts, and saving settings never spend.
      </p>

      <h2 id="limits">Limits</h2>
      <DocTable
        caption="Limits"
        head={['What', 'Limit']}
        mono={[1]}
        rows={[
          ['Keywords per rank tracker', '1,000'],
          ['Rank check depth', 'top 10 to top 100'],
          ['AI prompts per project', '200'],
          ['AI models per project', '20'],
          ['Competitors per project (AI visibility)', '20'],
          ['Models in one Prompt explorer question', '8'],
          ['Pages per site audit', '5,000'],
          ['Pages per rendered audit', '500'],
          ['Keywords per metrics lookup', '700 (100 for city-level volume)'],
          ['Keywords per SERP-competitor lookup', '200'],
          ['Domains per link intersect', '2 to 20'],
          ['Geo-grid size', '3×3, 5×5, 7×7 or 9×9'],
          ['Saved keywords added at once', '1,000'],
        ]}
      />

      <Callout tone="cost" title="Where the money goes">
        <p>
          Straight to YepAPI. OpenSEO never takes a payment and cannot top up your balance. New YepAPI accounts start
          with $5 in free credits; see <Link href="/pricing">Pricing</Link> for what that covers.
        </p>
      </Callout>
    </DocArticle>
  );
}
