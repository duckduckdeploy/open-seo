import Link from 'next/link';
import { Callout, DocTable, Step, Steps, Ui } from '@/components/doc-blocks';
import { DocArticle } from '@/components/doc-page';
import { getDoc } from '@/content/docs';
import { pageMeta } from '@/lib/metadata';

const slug = 'tutorials/keyword-research';
const doc = getDoc(slug);

export const metadata = pageMeta({ title: doc.title, description: doc.description, path: `/docs/${slug}` });

export default function KeywordResearchTutorial() {
  return (
    <DocArticle slug={slug}>
      <p>
        By the end of this tutorial you will have a tagged list of keywords worth targeting, with volume, difficulty,
        intent and a 12-month trend for each. It costs a few cents. You need a project and a YepAPI key; see{' '}
        <Link href="/docs/getting-started">Getting started</Link> if you have neither.
      </p>

      <h2 id="find">Find keywords</h2>
      <Steps>
        <Step title="Open Keyword research">
          <p>
            In your project, choose <Ui>Keyword research</Ui> in the sidebar.
          </p>
        </Step>
        <Step title="Enter a seed and choose a source">
          <p>
            Type a term your customers would search for, such as <code>plumbing software</code>. Then pick a source:
          </p>
          <ul className="list-[square] space-y-1 pl-5">
            <li>
              <strong>Ideas</strong> returns keywords on the same topic. Start here.
            </li>
            <li>
              <strong>Related searches</strong> returns what people also search for around the seed. It can add a
              second, clickstream-based volume estimate, which doubles the price.
            </li>
          </ul>
        </Step>
        <Step title="Narrow it down before you pay">
          <p>
            Set <strong>Results</strong> (up to 50, 150, 300 or 500) and, if you want, <strong>Min volume</strong>,{' '}
            <strong>Max difficulty</strong> and <strong>Min words</strong>. Three or more words finds long-tail
            keywords. Filters are applied by YepAPI, so you pay only for the rows you get.
          </p>
          <p>
            <strong>Market</strong> defaults to your project&apos;s country. Change it to research another country
            without changing the project.
          </p>
        </Step>
        <Step title="Check the price, then run">
          <p>
            The price appears next to <Ui>Find keywords</Ui>, for example <code>$0.03 – $0.08</code> for up to 150
            results. Click it to run. The same search within 7 days is free.
          </p>
        </Step>
      </Steps>

      <h2 id="read">Read the results</h2>
      <DocTable
        caption="Keyword research columns"
        head={['Column', 'What it tells you']}
        rows={[
          ['Volume', 'Average monthly searches in the market.'],
          ['CPC', 'What advertisers pay per click in Google Ads: a sign of commercial value.'],
          ['KD', 'Keyword difficulty, 0 (easy) to 100 (hard). Green under 30, amber under 60, red above.'],
          ['Intent', 'Informational, commercial, transactional or navigational. Transactional and commercial are the buying intents.'],
          ['Competition', 'Advertiser competition in Google Ads, 0 to 1.'],
          ['12-mo trend', 'Monthly volume over the last year, to spot seasonality.'],
        ]}
      />
      <p>
        Sort by any column, and use the text and intent filters above the table to narrow what you see. These filters
        are free; they work on the results you already have.
      </p>
      <p>
        Click a keyword to open its Google results in a side panel. <Ui>Load results</Ui> fetches the live top 20 for
        desktop or mobile ($0.02), with the SERP features on the page and the &quot;People also ask&quot; questions.
      </p>

      <h2 id="save">Save the keywords worth targeting</h2>
      <Steps>
        <Step title="Select rows">
          <p>Tick the keywords you want. The header checkbox selects every row shown.</p>
        </Step>
        <Step title="Save them">
          <p>
            Click <Ui>Save N selected</Ui>. Saving is free: the figures on screen are stored with each keyword. Saving a
            keyword again updates its figures and keeps its tags.
          </p>
        </Step>
        <Step title="Organise with tags">
          <p>
            Open <Ui>Saved keywords</Ui>. Select keywords and use <Ui>Add tag</Ui> to group them by topic, page or
            priority, then click a tag above the table to filter by it. Search, sort and paging all work on the whole
            list.
          </p>
        </Step>
      </Steps>

      <h2 id="maintain">Keep the list fresh</h2>
      <p>
        Saved keywords keep the figures they were saved with. To refresh them, click <Ui>Update metrics</Ui> on the
        Saved keywords page. It shows how many keywords it will update and the most it will cost ($0.03 plus $0.03 per
        100 keywords, per batch of 700) before you confirm.
      </p>
      <p>
        The update covers keywords saved in the project&apos;s market and language. Keywords you saved while researching
        another market are left as they are, and the panel says how many.
      </p>
      <p>
        You can also paste keywords you already have with <Ui>Add keywords</Ui>. They are added for free without
        figures; run <Ui>Update metrics</Ui> to fill them in. <Ui>Export CSV</Ui> downloads the whole list, or the part
        matching your search and tag.
      </p>

      <Callout title="Next">
        <p>
          Put your best keywords in a rank tracker to see where you stand: <Link href="/docs/tutorials/rank-tracking">Track your rankings</Link>.
        </p>
      </Callout>
    </DocArticle>
  );
}
