import Link from 'next/link';
import { Callout, DocTable } from '@/components/doc-blocks';
import { DocArticle } from '@/components/doc-page';
import { getDoc } from '@/content/docs';
import { pageMeta } from '@/lib/metadata';

const slug = 'mcp-tools';
const doc = getDoc(slug);

export const metadata = pageMeta({ title: doc.title, description: doc.description, path: `/docs/${slug}` });

const head = ['Tool', 'What it does', 'Cost'];

export default function McpToolsPage() {
  return (
    <DocArticle slug={slug}>
      <p>
        The MCP server at <code>{'{API_URL}'}/mcp</code> offers 60 tools. Each one calls the same REST route the
        dashboard uses, with the caller&apos;s API key, so validation, prices, caching and limits are identical. Most
        tools take an optional <code>project_id</code>; leave it out when the account has one project.
      </p>
      <Callout title="Every paid lookup also takes">
        <ul className="list-[square] space-y-1 pl-5">
          <li>
            <code>dry_run</code>: return the price only and spend nothing.
          </li>
          <li>
            <code>max_cost_usd</code>: refuse the call if its price could be higher.
          </li>
          <li>
            <code>refresh</code>: skip the cache and pay for fresh data.
          </li>
        </ul>
      </Callout>

      <h2 id="account">Account and projects</h2>
      <DocTable
        caption="Account and project tools"
        head={head}
        mono={[2]}
        rows={[
          ['whoami', 'The signed-in user and whether a YepAPI key is connected.', 'free'],
          ['get_balance', 'Remaining YepAPI balance for the key.', 'free'],
          ['get_usage', "This month's spend, by feature.", 'free'],
          ['list_projects', 'Projects with website, market and language.', 'free'],
          ['create_project', 'Create a project. The country is worked out from location_code.', 'free'],
          ['get_project', 'A project and its shared context notes.', 'free'],
          ['update_project_context', 'Replace the context notes. Read them first and send the whole object back.', 'free'],
          ['search_locations', 'Location codes for countries, regions and cities.', 'free'],
          ['list_ai_models', 'Chat models for AI visibility, and the default set.', 'free'],
        ]}
      />

      <h2 id="lookups">Paid lookups</h2>
      <p>
        The 24 lookups share their names with the REST <code>/lookups/:name</code> routes. Their inputs are listed in
        each tool&apos;s schema. Prices are YepAPI&apos;s; &quot;per 100&quot; prices are billed on rows returned, so
        the figure for the default size is the most it can cost.
      </p>
      <DocTable
        caption="Paid lookup tools"
        head={head}
        mono={[2]}
        rows={[
          ['keyword_ideas', 'Ideas or related keywords for a seed, with volume, CPC, difficulty, intent and trend.', '$0.03 + $0.03/100 (150: $0.08)'],
          ['keyword_metrics', 'Figures for your own list of up to 700 keywords, or 100 for a city.', '$0.03 + $0.03/100; city $0.15'],
          ['serp', 'Live Google results and SERP features for a query, from a country, city or point.', '$0.01 per 10 results'],
          ['autocomplete', 'Google autocomplete suggestions.', '$0.01'],
          ['keyword_trends', 'Google Trends interest for up to 5 keywords.', '$0.02'],
          ['domain_overview', 'Traffic and totals, ranking distribution and authority for a domain.', '$0.14 ($0.08 totals only)'],
          ['domain_keywords', 'Keywords a domain ranks for; filter by position or URL path.', '$0.03 + $0.03/100'],
          ['domain_pages', "A domain's pages by estimated traffic.", '$0.03 + $0.03/100'],
          ['competitors_domain', 'Domains ranking for the same keywords.', '$0.03 + $0.03/100'],
          ['competitors_serp', 'Domains ranking most for up to 200 keywords.', '$0.03 + $0.03/100'],
          ['keyword_gap', "Keywords a competitor has and you don't, or that you share.", '$0.03 + $0.03/100'],
          ['backlinks_summary', 'Backlink totals, follow split, broken links, spam score.', '$0.05'],
          ['backlinks_history', 'Monthly totals with new and lost links.', '$0.05'],
          ['backlinks_list', 'Individual backlinks, one per domain by default.', '$0.05 + $0.01/100'],
          ['backlinks_referring_domains', 'Domains linking to a target.', '$0.05 + $0.01/100'],
          ['backlinks_anchors', 'Anchor texts used in links.', '$0.05 + $0.01/100'],
          ['backlinks_pages', 'Pages that attract the most links.', '$0.05 + $0.01/100'],
          ['link_intersect', 'Domains linking to every one of 2 to 20 targets.', '$0.05 + $0.01/100'],
          ['onpage_check', 'Quick check of one URL: status, title, headings, word count.', '$0.03'],
          ['lighthouse', 'Lighthouse scores, Core Web Vitals and failed audits with a severity, most serious first.', '$0.05'],
          ['maps_search', 'Google Maps places for a query, optionally around a point.', '$0.07'],
          ['maps_place', 'A full Google Business profile.', '$0.05'],
          ['maps_reviews', 'Up to 150 reviews with owner replies.', '$0.015/100, min $0.01'],
          ['ai_compare', 'One prompt to up to 8 models side by side, with sources.', 'tokens, min $0.01 each'],
        ]}
      />

      <h2 id="keywords">Saved keywords</h2>
      <DocTable
        caption="Saved keyword tools"
        head={head}
        mono={[2]}
        rows={[
          ['list_saved_keywords', 'Saved keywords with figures and tags; search and filter by tag.', 'free'],
          ['save_keywords', 'Save keywords, with figures you already have and tags.', 'free'],
        ]}
      />

      <h2 id="rank">Rank tracking</h2>
      <DocTable
        caption="Rank tracking tools"
        head={head}
        mono={[2]}
        rows={[
          ['list_rank_trackers', 'Trackers with keyword counts, schedule, last run and the price range of a check.', 'free'],
          ['create_rank_tracker', 'Create a tracker for a location or exact point.', 'free'],
          ['add_rank_keywords', 'Add keywords to a tracker. A keyword removed earlier comes back with its history.', 'free'],
          ['run_rank_check', 'Check every keyword now, in the background. Requires max_cost_usd.', '$0.01 per page fetched'],
          ['get_rank_results', 'Positions, changes, ranking URLs, SERP features and recent history.', 'free'],
          ['get_rank_competitors', 'Domains most often in the top 10, from the latest check.', 'free'],
        ]}
      />

      <h2 id="ai">AI visibility</h2>
      <DocTable
        caption="AI visibility tools"
        head={head}
        mono={[2]}
        rows={[
          ['get_ai_visibility_setup', 'Brand, competitors, models, prompts, schedule and the price of a run.', 'free'],
          ['update_ai_visibility_setup', 'Change the brand, competitors, models, web search or schedule.', 'free'],
          ['add_ai_prompts', 'Add prompts to track.', 'free'],
          ['run_ai_visibility', 'Ask every active prompt to every model, in the background. Requires max_cost_usd; stops early instead of crossing it by more than one answer.', 'tokens, min $0.01 each'],
          ['get_ai_visibility_results', 'Rates by model, share of voice, cited domains, the prompt grid, the trend, and the change since the previous run when the two are comparable.', 'free'],
          ['get_ai_answers', 'Full answers and sources for one prompt.', 'free'],
        ]}
      />

      <h2 id="audit">Site audit</h2>
      <DocTable
        caption="Site audit tools"
        head={head}
        mono={[2]}
        rows={[
          ['start_site_audit', 'Crawl a site. With render_js, max_cost_usd is required.', 'free; $0.02/page rendered'],
          ['list_site_audits', 'Past and running audits with health scores.', 'free'],
          ['get_site_audit', 'One audit: summary and issue counts with explanations and fixes.', 'free'],
          ['get_audit_issues', 'Affected URLs, optionally one issue type or severity.', 'free'],
        ]}
      />

      <h2 id="local">Local SEO</h2>
      <DocTable
        caption="Local SEO tools"
        head={head}
        mono={[2]}
        rows={[
          ['run_geo_grid', 'Map Maps rankings across a grid around a place. Requires max_cost_usd.', '$0.07 per point'],
          ['get_geo_grid', "A grid's status, average position and the results at every point.", 'free'],
        ]}
      />

      <h2 id="google">Search Console and Analytics</h2>
      <p>
        These read the project&apos;s own Google data. The user connects Google in the dashboard under Search
        performance; an agent cannot. They are free and spend nothing from YepAPI. See{' '}
        <Link href="/docs/tutorials/search-console">Use your Search Console and Analytics data</Link>.
      </p>
      <DocTable
        caption="Search Console and Analytics tools"
        head={head}
        mono={[2]}
        rows={[
          ['get_google_connections', 'Whether Search Console and Analytics are connected, and which property.', 'free'],
          ['get_search_performance', 'Clicks, impressions, CTR and position against the previous period, daily series, countries and striking-distance queries.', 'free'],
          ['get_search_console_rows', 'Rows by up to three dimensions, filtered by position and impressions over the top 1,000.', 'free'],
          ['inspect_urls', "Google's index status for 1 to 10 URLs. Google limits inspections per day.", 'free'],
          ['get_analytics_overview', 'GA4 sessions, engagement, key events and revenue against the previous period.', 'free'],
          ['get_analytics_landing_pages', 'GA4 landing pages with engagement and key events.', 'free'],
          ['get_search_opportunities', 'Pages at positions 4 to 20 scored for where a push is most worth it.', 'free'],
        ]}
      />

      <p>
        Errors come back as tool results marked as errors, with the same message the REST API gives, so the agent can
        read them and adjust. See <Link href="/docs/errors">Errors and troubleshooting</Link>.
      </p>
    </DocArticle>
  );
}
