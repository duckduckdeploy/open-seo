import Link from 'next/link';
import { Callout, DocTable, Step, Steps, Ui } from '@/components/doc-blocks';
import { DocArticle } from '@/components/doc-page';
import { Screenshot } from '@/components/screenshot';
import { getDoc } from '@/content/docs';
import { pageMeta } from '@/lib/metadata';

const slug = 'tutorials/rank-tracking';
const doc = getDoc(slug);

export const metadata = pageMeta({ title: doc.title, description: doc.description, path: `/docs/${slug}` });

export default function RankTrackingTutorial() {
  return (
    <DocArticle slug={slug}>
      <p>
        A tracker follows one domain in one place: a country, a region, a city, or an exact point. Creating it is free;
        you pay each time a check runs. This tutorial sets one up, runs a first check and shows you how to read it.
      </p>

      <h2 id="create">Create a tracker</h2>
      <Steps>
        <Step title="Start a new tracker">
          <p>
            Open <Ui>Rank tracking</Ui> and click <Ui>New tracker</Ui>. The domain defaults to your project&apos;s
            website. Subdomains count as the same site, so <code>blog.acme.com</code> ranks for <code>acme.com</code>.
          </p>
        </Step>
        <Step title="Choose where to search from">
          <p>
            <strong>Place</strong> searches as someone in a country, region or city would; start typing to find it.{' '}
            <strong>Exact coordinates</strong> searches from a latitude and longitude, for businesses whose rankings
            change street by street.
          </p>
        </Step>
        <Step title="Pick devices and schedule">
          <p>
            Desktop and mobile are separate checks, so both doubles the price. Every check reads the top 100 results.{' '}
            <strong>Schedule</strong> runs checks daily, weekly or monthly in the background; manual trackers run only when
            you click <Ui>Check rankings now</Ui>, which you can also do any time on a scheduled one.
          </p>
        </Step>
        <Step title="Add keywords and read the price">
          <p>
            Paste up to 1,000 keywords, one per line. Under them, <strong>Price of a check</strong> shows one run and
            one month on the schedule you picked. Then click <Ui>Create tracker</Ui>.
          </p>
        </Step>
      </Steps>

      <Callout tone="cost" title="What a check costs">
        <p>
          Every check reads the top 100 results: 10 pages at $0.01, so $0.10 per keyword and device. 100 keywords on
          desktop cost $10 a run, about $43 a month checked weekly.
        </p>
      </Callout>

      <h2 id="run">Run a check</h2>
      <p>
        On the tracker, click <Ui>Check rankings now</Ui> and confirm the price. Progress and spend so far are shown while it
        runs, and you can cancel it; finished checks stay stored. If YepAPI rejects your key or your balance or monthly
        limit runs out, the check stops and says why.
      </p>

      <h2 id="read">Read the results</h2>
      <p>
        The <strong>Keywords</strong> tab has a summary (average position, top 3, top 10, top 20, improved and
        declined), a chart of positions, and one row per keyword. Switch device with the toggle above the tabs.
      </p>
      <Screenshot
        name="rank-tracker"
        window
        alt="A rank tracker for upliftdesk.com: average position, keywords in the top 3, 10 and 20, the position chart and the keyword table"
        caption="A tracker of 15 keywords for upliftdesk.com in the United States, after its first check."
      />
      <Screenshot name="rank-tracker-keywords" alt="The keyword table with position, change, best position, ranking URL, search features and history" caption="One row per keyword: position, change, best ever, the page that ranks and the search features around it." />
      <DocTable
        caption="Rank tracking columns"
        head={['Column', 'Meaning']}
        rows={[
          ['Position', 'Your place among the organic results. Ads, maps and other features do not push it down. "not in top 30" means not found within the depth checked.'],
          ['Change', 'Places gained or lost since the previous check. "new" is a first result, "entered" means it came into the checked depth, "dropped out" that it left.'],
          ['Best', 'The best position in the recent checks shown.'],
          ['Ranking URL', 'Which of your pages ranks.'],
          ['SERP features', 'Features on the results page. A tick marks ones your site appears in, such as a featured snippet.'],
          ['History', 'A small chart of the last checks, oldest first. Gaps are checks where you were not found.'],
        ]}
      />
      <p>
        Click a keyword for its full history and the competing pages from its latest check. Pin important keywords to
        keep them at the top, filter to Top 10, Improved, Not found and so on, and export the table as CSV.
      </p>
      <p>
        The <strong>Competitors</strong> tab ranks the domains that appear most often in the top 10 for your keywords,
        from the latest check. It costs nothing extra: it comes from the results you already paid for.
      </p>

      <h2 id="manage">Change and maintain a tracker</h2>
      <ul>
        <li>
          <strong>Add keywords</strong> on the Keywords tab is free. New keywords are checked on the next run, and the
          tracker shows how much they add to it.
        </li>
        <li>
          <strong>Settings</strong> changes devices, depth and schedule from the next run, with the new price shown as
          you change them.
        </li>
        <li>
          <strong>Remove</strong> keywords you no longer care about. They stop being checked and leave the list, but
          their history is kept: add the same keyword again and it comes back with every earlier position.
        </li>
        <li>
          <strong>Runs</strong> lists the last 20 checks with their cost and any error.
        </li>
        <li>
          A new schedule&apos;s first check lands one period ahead, at a random time between 04:00 and 10:00 UTC, so
          checks are spread out. Later checks keep that time: a check that starts a few minutes late does not push the
          next one back. Running a check by hand does not move the schedule.
        </li>
        <li>
          If a scheduled check comes due while you are running one by hand, it is tried again 15 minutes later rather
          than skipped.
        </li>
      </ul>

      <Callout title="Next">
        <p>
          Found a competitor that keeps outranking you? <Link href="/docs/tutorials/competitor-research">Size up a competitor</Link>.
        </p>
      </Callout>
    </DocArticle>
  );
}
