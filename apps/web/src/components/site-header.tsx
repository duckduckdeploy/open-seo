import { GITHUB_URL, SIGN_IN_URL, SIGN_UP_URL } from '@/lib/site';
import { BrandIcon } from './brand-icon';
import { ButtonLink } from './button';
import { Logo } from './logo';
import { MobileNav } from './mobile-nav';
import { NavLinks } from './nav-links';

export function SiteHeader() {
  return (
    <header className="sticky top-0 z-40 border-b border-line/80 bg-bg/80 backdrop-blur-lg">
      <div className="container-page relative flex h-[4.25rem] items-center justify-between gap-4">
        <div className="flex items-center gap-10">
          <Logo />
          <nav aria-label="Primary" className="hidden md:block">
            <NavLinks />
          </nav>
        </div>

        <div className="flex items-center gap-1.5">
          {GITHUB_URL ? (
            <a
              href={GITHUB_URL}
              className="hidden h-10 items-center rounded-md px-3 text-sm font-medium text-muted transition-colors duration-150 hover:text-ink md:inline-flex md:gap-2"
            >
              <BrandIcon brand="github" />
              GitHub
            </a>
          ) : null}
          <a
            href={SIGN_IN_URL}
            className="hidden h-10 items-center rounded-md px-3 text-sm font-medium text-muted transition-colors duration-150 hover:text-ink md:inline-flex"
          >
            Sign in
          </a>
          <ButtonLink href={SIGN_UP_URL}>Get started</ButtonLink>
          <MobileNav signInUrl={SIGN_IN_URL} signUpUrl={SIGN_UP_URL} githubUrl={GITHUB_URL} />
        </div>
      </div>
    </header>
  );
}
