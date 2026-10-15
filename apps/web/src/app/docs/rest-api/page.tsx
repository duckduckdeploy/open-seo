import Link from 'next/link';
import { Callout, DocTable } from '@/components/doc-blocks';
import { CodeBlock } from '@/components/code-block';
import { DocArticle } from '@/components/doc-page';
import { getDoc } from '@/content/docs';
import { pageMeta } from '@/lib/metadata';

const slug = 'rest-api';
const doc = getDoc(slug);

export const metadata = pageMeta({ title: doc.title, description: doc.description, path: `/docs/${slug}` });

const example = `# Price a lookup (free), then run it with a ceiling
curl -X POST "$API_URL/api/projects/$PROJECT/lookups/keyword_ideas?dryRun=1" \\
  -H "Authorization: Bearer $OSEO_KEY" -H "Content-Type: application/json" \\
  -d '{"keyword":"emergency plumber","limit":150}'

curl -X POST "$API_URL/api/projects/$PROJECT/lookups/keyword_ideas?maxCostUsd=0.10" \\
  -H "Authorization: Bearer $OSEO_KEY" -H "Content-Type: application/json" \\
  -d '{"keyword":"emergency plumber","limit":150}'`;

const reply = `{
  "ok": true,
  "data": {
    "name": "keyword_ideas",
    "estimate": { "min": 0.03, "max": 0.08 },
    "data": { "seed": "emergency plumber", "keywords": [ ... ] },
    "costUsd": 0.08,
    "cached": false,
    "fetchedAt": "2026-10-15T09:30:00.000Z"
  }
}`;

const LOOKUPS =
  'keyword_ideas, keyword_metrics, serp, autocomplete, keyword_trends, domain_overview, domain_keywords, domain_pages, competitors_domain, competitors_serp, keyword_gap, backlinks_summary, backlinks_history, backlinks_list, backlinks_referring_domains, backlinks_anchors, backlinks_pages, link_intersect, onpage_check, lighthouse, maps_search, maps_place, maps_reviews, ai_compare';

export default function RestApiPage() {
  return (
    <DocArticle slug={slug}>
      <p>
        The dashboard is built on this API, so anything you can do in the app you can script. The base URL is{' '}
        <code>{'{API_URL}'}/api</code> (<code>http://localhost:4100/api</code> on a default self-hosted install).
      </p>

      <h2 id="auth">Authentication</h2>
      <p>
        Send an OpenSEO API key as <code>Authorization: Bearer oseo_…</code>. Create keys under Settings; a key is shown
        once and acts as you, so treat it like a password. Keys can be revoked at any time and cannot create further
        keys. The dashboard itself uses a session cookie and may only make changes from its own origin.
      </p>
      <p>
        Apps that sign in with OAuth, such as ChatGPT, get short-lived access tokens (<code>oseo_at_…</code>) that work
        the same way. OpenSEO is an OAuth 2.1 authorization server for its MCP endpoint, with discovery at{' '}
        <code>/.well-known/oauth-protected-resource</code> and <code>/.well-known/oauth-authorization-server</code>,
        dynamic client registration, PKCE (S256) and rotating refresh tokens. Like API keys, these tokens cannot create
        keys or connect Google accounts.
      </p>

      <h2 id="envelope">Responses</h2>
      <p>
        Every response is JSON: <code>{'{ "ok": true, "data": … }'}</code> on success, or{' '}
        <code>{'{ "ok": false, "error": { "code", "message", "details?" } }'}</code> with a 4xx or 5xx status. Codes are
        listed in <Link href="/docs/errors">Errors and troubleshooting</Link>. IDs are UUIDs; a malformed one is a 404.
      </p>

      <h2 id="lookups">Lookups</h2>
      <p>
        <code>POST /projects/:projectId/lookups/:name</code> runs one paid lookup with its input as the JSON body. Inputs
        are validated before anything is spent; omitted market fields default to the project&apos;s.
      </p>
      <DocTable
        caption="Lookup query parameters"
        head={['Parameter', 'Effect']}
        mono={[0]}
        rows={[
          ['?dryRun=1', 'Return { estimate: { min, max } } and spend nothing. max is null for token-priced lookups.'],
          ['?refresh=1', 'Skip the cache and pay for fresh data.'],
          ['?maxCostUsd=0.50', 'Refuse with cost_ceiling_exceeded if the worst-case price is higher. Must be a positive number.'],
        ]}
      />
      <CodeBlock label="Terminal" code={example} />
      <CodeBlock label="Reply" code={reply} />
      <p>
        <code>cached: true</code> results have <code>costUsd: 0</code>. If some parts of a multi-part lookup (the
        domain overview) fail, the parts that were paid for are returned with an <code>errors</code> list and are not
        cached. Names: {LOOKUPS}. <code>GET /lookups</code> lists them with descriptions and cache times.
      </p>

      <h2 id="account">Account</h2>
      <DocTable
        caption="Account routes"
        head={['Route', 'Notes']}
        mono={[0]}
        rows={[
          ['GET /me', 'User and settings: whether a YepAPI key is set, its hint, the monthly limit.'],
          ['PUT /settings/yepapi-key', '{ apiKey }. Verified without spending credits. Never returned.'],
          ['DELETE /settings/yepapi-key', 'Remove the key.'],
          ['PUT /settings/budget', '{ monthlyBudgetUsd: number | null }.'],
          ['GET /balance', 'Live YepAPI balance. Free, and works when the monthly limit is reached.'],
          ['GET /usage', "This month's spend in total, by feature and by day, and the last 50 calls."],
          ['GET, POST /api-keys; DELETE /api-keys/:id', 'List, create ({ name }; the key is in the reply once) and revoke. Creating needs a signed-in session.'],
          ['GET /locations?q=&country=', 'Location codes. Free.'],
          ['GET /ai/models', 'The chat model catalog and the default set.'],
        ]}
      />

      <h2 id="projects">Projects</h2>
      <p>
        <code>GET/POST /projects</code>, <code>GET/PATCH/DELETE /projects/:projectId</code>. Fields: <code>name</code>,{' '}
        <code>domain</code>, <code>locationCode</code>, <code>locationName</code>, <code>country</code>,{' '}
        <code>language</code>, <code>context</code> (free-form notes for agents). When <code>locationCode</code> comes
        without <code>country</code>, the country (and a missing name) is looked up from the code; an unknown code is
        refused rather than guessed. Deleting a project deletes everything in it.
      </p>

      <h2 id="saved">Saved keywords</h2>
      <DocTable
        caption="Saved keyword routes"
        head={['Route', 'Notes']}
        mono={[0]}
        rows={[
          ['GET /projects/:id/saved-keywords', '?q= &tag= &sort=keyword|volume|cpc|difficulty|createdAt &order= &limit= (max 500) &offset=. Returns { total, keywords, tags }.'],
          ['POST /projects/:id/saved-keywords', '{ keywords: [{ keyword, volume?, cpc?, competition?, difficulty?, intent?, trend? }], tags?, locationCode?, language? }. Up to 1,000; saving again updates figures and merges tags.'],
          ['PATCH /projects/:id/saved-keywords/tags', '{ ids, add?, remove? }.'],
          ['POST /projects/:id/saved-keywords/delete', '{ ids }.'],
          ['POST /projects/:id/saved-keywords/refresh', 'Paid. Refreshes keywords in the project’s market and language. ?dryRun=1 returns { estimate: { keywords, otherMarkets, min, max } }.'],
        ]}
      />

      <h2 id="rank">Rank tracking</h2>
      <DocTable
        caption="Rank tracking routes"
        head={['Route', 'Notes']}
        mono={[0]}
        rows={[
          ['GET, POST /projects/:id/trackers', 'Create with { domain, locationCode or latitude + longitude, locationName, language?, devices?, depth? (10–100, by 10), schedule?, keywords? }.'],
          ['GET, PATCH, DELETE /trackers/:trackerId', 'PATCH { name?, devices?, depth?, schedule? }. GET includes the price range of one check and the last 20 runs.'],
          ['POST /trackers/:trackerId/keywords', '{ keywords }. Up to 1,000 per tracker.'],
          ['POST /trackers/:trackerId/keywords/delete', '{ ids }. Removed keywords stop being checked; their history is kept, and adding one again restores it.'],
          ['PATCH /trackers/:trackerId/keywords/:keywordId', '{ pinned?, tags? }.'],
          ['POST /trackers/:trackerId/runs', 'Paid. 202 with the queued run; 409 if one is already going.'],
          ['GET /rank-runs/:runId; POST /rank-runs/:runId/cancel', 'Poll progress and cost; cancel.'],
          ['GET /trackers/:trackerId/results?device=', 'Latest positions, changes, history and a summary.'],
          ['GET /trackers/:trackerId/competitors?device=', 'Domains most often in the top 10.'],
          ['GET /trackers/:trackerId/keywords/:keywordId/history?device=', 'Every check for one keyword and the competing results of the latest.'],
        ]}
      />

      <h2 id="ai">AI visibility</h2>
      <DocTable
        caption="AI visibility routes"
        head={['Route', 'Notes']}
        mono={[0]}
        rows={[
          ['GET /projects/:id/ai', 'Settings, prompts, the active run and the estimate { answers, min, expected }.'],
          ['PUT /projects/:id/ai/settings', '{ brand?, brandAliases?, domain?, competitors?, models?, webSearch?, schedule? }.'],
          ['POST /projects/:id/ai/prompts; POST …/prompts/delete', '{ prompts, topic? } and { ids }. Up to 200 per project.'],
          ['PATCH /projects/:id/ai/prompts/:promptId', '{ active?, topic? }.'],
          ['POST /projects/:id/ai/suggest-prompts', 'Paid (tokens). { description, count? }.'],
          ['POST /projects/:id/ai/runs', 'Paid. { maxCostUsd? }: refused if the likely cost is higher, and stopped early (status cancelled) before an answer that would likely cross it.'],
          ['GET /projects/:id/ai/runs/:runId; POST …/cancel', 'Poll and cancel.'],
          ['GET /projects/:id/ai/results', 'The latest run in detail, the trend, and comparison: { status: comparable | incomplete | scope_changed | no_previous | no_data, mentionChange, citeChange, cells }. Prompts that name the brand and failed or empty answers are left out of rates.'],
          ['GET /projects/:id/ai/prompts/:promptId/answers', 'Every stored answer for a prompt.'],
        ]}
      />

      <h2 id="audit">Site audit</h2>
      <DocTable
        caption="Site audit routes"
        head={['Route', 'Notes']}
        mono={[0]}
        rows={[
          ['GET, POST /projects/:id/audits', 'POST { startUrl?, maxPages? (≤ 5,000), renderJs? (≤ 500 pages) }; ?dryRun=1 for the price. A plain crawl is free.'],
          ['GET, DELETE /audits/:auditId; POST /audits/:auditId/cancel', 'GET includes the summary and issue groups with explanations.'],
          ['GET /audits/:auditId/issues', '?type= &severity= &limit= (≤ 1,000) &offset=.'],
          ['GET /audits/:auditId/pages', '?q= &sort=issues|url|status|words|response|depth &limit= &offset=.'],
          ['GET /audits/:auditId/pages/:pageId', 'Everything recorded for one page, and its issues.'],
          ['GET /audit/issue-catalog', 'Every issue type with severity, explanation and fix.'],
        ]}
      />

      <h2 id="local">Local SEO</h2>
      <DocTable
        caption="Local SEO routes"
        head={['Route', 'Notes']}
        mono={[0]}
        rows={[
          ['GET, POST /projects/:id/geo-grids', 'POST { keyword, placeId, placeName, centerLat, centerLng, size (3|5|7|9), spacingM (100–20,000) }; ?dryRun=1 for the price ($0.07 a point).'],
          ['GET, DELETE /geo-grids/:gridId; POST /geo-grids/:gridId/cancel', 'GET includes every point. Points searched before a cancel stay billed.'],
        ]}
      />

      <h2 id="google">Search Console and Analytics</h2>
      <p>
        Free: these read the user&apos;s own Google data and spend nothing from YepAPI. Connecting is done in the
        dashboard (<code>GET /google/:provider/connect</code> starts Google&apos;s consent screen and needs a signed-in
        session, not an API key). Search Console periods end three days ago; GA4 periods end yesterday.
      </p>
      <DocTable
        caption="Google routes"
        head={['Route', 'Notes']}
        mono={[0]}
        rows={[
          ['GET /projects/:id/google', '{ configured, redirectUris, gsc, ga4, accounts }.'],
          ['GET /google/accounts; DELETE /google/accounts/:accountId', 'Your Google grants. Deleting one disconnects every project using it and returns { projects }.'],
          ['GET /projects/:id/google/gsc/sites?accountId=', 'Search Console properties, with verified: false for ones you cannot read.'],
          ['PUT /projects/:id/google/gsc', '{ accountId, siteUrl }. Unverified properties are refused.'],
          ['GET /projects/:id/google/ga4/properties?accountId=', 'GA4 properties in the account.'],
          ['PUT /projects/:id/google/ga4', '{ accountId, propertyId: "properties/123" }.'],
          ['DELETE /projects/:id/google/:provider', 'Disconnect gsc or ga4 from the project.'],
          ['GET /projects/:id/search-performance', '?range=last_7_days|last_28_days|last_3_months &device= &country= (alpha-3) &pageText= &pageMatch=contains|equals &queryText= &queryMatch=. Totals against the previous period, daily rows, striking distance, countries.'],
          ['GET /projects/:id/search-performance/table', 'The same filters plus ?dimension=query|page &page= &size=25|50|100. Returns { rows, hasMore }.'],
          ['GET /projects/:id/search-console/rows', '?dimensions=query,page (up to 3) &minPosition= &maxPosition= &minImpressions= &limit= (≤ 1,000) and the filters above.'],
          ['POST /projects/:id/search-console/inspect', '{ urls } (1 to 10). Index status per URL.'],
          ['GET /projects/:id/analytics/overview', '?range= &channel=organic|all. Sessions, engagement, key events and revenue against the previous period, plus a daily series.'],
          ['GET /projects/:id/analytics/landing-pages', '?range= &channel= &limit= (≤ 1,000).'],
          ['GET /projects/:id/search-opportunities', '?range=. Pages at positions 4 to 20 with a 0 to 100 score and its parts.'],
        ]}
      />

      <h2 id="public">Free tools (public)</h2>
      <p>
        <code>GET /public/tools</code> lists the tools and markets. <code>POST /public/tools/:tool</code> runs one, with
        no account, behind the guards described in <Link href="/docs/free-tools">Run the free tools</Link>. These routes
        are meant for the site, not for scripts: use an API key and the lookups above instead.
      </p>

      <Callout title="Background runs">
        <p>
          Run routes answer <code>202</code> straight away with the queued run. Poll it until its status is{' '}
          <code>completed</code>, <code>failed</code> or <code>cancelled</code>; <code>done</code>, <code>total</code>{' '}
          and <code>costUsd</code> show progress. If the queue cannot take the run you get <code>503 queue_unavailable</code>,
          nothing is spent, and you can retry at once.
        </p>
      </Callout>
    </DocArticle>
  );
}
