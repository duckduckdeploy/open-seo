import Link from 'next/link';
import { DocArticle } from '@/components/doc-page';
import { getDoc } from '@/content/docs';
import { pageMeta } from '@/lib/metadata';
import { SIGN_UP_URL, YEPAPI_URL } from '@/lib/site';

const slug = 'getting-started';
const doc = getDoc(slug);

export const metadata = pageMeta({ title: doc.title, description: doc.description, path: `/docs/${slug}` });

export default function GettingStartedPage() {
  return (
    <DocArticle slug={slug}>
      <p>
        This guide covers the hosted version of OpenSEO. To run it on your own machine instead, see{' '}
        <Link href="/docs/self-hosting">Self-hosting</Link>.
      </p>
      <p>
        OpenSEO is open-source software. Search data, such as keyword volumes, rankings and backlinks, comes from our
        data provider, YepAPI: you add your own key, and YepAPI bills each lookup to it. The app shows the cost of every
        lookup before it runs.
      </p>

      <h2 id="yepapi-account">1. Create a YepAPI account</h2>
      <p>
        Sign up at{' '}
        <a href={YEPAPI_URL} rel="noopener">
          yepapi.com
        </a>
        . New accounts get <strong>$5 in free API credits</strong>, so you can try OpenSEO before adding any money.
        Then create an API key in your YepAPI account.
      </p>

      <h2 id="openseo-account">2. Create an OpenSEO account</h2>
      <p>
        <a href={SIGN_UP_URL}>Sign up for OpenSEO</a>. The account is free.
      </p>

      <h2 id="paste-key">3. Paste your YepAPI key</h2>
      <p>
        Add your YepAPI key to OpenSEO. From then on, every action that fetches data is sent to YepAPI with your key
        and billed by YepAPI to your account. OpenSEO stores the key encrypted.
      </p>

      <h2 id="run-research">4. Run research</h2>
      <p>
        Pick an action, such as a keyword research run or a rank check. <strong>The app shows the price before the
        action runs</strong>, so you always know what you are about to spend.
      </p>
      <p>As a guide, $5 of credit covers roughly one of these:</p>
      <ul>
        <li>about 50 rank checks of the top 100, or</li>
        <li>about 60 keyword research runs of 150 results, or</li>
        <li>about 80 backlink lookups of 100 rows.</li>
      </ul>
      <p>
        See <Link href="/pricing">Pricing</Link> for more examples. They are YepAPI&apos;s prices at the time of
        writing.
      </p>

      <h2 id="credits">When credits run out</h2>
      <p>
        Actions that need YepAPI stop working until you add credit in your YepAPI account. OpenSEO cannot top up for
        you and will not charge you.
      </p>

      <h2 id="limit">Optional: set a monthly limit</h2>
      <p>
        Under Settings and usage you can set a monthly spending limit. OpenSEO checks it before every paid call,
        including scheduled runs and agents, and stops there. See{' '}
        <Link href="/docs/costs-and-limits">Costs, caching and limits</Link>.
      </p>

      <h2 id="next">Next</h2>
      <ul>
        <li>
          <Link href="/docs/how-it-works">How OpenSEO works</Link>: projects, markets and what runs in the background.
        </li>
        <li>
          <Link href="/docs/tutorials/keyword-research">Build a keyword list</Link>, the first tutorial.
        </li>
        <li>
          <Link href="/docs/mcp">Connect an agent over MCP</Link> so Claude, Cursor or Codex can run the same actions.
        </li>
      </ul>
    </DocArticle>
  );
}
