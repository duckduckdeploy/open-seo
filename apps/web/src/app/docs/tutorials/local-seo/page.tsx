import Link from 'next/link';
import { Callout, DocTable, Step, Steps, Ui } from '@/components/doc-blocks';
import { DocArticle } from '@/components/doc-page';
import { Screenshot } from '@/components/screenshot';
import { getDoc } from '@/content/docs';
import { pageMeta } from '@/lib/metadata';

const slug = 'tutorials/local-seo';
const doc = getDoc(slug);

export const metadata = pageMeta({ title: doc.title, description: doc.description, path: `/docs/${slug}` });

export default function LocalSeoTutorial() {
  return (
    <DocArticle slug={slug}>
      <p>
        Local SEO works from your Google Business listing: find it once, then check how complete its profile is, read
        its reviews, and map how well it ranks across the area you serve.
      </p>

      <h2 id="find">Find your business</h2>
      <Steps>
        <Step title="Search Google Maps">
          <p>
            Open <Ui>Local SEO</Ui>. On <strong>Find a business</strong>, search for your business the way a customer
            would; the name with the town works best, for example <code>Acme Plumbing Austin</code>. Click{' '}
            <Ui>Search Maps</Ui> ($0.07; a repeat within a day is free). Tick <strong>Prefer results around a point</strong>{' '}
            if your business shares its name with others elsewhere.
          </p>
        </Step>
        <Step title="Mark it as yours">
          <p>
            Click <Ui>This is my business</Ui> on your listing. The choice is remembered in this browser for this
            project, and the other tabs work on it.
          </p>
        </Step>
      </Steps>

      <h2 id="profile">Check the profile</h2>
      <p>
        On <strong>Profile</strong>, click <Ui>Load profile</Ui> ($0.05). OpenSEO checks it against what a complete
        listing needs:
      </p>
      <DocTable
        caption="Profile checks"
        head={['Check', 'Passes when']}
        rows={[
          ['Phone number', 'A phone number is listed.'],
          ['Website', 'The listing links to a website.'],
          ['Opening hours', 'Hours are listed.'],
          ['Categories', 'There is more than one category.'],
          ['Photos', 'At least 5 photos.'],
          ['Rating', 'A rating of 4.0 or higher from at least 10 reviews.'],
        ]}
      />

      <h2 id="reviews">Read the reviews</h2>
      <p>
        On <strong>Reviews</strong>, choose how many (10 to 150) and the order, then click <Ui>Get reviews</Ui>. It costs
        $0.015 per 100 reviews, at least $0.01. You get the rating breakdown, the average of the sample and the owner
        reply rate, then every review with its reply. Reviews without a reply are flagged; answering them is one of the
        easiest wins in local search.
      </p>

      <h2 id="grid">Map your rankings with a geo-grid</h2>
      <p>
        Local results change from one street to the next. A geo-grid runs the same Maps search from a grid of points
        around your business and records your place in the results at each one.
      </p>
      <Screenshot
        name="local-grid"
        alt="A 7 by 7 grid of positions for office furniture over a map of Austin, next to the top places at the selected point"
        caption="A 7 × 7 grid for “office furniture” around a showroom in Austin, 2 km between points."
      />
      <Steps>
        <Step title="Choose a keyword, a size and a spacing">
          <p>
            On <strong>Geo-grid</strong>, enter what a customer types, such as <code>plumber</code>. Choose the grid
            size (3×3, 5×5, 7×7 or 9×9 points) and the distance between points. The form shows how far across the grid
            reaches.
          </p>
        </Step>
        <Step title="Confirm the price and run">
          <p>
            Each point is one Maps search at $0.07: 3×3 is $0.63, 5×5 is $1.75, 7×7 is $3.43 and 9×9 is $5.67. Click{' '}
            <Ui>Run grid</Ui> and confirm. You can cancel a running grid; points already searched are kept and billed.
          </p>
        </Step>
        <Step title="Read the map">
          <p>
            Each cell shows your position at that point: green for 1–3, yellow for 4–10, amber for 11–20, grey when you
            are not in the top 20. The pin marks your business. Hover or tap a cell to see the top places there, with
            yours highlighted. The grid also gives your average position where you were found, and in how many points.
          </p>
        </Step>
      </Steps>

      <Callout title="How exact is a geo-grid?">
        <p>
          Positions come from Google Places ordering for a search centred on each point. They are a strong signal of
          where you are visible, but the Maps app personalises results, so someone standing at a point may see a
          slightly different order. Compare grids over time rather than reading one cell as fact.
        </p>
      </Callout>

      <p>
        For rankings in the normal Google results from an exact spot, use a rank tracker with exact coordinates; see{' '}
        <Link href="/docs/tutorials/rank-tracking">Track your rankings</Link>.
      </p>
    </DocArticle>
  );
}
