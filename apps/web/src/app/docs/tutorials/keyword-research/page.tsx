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
        <Step title="Enter a seed and a market">
          <p>
            Type a term your customers would search for, such as <code>plumbing software</code>. Next to it, the
            country and language default to your project&apos;s; change them to research another market. Pick a city or
            state as well to get local volume for the top 100 ideas.
          </p>
        </Step>
        <Step title="Check the price, then press Enter">
          <p>
            The price of the whole search shows under the search box before anything runs. Press Enter: matching terms,
            related terms, questions and Google&apos;s suggestions all load together into one list. The same search
            within 7 days is free.
          </p>
        </Step>
        <Step title="Narrow it down for free">
          <p>
            Switch between <strong>All ideas</strong>, <strong>Matching terms</strong>, <strong>Related terms</strong>,{' '}
            <strong>Questions</strong> and <strong>Search suggestions</strong>, and filter by words, intent,{' '}
            <strong>Min volume</strong>, <strong>Max KD</strong> and <strong>Min words</strong> (three or more finds
            long-tail keywords). These work on what is loaded and cost nothing. The search, the market, the view and the
            filters are all in the page address, so you can bookmark or share the exact view.
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
        Click a keyword to open its <strong>Keyword overview</strong>: difficulty, volume by country, traffic potential,
        more ideas and the live top 10 with each result&apos;s authority, all for the same market.
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
