import { LegalPage } from '@/components/legal-page';
import { pageMeta } from '@/lib/metadata';

export const metadata = pageMeta({
  title: 'Terms (draft)',
  description: 'A draft, plain-language outline of the terms for using OpenSEO. Not yet reviewed.',
  path: '/terms',
  noIndex: true,
});

export default function TermsPage() {
  return (
    <LegalPage title="Terms">
      <p>
        This draft outlines the terms we expect to apply to the hosted version of OpenSEO. Details may change before
        launch.
      </p>

      <h2>The software</h2>
      <p>
        OpenSEO is open-source software released under the MIT licence. The licence text in the repository governs
        your use of the code, including when you self-host it.
      </p>

      <h2>Your YepAPI key and costs</h2>
      <p>
        OpenSEO uses a YepAPI key that you provide. YepAPI bills you directly for the calls made with that key, at
        YepAPI&apos;s prices; OpenSEO does not handle that payment. You are responsible for the usage on your
        key, including usage by agents or scripts you connect through the API or MCP server.
      </p>
      <p>
        Prices shown on this site are examples at the time of writing. YepAPI sets its prices and may change them.
      </p>

      <h2>Early-stage project</h2>
      <p>
        OpenSEO is in active development. Features may change, be incomplete or be unavailable, and the software is
        provided as it is, without warranty.
      </p>

      <h2>Still to be written</h2>
      <p>
        The final terms will cover acceptable use, account termination, liability, governing law and how to contact
        us. Those sections are not written yet.
      </p>
    </LegalPage>
  );
}
