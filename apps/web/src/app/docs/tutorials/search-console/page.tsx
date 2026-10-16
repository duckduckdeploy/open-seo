import Link from 'next/link';
import { Callout, DocTable, Step, Steps, Ui } from '@/components/doc-blocks';
import { DocArticle } from '@/components/doc-page';
import { getDoc } from '@/content/docs';
import { pageMeta } from '@/lib/metadata';

const slug = 'tutorials/search-console';
const doc = getDoc(slug);

export const metadata = pageMeta({ title: doc.title, description: doc.description, path: `/docs/${slug}` });

export default function SearchConsoleTutorial() {
  return (
    <DocArticle slug={slug} brands={['googlesearchconsole', 'googleanalytics']}>
      <p>
        Search Console is the one source of search data that comes from Google itself: the queries people typed, how
        often you appeared, where, and how often they clicked. Google Analytics adds what those visitors did on your
        site. OpenSEO reads both, read-only, and nothing here spends from your YepAPI balance.
      </p>

      <h2 id="connect">Connect Google</h2>
      <Steps>
        <Step title="Open Search performance">
          <p>
            In a project, open <Ui>Search performance</Ui>. If it says Google is not set up, the person running your
            OpenSEO needs to create a Google OAuth client first: see <Link href="/docs/google-setup">Set up Google sign-in</Link>.
          </p>
        </Step>
        <Step title="Connect a Google account">
          <p>
            Under <strong>Google Search Console</strong>, click <Ui>Connect a Google account</Ui>. Google asks you to
            choose an account and allow read-only access. Leave the permission ticked: without it nothing is connected.
            Search Console and Analytics are separate permissions, so each has its own button, and connecting one never
            grants the other.
          </p>
        </Step>
        <Step title="Choose the property">
          <p>
            Back in OpenSEO, pick the account and the property this project should read. A{' '}
            <code>sc-domain:</code> property covers the whole domain; a URL property covers one prefix. Properties you
            can see but have no verified access to are listed and greyed out, because Google returns no data for them.
          </p>
        </Step>
        <Step title="Optionally, add Google Analytics">
          <p>
            Under <strong>Google Analytics</strong>, connect an account the same way and choose a GA4 property. It adds
            organic traffic figures and makes the opportunity scores below use the value of each page&apos;s visits.
          </p>
        </Step>
      </Steps>

      <Callout title="What OpenSEO keeps">
        <p>
          Only the connection: which account, which property, and its access tokens, encrypted. Nothing Google returns
          is stored; every view asks Google again. Removing a Google account under <strong>Google accounts</strong>{' '}
          deletes the tokens and disconnects it from every project. To revoke access on Google&apos;s side too, use
          your Google account&apos;s security settings.
        </p>
      </Callout>

      <h2 id="read">Read the report</h2>
      <p>
        Pick a period (7 days, 28 days or 3 months) and optionally a device. Search Console data lags by about three
        days, so periods end three days ago. Each total is compared with the period of the same length just before it.
      </p>
      <DocTable
        caption="Search performance totals"
        head={['Figure', 'How it is worked out']}
        rows={[
          ['Clicks, impressions', 'Summed over the days in the period.'],
          ['CTR', 'Clicks divided by impressions for the whole period.'],
          ['Average position', 'Weighted by impressions, so a query seen 1,000 times counts more than one seen once. A lower number is better, so a fall shows as an improvement.'],
        ]}
      />

      <h2 id="striking">Striking distance</h2>
      <p>
        The default tab lists queries one push from the top of page one. For each query OpenSEO takes the page of yours
        that ranks best for it, and keeps it when that page sits at positions 5 to 20. They are sorted by impressions,
        so the first rows are where improving a page would be seen most. Select rows and click{' '}
        <Ui>Save as keywords</Ui> to add them to Saved keywords, tagged <code>search-console</code>, ready for a rank
        tracker.
      </p>

      <h2 id="tables">Queries and pages</h2>
      <p>
        The Queries and Pages tabs page through everything Search Console has, by clicks, 50 rows at a time, with CSV
        export of the page you are on.
      </p>

      <h2 id="opportunities">Opportunities</h2>
      <p>Opportunities ranks pages at positions 4 to 20 by where a push is most worth it. Each page gets a score from 0 to 100:</p>
      <DocTable
        caption="Opportunity score"
        head={['Part', 'Weight', 'Measured by']}
        rows={[
          ['Demand', '0.5', 'Impressions, on a log scale, so one huge page does not flatten the rest.'],
          ['Value', '0.3', "The page's key-event rate from GA4 (conversions per session), or its engagement rate when the property has no key events."],
          ['Reachability', '0.2', 'How close the page is to the top: 20 minus its position.'],
        ]}
      />
      <p>
        Each part is a percentile among the pages listed, so scores compare pages with each other, not with other
        sites. Pages are matched to GA4 by host and path. Without Google Analytics the value part is left out and the
        other two are rescaled, and the page says so. Search Console counts days in Pacific time and GA4 in the
        property&apos;s time zone, so the two line up only roughly; the page warns when they differ.
      </p>

      <h2 id="analytics">Organic traffic</h2>
      <p>
        With Google Analytics connected, the page also shows organic-search sessions, engagement rate, key events and
        revenue against the previous period, and the landing pages search visitors arrive on. Periods are complete days
        up to yesterday in the property&apos;s time zone. When Google sampled or thresholded the data, the page says the
        figures are approximate.
      </p>

      <Callout title="With an agent">
        <p>
          Agents read the same data with <code>get_search_performance</code>, <code>get_search_console_rows</code>,{' '}
          <code>inspect_urls</code>, <code>get_analytics_overview</code>, <code>get_analytics_landing_pages</code> and{' '}
          <code>get_search_opportunities</code>. They cannot connect Google themselves. See{' '}
          <Link href="/docs/mcp-tools#google">MCP tools</Link>.
        </p>
      </Callout>
    </DocArticle>
  );
}
