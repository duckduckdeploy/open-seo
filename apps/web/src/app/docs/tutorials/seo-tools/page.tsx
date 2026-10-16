import Link from 'next/link';
import { Callout, DocTable, Ui } from '@/components/doc-blocks';
import { DocArticle } from '@/components/doc-page';
import { Screenshot } from '@/components/screenshot';
import { getDoc } from '@/content/docs';
import { pageMeta } from '@/lib/metadata';

const slug = 'tutorials/seo-tools';
const doc = getDoc(slug);

export const metadata = pageMeta({ title: doc.title, description: doc.description, path: `/docs/${slug}` });

export default function SeoToolsGuide() {
  return (
    <DocArticle slug={slug}>
      <p>
        The SEO tools sit under <Ui>SEO tools</Ui> in the app&apos;s sidebar, and work without a project. Each one is a
        single view: you search once and everything it shows loads together. This guide goes through every tool screen
        by screen. The screenshots are of the real app.
      </p>

      <h2 id="searching">How a search works</h2>
      <Screenshot
        name="search-bar"
        alt="The search row: keyword, country, city or state, language and the Analyse button, with the price"
        caption="What to look up, then the market, then the button. The price of the whole search shows underneath."
      />
      <p>
        Every tool starts from one row: what to look up (a keyword, a domain or a URL), the <strong>country</strong>, a{' '}
        <strong>city or state</strong> where the tool can use one, and the <strong>language</strong>. Press Enter and
        every lookup the view needs runs at once. The price of the whole search shows under the row before you run it.
      </p>
      <p>
        The search and the market are part of the page address, for example{' '}
        <code>/tools/keyword-overview?q=standing+desk&amp;country=us&amp;lang=en</code>. Reload it, bookmark it or send
        it to a colleague and you get the same view. The back button returns to the previous search. Running the same
        search again within the cache period is free.
      </p>
      <DocTable
        caption="What the address of a view holds"
        head={['Part', 'Meaning']}
        rows={[
          ['q, domain, url, target', 'What is looked up: a keyword, a domain, a page or a backlink target.'],
          ['country', 'Two-letter country code, such as us or de.'],
          ['lang', 'Search language, such as en or de.'],
          ['loc', 'A city, state or region inside the country (optional).'],
          ['tab, view and filters', 'Which part of the view is open, and how it is filtered.'],
        ]}
      />
      <p>
        When you change the country, city or language, the choice is remembered. The next tool you open starts in the same
        market.
      </p>

      <h2 id="keyword-overview">Keyword overview</h2>
      <p>Everything about one keyword. Search it, and four cards sum it up:</p>
      <Screenshot
        name="keyword-overview-cards"
        alt="Four cards: keyword difficulty, search volume, traffic potential and search volume by country"
        caption="Difficulty, volume, traffic potential and volume by country for standing desk in the United States."
      />
      <ul>
        <li>
          <strong>Keyword difficulty</strong>, 0 to 100, with roughly how many linking sites the pages in the top 10 have.
          With authority metrics on, the average Domain Rating of the top 10 is added.
        </li>
        <li>
          <strong>Search volume</strong> per month, the last 12 months as bars, the cost per click in Google Ads and how
          much advertisers compete for it.
        </li>
        <li>
          <strong>Traffic potential</strong>: the traffic the top result gets from all the keywords it ranks for, or an
          estimate from this keyword when that is not known, with the top result itself.
        </li>
        <li>
          <strong>Search volume by country</strong>: the same keyword in five other large markets, to see where the demand
          is.
        </li>
      </ul>
      <Callout title="Topics without Google Ads volume">
        <p>
          Google Ads reports no volume for some topics, such as VPNs. For those, the overview uses a clickstream
          estimate instead and labels it as one.
        </p>
      </Callout>

      <h3 id="keyword-ideas-columns">Keyword ideas</h3>
      <Screenshot
        name="keyword-overview-ideas"
        alt="Four columns: terms match, questions, also rank for and search suggestions"
        caption="Click any keyword to open its own overview; View all opens the full list in Keyword ideas."
      />
      <p>
        <strong>Terms match</strong> lists keywords that contain the topic, <strong>Questions</strong> the questions people
        ask, <strong>Also rank for</strong> what the ranking pages also rank for, and <strong>Search suggestions</strong>{' '}
        Google&apos;s own autocomplete. Below the cards, the volume of the last few years is charted month by month.
      </p>

      <h3 id="serp-overview">SERP overview</h3>
      <Screenshot
        name="keyword-overview-serp"
        alt="The top Google results with SERP features in place and authority metrics for every page"
        caption="With authority metrics on: words, Domain Rating, URL Rating, backlinks, linking domains, traffic, its value and keywords of each page."
      />
      <p>
        The results page as Google lays it out. Blocks such as an AI overview, People also ask, a local pack or product
        listings take their place in the numbering, so you see where the organic results really start. Each result shows
        how many visits this keyword sends it. Click a site&apos;s name for its domain overview, or the icons for the page
        analyser and its backlinks.
      </p>
      <p>
        Turn on <strong>Authority metrics</strong> to add each page&apos;s Domain Rating, URL Rating, links and traffic. It
        is a setting, remembered in your browser, and costs $0.02 per result, which the price includes.
      </p>

      <h2 id="local">City and state level</h2>
      <Screenshot
        name="search-bar-city"
        alt="The search row with Austin, Texas chosen"
        caption="Pick a city, state or region inside the country, or clear it with × to use the whole country."
      />
      <Screenshot name="keyword-overview-local" alt="Local search volume in Austin, Texas next to the figure for the whole United States" caption="Local volume next to the national figure." />
      <p>
        Keyword volume, the live results and Google suggestions are available for a city or state. Difficulty, intent and
        keyword ideas stay national, which is all the data provider has below country level. Domain, backlink and
        competitor data is always for the whole country.
      </p>

      <h2 id="keyword-ideas">Keyword ideas</h2>
      <Screenshot name="keyword-ideas" window alt="The keyword ideas list for standing desk with view tabs and filters" />
      <p>
        Hundreds of keywords from one seed: matching terms, related searches and Google suggestions in one list, with
        volume, difficulty, cost per click, intent, advertiser competition and a 12-month trend. The tabs above the list
        switch between all ideas and each kind, including questions. The filters, words to include, intent, minimum volume,
        maximum difficulty and minimum words, work on what is loaded and cost nothing.
      </p>
      <p>
        With a city or state chosen, the 100 ideas with the most volume also get their local volume. Tick rows and{' '}
        <Ui>Save selected</Ui> to add them to a project, or <Ui>Export CSV</Ui>.
      </p>

      <h2 id="serp-checker">SERP checker</h2>
      <Screenshot
        name="serp-checker-table"
        alt="The SERP checker for standing desk: volume, difficulty and intent, the features on the page and each result with its metrics"
        caption="The keyword's volume, difficulty and intent sit above the results."
      />
      <p>
        The same results table as in the keyword overview, on its own, with a <strong>device</strong> choice: desktop or
        mobile. Use it to check a results page in a city, or on phones, without the rest of the overview.
      </p>

      <h2 id="domain-overview">Domain overview</h2>
      <Screenshot name="domain-overview-metrics" alt="Domain Rating, organic traffic, organic keywords, backlinks, referring domains and paid keywords" />
      <p>
        Any website at a glance, in the market you pick: <strong>Domain Rating</strong>, estimated{' '}
        <strong>organic traffic</strong> and what it would cost in ads, how many keywords it ranks for, its backlinks and
        referring domains, and its paid keywords.
      </p>
      <Screenshot
        name="domain-overview-positions"
        alt="A bar chart of keywords by Google position with new, improved, declined and lost counts"
        caption="Blue bars are the top 10. Movement compares with the provider's previous update."
      />
      <Screenshot
        name="domain-overview-keywords"
        alt="Top keywords of zapier.com with position, volume, traffic, share, CPC and ranking URL"
        caption="The 100 keywords that bring the most traffic. Top pages and Competitors are one tab away."
      />
      <p>
        <strong>Top keywords</strong> lists the keywords that bring the most traffic, with position, volume, the share of
        the site&apos;s traffic and the ranking page; filter by text or position. <strong>Top pages</strong> lists the pages
        with the most traffic and how many keywords each ranks for. <strong>Competitors</strong> lists the sites that rank
        for the same keywords, each a click from the keyword gap.
      </p>

      <h2 id="page-analyser">Page analyser</h2>
      <Screenshot name="page-analyser" window alt="Page analyser for a blog post: URL rating, Domain Rating, referring domains, backlinks, traffic and keywords" />
      <p>One page, inside and out. Paste its address to see its authority and links, then its on-page basics:</p>
      <Screenshot
        name="page-analyser-onpage"
        alt="Status, title, meta description, H1 and content checks"
        caption="Titles over 60 characters and descriptions over 160 may be cut off in results; both are flagged."
      />
      <Screenshot name="page-analyser-keywords" alt="Keywords the page ranks for, with position, volume, traffic and CPC" caption="Every keyword this page ranks for in the top 20." />
      <p>Further down, its strongest backlinks, one per linking site, with a link to the full backlink report.</p>

      <h2 id="backlinks">Backlink checker</h2>
      <Screenshot name="backlinks" window alt="Backlink totals for zapier.com" />
      <p>
        For a domain, a subdomain or one exact page (enter the full URL). The totals show backlinks, referring domains,
        the dofollow share, broken links and the spam score. Backlinks are worldwide, so there is no market to pick.
      </p>
      <Screenshot name="backlinks-history" alt="Charts of backlinks and referring domains over time and links gained and lost each month" caption="The link profile over time, and the links gained and lost each month." />
      <Screenshot
        name="backlinks-list"
        alt="The strongest backlinks with linking page, anchor, target, type, authority and dates"
        caption="The strongest live link from each linking site. The other tabs: referring domains, anchors, top linked pages and link intersect."
      />
      <p>
        <strong>Link intersect</strong> takes competitors and lists the sites that link to all of them: the likeliest to
        link to you next.
      </p>

      <h2 id="competitors">Competitors and keyword gap</h2>
      <Screenshot name="competitors" window alt="Organic competitors of zapier.com" />
      <p>
        Enter your domain to see the sites that compete with it in Google, with how many keywords you share and their
        traffic. Click one, or a suggested competitor, for the keyword gap:
      </p>
      <Screenshot
        name="keyword-gap"
        alt="Keyword gap between todoist.com and ticktick.com"
        caption="Keywords only the competitor ranks for, and keywords you both rank for, loaded together."
      />
      <p>
        <strong>SERP competitors</strong> takes a list of keywords instead and shows which domains rank most for them.
        For the full workflow, see <Link href="/docs/tutorials/competitor-research">Size up a competitor</Link>.
      </p>

      <h2 id="ai-visibility">AI visibility checker</h2>
      <Screenshot name="ai-visibility" window alt="The AI visibility checker with a question, the assistants chosen and the summary of what they cited" />
      <p>
        Type a question your customers would ask an AI assistant. ChatGPT, Gemini, Claude and Perplexity answer it with web
        search on; tick Grok, Meta AI or DeepSeek to add them. In <strong>Your site, brand</strong>, enter your domain and
        any names your brand goes by, separated by commas, such as <code>upliftdesk.com, Uplift</code>.
      </p>
      <Screenshot
        name="ai-visibility-sites"
        alt="The most cited sites, with the assistants that cite each one and their place in each list"
        caption="Sites more assistants cite come first, then those cited higher in their lists."
      />
      <Screenshot
        name="ai-visibility-order"
        alt="One column per assistant listing its sources in order"
        caption="Each assistant's sources in the order it gave them. Hover a site to see where else it appears."
      />
      <p>
        Links are cleaned before they are compared: tracking parameters are removed, and Gemini&apos;s redirect links are
        followed to the page they point at. A site is <strong>cited</strong> when one of its pages is a source, and{' '}
        <strong>named</strong> when your domain or brand appears in the answer&apos;s text. To ask the same questions
        regularly and follow the trend, use AI visibility in a project.
      </p>

      <h2 id="local-rank">Local rank checker</h2>
      <Screenshot name="local-rank" window alt="The local rank checker for dentist around Austin, Texas" />
      <p>
        Enter what people search on Google Maps, a country and a city or area, then the grid: 3 × 3, 5 × 5 or 7 × 7 points,
        0.5 to 5 km apart. Each point runs a Maps search biased to that spot and keeps the top 20 businesses.
      </p>
      <Screenshot
        name="local-rank-grid"
        alt="A grid of rank numbers next to the businesses ranked by top-3 coverage"
        caption="The selected business's rank at each point; north is up and the centre is outlined."
      />
      <p>
        The table ranks every business by how many points it holds a top-3 place, with how many it appears in at all, its
        average rank, rating and reviews. Click any business to see its grid: every business&apos;s place is already in the
        results, so it costs nothing. To check one business on a schedule, run geo-grids in a project.
      </p>

      <h2 id="costs">What a search costs</h2>
      <p>
        Each view runs several lookups, so its price is the sum of theirs, shown before you search. Results are cached for
        a day or more: searching the same thing again, reloading, or going back is free until then. The line above each
        result says what it cost, or that it came from the cache, and <Ui>Refresh (pay again)</Ui> fetches fresh data. See{' '}
        <Link href="/docs/costs-and-limits">Costs, caching and limits</Link>.
      </p>
    </DocArticle>
  );
}
