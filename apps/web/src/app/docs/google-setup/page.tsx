import Link from 'next/link';
import { Callout, Step, Steps, Ui } from '@/components/doc-blocks';
import { CodeBlock } from '@/components/code-block';
import { DocArticle } from '@/components/doc-page';
import { getDoc } from '@/content/docs';
import { pageMeta } from '@/lib/metadata';

const slug = 'google-setup';
const doc = getDoc(slug);

export const metadata = pageMeta({ title: doc.title, description: doc.description, path: `/docs/${slug}` });

const envExample = `GOOGLE_CLIENT_ID=1234567890-abc.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=GOCSPX-...`;

export default function GoogleSetupPage() {
  return (
    <DocArticle slug={slug}>
      <p>
        Users connect Search Console and Google Analytics through an OAuth client that belongs to whoever runs the
        OpenSEO install. Without one, the Search performance page explains that Google is not set up, and nothing else
        is affected. It takes about ten minutes in Google Cloud.
      </p>

      <h2 id="client">Create the OAuth client</h2>
      <Steps>
        <Step title="Create or choose a Google Cloud project">
          <p>
            In the Google Cloud console, create a project for OpenSEO, or use an existing one.
          </p>
        </Step>
        <Step title="Enable the APIs">
          <p>
            Under <Ui>APIs and services</Ui>, enable the <strong>Google Search Console API</strong>, the{' '}
            <strong>Google Analytics Admin API</strong> and the <strong>Google Analytics Data API</strong>.
          </p>
        </Step>
        <Step title="Configure the consent screen">
          <p>
            Set the app name, support email and your domain. Add the scopes{' '}
            <code>https://www.googleapis.com/auth/webmasters.readonly</code> and{' '}
            <code>https://www.googleapis.com/auth/analytics.readonly</code>, plus <code>openid</code> and{' '}
            <code>email</code>. While the app is in testing, only test users you list can connect; publishing it for
            other users may need Google&apos;s verification.
          </p>
        </Step>
        <Step title="Create a web application client">
          <p>
            Create an <strong>OAuth client ID</strong> of type <strong>Web application</strong> with these authorised
            redirect URIs, where <code>APP_URL</code> is your dashboard&apos;s address:
          </p>
          <CodeBlock label="Redirect URIs" code={'{APP_URL}/api/google/gsc/callback\n{APP_URL}/api/google/ga4/callback'} />
          <p>The Search performance page lists the exact URIs for your install while Google is not set up.</p>
        </Step>
        <Step title="Add the client to the API's environment">
          <CodeBlock label=".env" code={envExample} />
          <p>Restart the API. The Search performance page now offers to connect accounts.</p>
        </Step>
      </Steps>

      <h2 id="how">How the connection works</h2>
      <ul>
        <li>
          Each product is a separate grant with a read-only scope, apart from signing in to OpenSEO. Connecting Search
          Console never grants Analytics, or the other way round.
        </li>
        <li>
          The redirect goes through the dashboard&apos;s address, so the user&apos;s session comes along and the grant
          is stored for the person who started it.
        </li>
        <li>
          Each attempt has a random state that works once and expires after 10 minutes, tied to the user it was issued
          to, and uses PKCE. A callback with someone else&apos;s state, an old one or a replayed one is refused.
        </li>
        <li>
          If the user unticks the permission on Google&apos;s consent screen, nothing is stored and the page says why.
        </li>
        <li>
          Access and refresh tokens are encrypted with <code>ENCRYPTION_KEY</code>. Access tokens are refreshed shortly
          before they expire. If Google withdraws the grant, the page asks the user to reconnect.
        </li>
        <li>Nothing Google returns is stored. Google&apos;s API quotas apply; when one is used up the page says so.</li>
      </ul>

      <Callout title="Testing without Google">
        <p>
          The API test suite runs against a stand-in Google server (<code>apps/api/src/testing/fake-google.ts</code>):
          set <code>GOOGLE_API_BASE_URL</code> to its address and every Google request goes there. See{' '}
          <Link href="/docs/self-hosting">Self-hosting</Link>.
        </p>
      </Callout>
    </DocArticle>
  );
}
