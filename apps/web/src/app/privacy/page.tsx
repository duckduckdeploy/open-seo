import { LegalPage } from '@/components/legal-page';
import { pageMeta } from '@/lib/metadata';
import { YEPAPI_URL } from '@/lib/site';

export const metadata = pageMeta({
  title: 'Privacy (draft)',
  description: 'A draft, plain-language outline of how OpenSEO expects to handle data. Not yet reviewed.',
  path: '/privacy',
  noIndex: true,
});

export default function PrivacyPage() {
  return (
    <LegalPage title="Privacy">
      <p>
        This draft outlines how we expect the hosted version of OpenSEO to handle data. Details may change before
        launch.
      </p>

      <h2>What the hosted version stores</h2>
      <ul>
        <li>The account details you give us when you sign up.</li>
        <li>Your YepAPI key, stored encrypted, so the app can make calls on your behalf.</li>
        <li>The work you create in the app, such as saved keyword lists, tracked keywords and the results of actions you run.</li>
        <li>
          If you connect Google Search Console or Google Analytics: which Google account and property, its email
          address, and read-only access tokens, stored encrypted. The data Google returns is not stored.
        </li>
      </ul>

      <h2>YepAPI</h2>
      <p>
        All SEO data comes from YepAPI. When you run an action, the request is sent to YepAPI using your key. Your
        billing relationship is with YepAPI, and their handling of your account and payment data is covered by their
        own policies at{' '}
        <a href={YEPAPI_URL} rel="noopener">
          yepapi.com
        </a>
        . OpenSEO does not process payments.
      </p>

      <h2>Self-hosting</h2>
      <p>
        If you self-host OpenSEO, the database and everything in it run on infrastructure you control. We do not
        receive that data.
      </p>

      <h2>Still to be written</h2>
      <p>
        The final policy will cover retention, deletion, cookies, sub-processors, your rights and how to contact us.
        Those sections are not written yet.
      </p>
    </LegalPage>
  );
}
