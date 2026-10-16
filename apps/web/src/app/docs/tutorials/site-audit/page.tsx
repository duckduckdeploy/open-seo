import Link from 'next/link';
import { ISSUE_CATALOG, ISSUE_TYPES } from '@openseo/crawler/catalog';
import { Callout, DocTable, Step, Steps, Ui } from '@/components/doc-blocks';
import { DocArticle } from '@/components/doc-page';
import { Screenshot } from '@/components/screenshot';
import { getDoc } from '@/content/docs';
import { pageMeta } from '@/lib/metadata';

const slug = 'tutorials/site-audit';
const doc = getDoc(slug);

export const metadata = pageMeta({ title: doc.title, description: doc.description, path: `/docs/${slug}` });

const count = (severity: string) => ISSUE_TYPES.filter((type) => ISSUE_CATALOG[type].severity === severity).length;

export default function SiteAuditTutorial() {
  return (
    <DocArticle slug={slug}>
      <p>
        OpenSEO crawls your site with its own crawler, so a normal audit costs nothing. It checks every page it reaches
        against {ISSUE_TYPES.length} kinds of problem ({count('critical')} critical, {count('warning')} warnings and{' '}
        {count('info')} notices) and sums them up as a health score.
      </p>

      <h2 id="run">Run an audit</h2>
      <Steps>
        <Step title="Start it">
          <p>
            Open <Ui>Site audit</Ui> and click <Ui>New audit</Ui>. The start URL defaults to your project&apos;s
            website. Choose how many pages to crawl, up to 5,000. Then click <Ui>Start audit</Ui>.
          </p>
        </Step>
        <Step title="Let it crawl">
          <p>
            The crawler is polite: two requests at a time, at least half a second apart, and it follows{' '}
            <code>robots.txt</code>, including its Crawl-delay (up to 10 seconds). It finds pages through links and
            through your XML sitemaps. Progress updates every 10 pages; you can leave the page or cancel.
          </p>
        </Step>
        <Step title="Only if your site needs it: render JavaScript">
          <p>
            Sites that build their content in the browser look empty to a plain crawler, and the audit flags them with
            &quot;Content needs JavaScript rendering&quot;. For those, tick <strong>Render JavaScript</strong>. Each page
            is then rendered through YepAPI at $0.02, up to 500 pages, and you confirm the maximum before it starts.
          </p>
        </Step>
      </Steps>

      <h2 id="read">Read the results</h2>
      <p>
        The top of the audit shows the health score, pages crawled, how many are indexable, how many were blocked or
        failed, the issue counts by severity, and whether a <code>robots.txt</code> and sitemaps were found.
      </p>
      <Screenshot
        name="site-audit"
        window
        alt="A site audit of upliftdesk.com: health score 96, pages crawled, indexable, blocked and failed pages, issue counts and response time"
        caption="An audit of the first 100 pages of upliftdesk.com."
      />
      <p>
        If the crawl stopped at your page limit, a note says so. Findings that compare pages with each other
        (duplicates, orphan pages, broken links) are then partial; run it again with a higher limit to cover the whole
        site.
      </p>
      <h3 id="issues">Work through the issues</h3>
      <p>
        The <strong>Issues</strong> tab groups findings by severity, then by type. Open a group to see what it means,
        how to fix it, and every affected URL with the detail for that page (which link is broken, which canonical is
        wrong and so on). Start with critical issues: they stop pages from being crawled, indexed or shown.{' '}
        <Ui>Issues CSV</Ui> exports everything for a spreadsheet or a ticket.
      </p>
      <h3 id="pages">Look at single pages</h3>
      <p>
        The <strong>Pages</strong> tab lists every URL with its status, indexability, word count, depth, response time
        and issue count. Sort by most issues or slowest response, filter by URL, and click a page for everything
        recorded about it: why it is or is not indexable, its redirect chain, title, description, headings, structured
        data and its issues.
      </p>

      <DocTable
        caption="How to read the health score"
        head={['Score', 'Reading']}
        mono={[0]}
        rows={[
          ['80–100', 'Healthy. Remaining issues are mostly notices.'],
          ['50–79', 'Real problems on a good share of pages. Fix critical issues and warnings first.'],
          ['0–49', 'Widespread problems, or most pages could not be read (blocked, failing or empty).'],
        ]}
      />
      <p>
        The exact formula and every check are listed in <Link href="/docs/audit-checks">Site audit checks</Link>.
      </p>

      <Screenshot name="site-audit-issues" alt="Issues grouped into warnings and notices, each with the number of affected URLs" caption="Issues grouped by severity. Open one for the affected URLs and how to fix it." />

      <h2 id="lighthouse">Test a page with Lighthouse</h2>
      <p>
        Below the audit list, the <strong>Lighthouse</strong> card tests one URL on mobile or desktop ($0.05; a repeat
        within the hour is free). It shows the four Lighthouse scores, the Core Web Vitals (largest contentful paint,
        layout shift, total blocking time, first contentful paint, speed index) graded good, needs work or poor, and
        every failed audit with a severity, most serious first:
      </p>
      <ul>
        <li>
          <strong>Critical</strong>: fixing it would save 300 ms or more, or the audit scores under 50.
        </li>
        <li>
          <strong>Warning</strong>: it would save 100 ms or more, or scores under 90.
        </li>
        <li>
          <strong>Notice</strong>: anything else that failed.
        </li>
      </ul>
      <p>Within a severity, the biggest saving comes first.</p>

      <Callout title="If pages show as blocked">
        <p>
          &quot;Page blocked the crawler&quot; means the server answered 401/403 or a bot challenge. Allow the user
          agent <code>OpenSEOBot/0.1</code> in your firewall or CDN, or confirm the pages are meant to be private. Blocked
          pages are never reported as content problems.
        </p>
      </Callout>
    </DocArticle>
  );
}
