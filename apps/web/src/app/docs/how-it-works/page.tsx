import Link from 'next/link';
import { Callout, DocTable } from '@/components/doc-blocks';
import { DocArticle } from '@/components/doc-page';
import { getDoc } from '@/content/docs';
import { pageMeta } from '@/lib/metadata';

const slug = 'how-it-works';
const doc = getDoc(slug);

export const metadata = pageMeta({ title: doc.title, description: doc.description, path: `/docs/${slug}` });

export default function HowItWorksPage() {
  return (
    <DocArticle slug={slug}>
      <p>
        OpenSEO is a workspace, not a data company. It decides what to ask for, asks YepAPI with your key, shows you
        the price first, and keeps what comes back so you can compare it over time. This page explains the moving
        parts, so the rest of the docs make sense.
      </p>

      <h2 id="parts">The parts</h2>
      <DocTable
        caption="The parts of OpenSEO"
        head={['Part', 'What it does']}
        rows={[
          ['Dashboard', 'The web app you work in. Every screen talks to the API; nothing reaches YepAPI from your browser.'],
          ['API', 'Checks who you are, works out prices, calls YepAPI with your key, caches results and stores your work in Postgres.'],
          ['Background worker', 'Runs the long jobs (rank checks, AI visibility runs, site audits, geo-grids) and starts scheduled ones.'],
          ['MCP server', 'The same features for AI agents, at /mcp on the API. Every tool calls the same routes the dashboard uses.'],
          ['Crawler', "OpenSEO's own site-audit crawler. It runs on the API's machine, so a plain crawl costs nothing."],
          ['YepAPI', 'Where the SEO data comes from: search results, keyword and domain data, backlinks, Maps, Lighthouse and AI models.'],
        ]}
      />

      <h2 id="projects">Projects and markets</h2>
      <p>
        Everything lives in a <strong>project</strong>, one per website. A project has a name, a website and a{' '}
        <strong>default market</strong>: a country, its language, and the country code some data sources need. The
        market fills in any search where you do not choose one, so a German project gets German keyword volumes and
        rankings without you picking Germany every time.
      </p>
      <p>
        You can change the market on the project overview page under <strong>Project settings</strong>. Searches you
        already ran keep the market they ran in, and cached results for the old market are not reused for the new one.
      </p>

      <h2 id="lookup">What happens when you run a lookup</h2>
      <p>
        A lookup is any one-off piece of research: keyword ideas, a domain overview, a backlink list, a Lighthouse
        test, a Maps search and so on. Each one follows the same path:
      </p>
      <ol>
        <li>
          <strong>Price.</strong> As you fill in the form, the app asks the API for the price of that exact request.
          This is free. While the price is being checked, the Run button waits.
        </li>
        <li>
          <strong>Run.</strong> Nothing is fetched until you click. The API checks your monthly spending limit, then
          calls YepAPI with your key.
        </li>
        <li>
          <strong>Record.</strong> Every billed call is written to your usage log with its cost, which is what Settings
          and the monthly limit are based on.
        </li>
        <li>
          <strong>Cache.</strong> The result is kept for your account. Running the same request again within the
          cache time is free. <Link href="/docs/costs-and-limits#caching">Cache times</Link> range from an hour (live
          search results) to a week (keyword data).
        </li>
      </ol>

      <h2 id="runs">Background runs</h2>
      <p>
        Rank checks, AI visibility runs, site audits and geo-grids can take minutes, so they run in the background.
        Starting one creates a <strong>run</strong>, which the dashboard follows with a progress bar. You can leave the
        page and come back. You can also cancel a run; anything already fetched stays stored and billed.
      </p>
      <ul>
        <li>A tracker or project has at most one run going at a time, so a double click cannot pay twice.</li>
        <li>
          If YepAPI rejects your key, you run out of credit, or your monthly limit is reached, the run stops instead of
          repeating the same error for every keyword.
        </li>
        <li>
          Rank trackers and AI visibility can run on a schedule (daily, weekly or monthly). The worker checks for due
          schedules every five minutes. If a manual run is still going when a schedule comes due, it tries again 15
          minutes later.
        </li>
        <li>
          A run whose worker stopped (a crash or a restart) is marked failed after 30 minutes without progress, so it
          never blocks its tracker or project for long.
        </li>
      </ul>

      <h2 id="stored">What is stored</h2>
      <DocTable
        caption="What OpenSEO stores"
        head={['Data', 'Kept']}
        rows={[
          ['Your account and sessions', 'Until you delete them. Passwords are hashed by the auth library.'],
          ['Your YepAPI key', 'Encrypted with AES-256-GCM. It is never sent back to the browser; Settings shows only its first and last characters.'],
          ['OpenSEO API keys', 'Only a SHA-256 hash. The key itself is shown once, when you create it.'],
          ['Lookup results', 'In the cache, for the lookup’s cache time. Expired entries are cleared every 15 minutes.'],
          ['Saved keywords, trackers, positions, AI answers, audits, geo-grids', 'Until you delete them, or the project they belong to.'],
          ['Usage log', 'Every billed or failed YepAPI call, with its cost. It survives project deletion, so the monthly limit stays accurate.'],
          ['Your chosen Google Business listing (Local SEO)', 'In your browser only, per project.'],
        ]}
      />

      <h2 id="security">Security in brief</h2>
      <ul>
        <li>Dashboard requests that change something must come from the dashboard itself; requests from other sites are refused.</li>
        <li>OpenSEO API keys can only be created from a signed-in session, not by another API key.</li>
        <li>
          The crawler refuses private, loopback and cloud-metadata addresses, including when a public page redirects to
          one, and it checks the address it actually connects to.
        </li>
        <li>Your projects, results and keys are visible only to your account.</li>
      </ul>

      <Callout title="Hosted or self-hosted">
        <p>
          Both work the same way and use your YepAPI key in the same way. Self-hosting means the database and everything
          in it are on infrastructure you control. See <Link href="/docs/self-hosting">Self-hosting</Link>.
        </p>
      </Callout>
    </DocArticle>
  );
}
