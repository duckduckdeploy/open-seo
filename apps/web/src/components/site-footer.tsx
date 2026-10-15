import Link from 'next/link';
import { comparisons } from '@/content/compare';
import { docPages, docsIn } from '@/content/docs';
import { features } from '@/content/features';
import { GITHUB_URL, SIGN_IN_URL, SIGN_UP_URL } from '@/lib/site';
import { Logo } from './logo';

const linkClass = 'text-[0.9375rem] text-muted transition-colors duration-150 hover:text-ink';

function FooterHeading({ children }: { children: string }) {
  return <h2 className="mb-5 text-sm font-semibold text-ink">{children}</h2>;
}

export function SiteFooter() {
  return (
    <footer className="border-t border-line bg-surface">
      <div className="container-page grid grid-cols-2 gap-x-8 gap-y-12 py-16 md:grid-cols-[1.6fr_1fr_1fr_1fr] md:py-20">
        <div className="col-span-2 max-w-xs md:col-span-1">
          <Logo />
          <p className="mt-5 text-[0.9375rem] leading-relaxed text-muted">
            An open-source SEO suite you can run yourself, read every line of, and hand to your AI agent.
          </p>
          <p className="mt-6 inline-flex items-center gap-2 rounded-full border border-line bg-bg px-3 py-1 text-xs text-muted">
            <span className="size-1.5 rounded-full bg-accent" aria-hidden="true" />
            Early project, in active development
          </p>
        </div>

        <nav aria-label="Features">
          <FooterHeading>Features</FooterHeading>
          <ul className="space-y-3">
            {features.map((feature) => (
              <li key={feature.slug}>
                <Link href={`/features/${feature.slug}`} className={linkClass}>
                  {feature.name}
                </Link>
              </li>
            ))}
          </ul>
        </nav>

        <nav aria-label="Docs">
          <FooterHeading>Docs</FooterHeading>
          <ul className="space-y-3">
            {[...docsIn('Start here'), ...docPages.filter((doc) => doc.slug === 'self-hosting' || doc.slug === 'mcp')].map((doc) => (
              <li key={doc.slug}>
                <Link href={`/docs/${doc.slug}`} className={linkClass}>
                  {doc.title}
                </Link>
              </li>
            ))}
            <li>
              <Link href="/docs" className={linkClass}>
                Tutorials and reference
              </Link>
            </li>
          </ul>
        </nav>

        <nav aria-label="Project">
          <FooterHeading>Project</FooterHeading>
          <ul className="space-y-3">
            <li>
              <Link href="/pricing" className={linkClass}>
                Pricing
              </Link>
            </li>
            <li>
              <Link href="/tools" className={linkClass}>
                Free tools
              </Link>
            </li>
            {comparisons.map((c) => (
              <li key={c.slug}>
                <Link href={`/compare/${c.slug}`} className={linkClass}>
                  OpenSEO vs {c.name}
                </Link>
              </li>
            ))}
            <li>
              <a href={SIGN_UP_URL} className={linkClass}>
                Get started
              </a>
            </li>
            <li>
              <a href={SIGN_IN_URL} className={linkClass}>
                Sign in
              </a>
            </li>
            {GITHUB_URL ? (
              <li>
                <a href={GITHUB_URL} className={linkClass} rel="noopener">
                  GitHub
                </a>
              </li>
            ) : null}
            <li>
              <Link href="/privacy" className={linkClass}>
                Privacy
              </Link>
            </li>
            <li>
              <Link href="/terms" className={linkClass}>
                Terms
              </Link>
            </li>
          </ul>
        </nav>
      </div>

      <div className="border-t border-line">
        <div className="container-page flex flex-col gap-2 py-6 text-sm text-faint sm:flex-row sm:items-center sm:justify-between">
          <p>MIT licence. Open source and self-hostable.</p>
          <p>Free to self-host. Your data stays where you put it.</p>
        </div>
      </div>
    </footer>
  );
}
