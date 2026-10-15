import { ISSUE_CATALOG, ISSUE_TYPES, type IssueType } from '@openseo/crawler/catalog';
import { DocTable } from '@/components/doc-blocks';
import { DocArticle } from '@/components/doc-page';
import { getDoc } from '@/content/docs';
import { pageMeta } from '@/lib/metadata';

const slug = 'audit-checks';
const doc = getDoc(slug);

export const metadata = pageMeta({ title: doc.title, description: doc.description, path: `/docs/${slug}` });

const SEVERITIES = [
  ['critical', 'Critical', 'Problems that stop pages being crawled, indexed or shown.'],
  ['warning', 'Warnings', 'Problems that hold pages back.'],
  ['info', 'Notices', 'Smaller improvements and things worth knowing.'],
] as const;

// Read from the crawler itself, so this page always matches what the audit reports.
const bySeverity = (severity: string): IssueType[] => ISSUE_TYPES.filter((type) => ISSUE_CATALOG[type].severity === severity);

export default function AuditChecksPage() {
  return (
    <DocArticle slug={slug}>
      <p>
        The site audit reports {ISSUE_TYPES.length} kinds of issue. This list is generated from the crawler&apos;s own
        catalog, so it always matches what an audit can report. The code in each row is the issue type used by the
        REST API and the MCP tools.
      </p>

      <h2 id="score">How the health score is worked out</h2>
      <ol>
        <li>
          Every page the crawler tried gets a penalty: 25 points per critical issue, 8 per warning and 1 per notice on
          that page, capped at 100. Pages blocked by <code>robots.txt</code> are left out, since the crawler never
          fetched them.
        </li>
        <li>
          The score is 100 minus the average penalty, rounded. A site where every page is clean scores 100; one where
          every page has four critical issues scores 0.
        </li>
        <li>If no page answered with a success status, the score is 0.</li>
      </ol>
      <p>
        Issues that apply to the whole site, such as a missing sitemap or missing security headers, are reported once,
        on the start page or the first page of each origin. Checks that compare pages with each other (duplicates,
        broken internal links, orphan pages) are only as complete as the crawl; orphan pages are reported only when
        the crawl finished without hitting its page limit.
      </p>

      {SEVERITIES.map(([severity, title, intro]) => (
        <section key={severity}>
          <h2 id={severity}>
            {title} ({bySeverity(severity).length})
          </h2>
          <p>{intro}</p>
          <DocTable
            caption={`${title}: audit checks`}
            head={['Issue', 'What it means', 'How to fix it']}
            rows={bySeverity(severity).map((type) => [
              <span key={type}>
                {ISSUE_CATALOG[type].title}
                <code className="mt-1 block w-fit text-xs font-normal">{type}</code>
              </span>,
              ISSUE_CATALOG[type].description,
              ISSUE_CATALOG[type].howToFix,
            ])}
          />
        </section>
      ))}
    </DocArticle>
  );
}
