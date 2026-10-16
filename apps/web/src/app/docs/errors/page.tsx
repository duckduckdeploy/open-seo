import Link from 'next/link';
import { Callout, DocTable } from '@/components/doc-blocks';
import { DocArticle } from '@/components/doc-page';
import { getDoc } from '@/content/docs';
import { pageMeta } from '@/lib/metadata';

const slug = 'errors';
const doc = getDoc(slug);

export const metadata = pageMeta({ title: doc.title, description: doc.description, path: `/docs/${slug}` });

export default function ErrorsPage() {
  return (
    <DocArticle slug={slug}>
      <p>
        Errors in the app, the REST API and MCP tools carry the same code and message. In the REST API they come back
        as <code>{'{ "ok": false, "error": { "code", "message", "details?" } }'}</code> with the HTTP status below.
        YepAPI does not bill a call it refuses. A timeout or a lost connection is different: the call may have
        completed at YepAPI, so OpenSEO does not repeat it on its own.
      </p>

      <h2 id="money">Keys, credit and limits</h2>
      <DocTable
        caption="Key, credit and limit errors"
        head={['Code', 'Status', 'What to do']}
        mono={[0, 1]}
        rows={[
          ['yepapi_key_missing', '400', 'Add your YepAPI key under Settings and usage.'],
          ['yepapi_key_invalid', '400', 'YepAPI rejected the key. Copy the whole key again from YepAPI and replace it in Settings.'],
          ['yepapi_no_credits', '402', 'Your YepAPI balance is empty. Top up at yepapi.com; OpenSEO cannot do it for you.'],
          ['yepapi_account_frozen', '402', 'YepAPI froze the account pending a billing review. Contact YepAPI support.'],
          ['budget_reached', '402', 'Your monthly OpenSEO spending limit is reached. Raise or clear it in Settings, or wait for the next month (UTC).'],
          ['cost_ceiling_exceeded', '400', 'The call could cost more than the max_cost_usd you gave. Raise the ceiling or ask for less (a lower limit, fewer keywords, a smaller grid). details.estimate has the price.'],
        ]}
      />

      <h2 id="requests">Requests</h2>
      <DocTable
        caption="Request errors"
        head={['Code', 'Status', 'What to do']}
        mono={[0, 1]}
        rows={[
          ['unauthorized', '401', 'Sign in again, or send a valid key as Authorization: Bearer oseo_… . Revoked keys stop working at once.'],
          ['forbidden_origin', '403', 'A cookie-authenticated change came from another website. Use the dashboard, or an API key for scripts.'],
          ['validation_error', '400', 'A field is missing or out of range. The message names the field; details lists every problem.'],
          ['bad_request', '400', 'The request cannot be done as asked, for example an audit with no start URL, or a location code that does not exist. The message says why.'],
          ['not_found', '404', 'The project, tracker, run or page does not exist, or belongs to another account.'],
          ['conflict', '409', 'Usually a run is already going for that tracker or project (details.reason is run_in_progress). Wait for it, or cancel it. Also returned when a run needs keywords, prompts or a brand first.'],
        ]}
      />

      <h2 id="provider">YepAPI and service problems</h2>
      <DocTable
        caption="Provider and service errors"
        head={['Code', 'Status', 'What to do']}
        mono={[0, 1]}
        rows={[
          ['yepapi_validation', '400', 'YepAPI refused the request, for example an unsupported market for that data. The message has its reason.'],
          ['yepapi_rate_limited', '429', 'Too many requests at once. OpenSEO already retried; try again shortly.'],
          ['yepapi_timeout', '504', 'YepAPI took too long to answer. The request may still have run there and been billed, so OpenSEO did not retry it. Check your YepAPI usage, then try again if you need to.'],
          ['yepapi_error', '502', 'YepAPI returned an error. A paid call is not retried automatically after one, since it may have been billed. Try again; if it persists, the message includes YepAPI’s.'],
          ['queue_unavailable', '503', 'The background queue could not take the run. Nothing was spent and nothing is blocked; try again in a moment.'],
          ['internal_error', '500', 'Something unexpected went wrong in OpenSEO. On a self-hosted install, the API log has the details.'],
        ]}
      />

      <h2 id="google">Search Console and Analytics</h2>
      <DocTable
        caption="Google errors"
        head={['Code', 'Status', 'What to do']}
        mono={[0, 1]}
        rows={[
          ['google_not_configured', '503', 'This install has no Google OAuth client. Whoever runs it sets GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET; see Set up Google sign-in.'],
          ['google_not_connected', '409', 'The project has no Search Console or Analytics property yet. Connect one under Search performance.'],
          ['google_reconnect_required', '409', 'Google withdrew access, or it expired. Connect the account again under Search performance.'],
          ['google_permission', '403', 'The Google account cannot read that property any more. Check its access in Search Console or Analytics.'],
          ['google_quota', '429', 'Google’s daily or per-minute quota is used up. Try again later.'],
          ['google_error', '502', 'Google returned an error. Try again shortly.'],
        ]}
      />
      <p>
        When connecting fails, the dashboard returns with <code>google_error</code> in the address and explains it:{' '}
        <code>state_mismatch</code> (the link expired or came from another session; start again),{' '}
        <code>scope_denied</code> (the read-only permission was unticked), <code>access_denied</code> (you cancelled),{' '}
        <code>token_exchange_failed</code> (check the OAuth client&apos;s redirect URIs).
      </p>

      <h2 id="runs">When a run stops</h2>
      <p>Rank checks, AI visibility runs, audits and geo-grids record why they stopped:</p>
      <ul>
        <li>
          <strong>failed</strong> with a key, credit or limit message: the run stopped at the first such error instead
          of repeating it. Fix the cause and run again.
        </li>
        <li>
          <strong>failed: Interrupted before it finished</strong>: the worker stopped making progress for 30 minutes
          (a restart or crash). Run it again.
        </li>
        <li>
          <strong>cancelled</strong>: you cancelled it, or an AI visibility run reached its cost ceiling. Results
          collected before that are kept and were billed.
        </li>
      </ul>

      <h2 id="audit">Audit-specific problems</h2>
      <ul>
        <li>
          <strong>Address … is not publicly routable</strong>, or <strong>Hostname … is not allowed</strong>: the
          crawler only audits public websites. It refuses private, local and cloud-metadata addresses.
        </li>
        <li>
          <strong>Many pages blocked</strong>: your firewall or CDN is challenging the crawler. Allow the user agent{' '}
          <code>OpenSEOBot/0.1</code>.
        </li>
        <li>
          <strong>Stopped because the site kept answering 429</strong>: the site rate-limited the crawler. Raise the
          limit for it, or audit fewer pages.
        </li>
      </ul>

      <Callout title="Still stuck?">
        <p>
          On a self-hosted install, check that the API and worker are running and that <code>.env</code> is complete (see{' '}
          <Link href="/docs/self-hosting">Self-hosting</Link>). For questions about your balance or billing, contact
          YepAPI.
        </p>
      </Callout>
    </DocArticle>
  );
}
