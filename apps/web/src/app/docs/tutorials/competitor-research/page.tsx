import Link from 'next/link';
import { Callout, DocTable, Step, Steps, Ui } from '@/components/doc-blocks';
import { DocArticle } from '@/components/doc-page';
import { getDoc } from '@/content/docs';
import { pageMeta } from '@/lib/metadata';

const slug = 'tutorials/competitor-research';
const doc = getDoc(slug);

export const metadata = pageMeta({ title: doc.title, description: doc.description, path: `/docs/${slug}` });

export default function CompetitorTutorial() {
  return (
    <DocArticle slug={slug}>
      <p>
        This tutorial goes from &quot;who are we up against?&quot; to a list of keywords and link sources to go after.
        Each step is a separate lookup with its own price, so you can stop wherever you have what you need.
      </p>

      <h2 id="who">1. Find who you compete with</h2>
      <Steps>
        <Step title="Organic competitors">
          <p>
            Open <Ui>Competitors</Ui>. On <strong>Organic competitors</strong>, your domain is filled in; click{' '}
            <Ui>Find competitors</Ui>. You get the domains that rank for the same keywords as you, with how many
            keywords you share and their estimated traffic. The top 50 costs about $0.05.
          </p>
        </Step>
        <Step title="Or: who ranks for the keywords you care about">
          <p>
            <strong>SERP competitors</strong> takes a list of up to 200 keywords instead of a domain. Click{' '}
            <Ui>Use my saved keywords</Ui> to load your saved list, highest volume first. It shows which domains appear
            most for exactly those searches, which is often a different list from the one you would write from memory.
          </p>
        </Step>
      </Steps>

      <h2 id="size">2. Size them up</h2>
      <p>
        Open <Ui>Domain overview</Ui>, enter a competitor and click <Ui>Run overview</Ui> ($0.14). You get:
      </p>
      <DocTable
        caption="Domain overview figures"
        head={['Figure', 'What it is']}
        rows={[
          ['Organic traffic', 'Estimated monthly visits from Google, and what that traffic would cost in ads.'],
          ['Organic keywords', 'Keywords the domain ranks for in the top 100.'],
          ['Backlinks, referring domains', 'Totals from the backlink index.'],
          ['Domain Rating, URL Rating', 'Link authority scores, 0 to 100.'],
          ['Ranking distribution', 'How many keywords sit in each position range, and how many are new, improved, declined or lost.'],
        ]}
      />
      <p>
        Below it, <strong>Top keywords</strong> and <strong>Top pages</strong> list what brings the traffic in. Filter
        top keywords by position or by a URL path such as <code>/blog/</code> to study one section of a site. These
        lists are paged and each page is a separate lookup; the price per page is shown next to the pager.
      </p>

      <h2 id="gap">3. Find the keyword gap</h2>
      <Steps>
        <Step title="Pick a competitor">
          <p>
            Click a competitor&apos;s name in either competitor list, or open the <strong>Keyword gap</strong> tab and
            type it in.
          </p>
        </Step>
        <Step title="Gap or shared">
          <p>
            <strong>Gap</strong> lists keywords they rank for and you do not: new ground to cover.{' '}
            <strong>Shared</strong> lists keywords you both rank for, with each side&apos;s position and how many places
            you trail by. Use Min volume and Max difficulty to keep it to realistic targets.
          </p>
        </Step>
        <Step title="Save the opportunities">
          <p>
            Select rows and click <Ui>Save N selected</Ui> to add them to your saved keywords, with their volume,
            difficulty and intent. From there you can track them.
          </p>
        </Step>
      </Steps>

      <h2 id="links">4. See where their links come from</h2>
      <p>
        Open <Ui>Backlinks</Ui>, enter the competitor (a domain, a subdomain, or one exact page as a full URL) and click{' '}
        <Ui>Run summary + history</Ui> for the totals and a monthly chart of links gained and lost ($0.10). Then use the
        tabs:
      </p>
      <ul>
        <li>
          <strong>Backlinks</strong>: individual links, by default the strongest one from each linking domain. Filter
          live or lost links and dofollow only.
        </li>
        <li>
          <strong>Referring domains</strong> and <strong>Anchors</strong>: who links, and with which words.
        </li>
        <li>
          <strong>Top pages</strong>: which of their pages attract links. These are the formats worth copying.
        </li>
        <li>
          <strong>Link intersect</strong>: enter two or more competitors to find sites linking to all of them. Those are
          the most likely to link to you too.
        </li>
      </ul>

      <Callout title="Spending tip">
        <p>
          Every lookup is cached for a day or more, so going back to a competitor you looked at this week is free. Each
          list can be exported to CSV.
        </p>
      </Callout>
    </DocArticle>
  );
}
