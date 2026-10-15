'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { docSections, docsIn } from '@/content/docs';

const linkClass = (active: boolean) =>
  `inline-flex h-10 items-center rounded-md border px-3.5 text-sm whitespace-nowrap transition-colors duration-150 lg:flex lg:h-auto lg:border-0 lg:px-3 lg:py-2 lg:whitespace-normal ${
    active
      ? 'border-accent-line bg-accent-soft font-medium text-accent-text'
      : 'border-line text-muted hover:bg-sunken hover:text-ink'
  }`;

/** Docs navigation by section: a horizontal scroller on small screens, a grouped sidebar from lg up. */
export function DocsNav() {
  const pathname = usePathname();

  return (
    <nav aria-label="Docs">
      <ul className="-mx-5 flex gap-1 overflow-x-auto px-5 pb-1 sm:-mx-8 sm:px-8 lg:mx-0 lg:block lg:space-y-8 lg:overflow-visible lg:px-0 lg:pb-0">
        <li className="shrink-0 lg:hidden">
          <Link href="/docs" aria-current={pathname === '/docs' ? 'page' : undefined} className={linkClass(pathname === '/docs')}>
            Overview
          </Link>
        </li>
        <li className="hidden lg:block">
          <Link href="/docs" aria-current={pathname === '/docs' ? 'page' : undefined} className={`block rounded-md px-3 py-2 text-sm font-semibold ${pathname === '/docs' ? 'bg-accent-soft text-accent-text' : 'text-ink hover:bg-sunken'}`}>
            Docs overview
          </Link>
        </li>
        {docSections.map((section) => (
          <li key={section} className="contents lg:block">
            <p className="hidden px-3 text-xs font-semibold tracking-wide text-faint uppercase lg:mb-2 lg:block">{section}</p>
            <ul className="contents lg:block lg:space-y-0.5">
              {docsIn(section).map((doc) => {
                const href = `/docs/${doc.slug}`;
                const active = pathname === href;
                return (
                  <li key={doc.slug} className="shrink-0">
                    <Link href={href} aria-current={active ? 'page' : undefined} className={linkClass(active)}>
                      {doc.title}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </li>
        ))}
      </ul>
    </nav>
  );
}
