'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useId, useRef, useState } from 'react';
import { Menu, X } from 'lucide-react';
import { NAV_LINKS } from '@/lib/site';
import { isActivePath } from './nav-links';

interface MobileNavProps {
  signInUrl: string;
  signUpUrl: string;
  githubUrl: string | null;
}

/** Disclosure menu for small screens. Closes on navigation, Escape and outside click. */
export function MobileNav({ signInUrl, signUpUrl, githubUrl }: MobileNavProps) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();
  const panelId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (!open) return;

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        setOpen(false);
        buttonRef.current?.focus();
      }
    }

    function onPointerDown(event: PointerEvent) {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    }

    document.addEventListener('keydown', onKeyDown);
    document.addEventListener('pointerdown', onPointerDown);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.removeEventListener('pointerdown', onPointerDown);
    };
  }, [open]);

  const itemClass =
    'flex h-12 items-center justify-between border-b border-line px-5 text-base font-medium text-ink hover:bg-sunken';

  return (
    <div ref={rootRef} className="md:hidden">
      <button
        ref={buttonRef}
        type="button"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((value) => !value)}
        className="inline-flex size-10 items-center justify-center rounded-md border border-edge bg-surface text-ink hover:bg-sunken"
      >
        <span className="sr-only">{open ? 'Close menu' : 'Open menu'}</span>
        {open ? <X className="size-5" aria-hidden="true" /> : <Menu className="size-5" aria-hidden="true" />}
      </button>

      <div
        id={panelId}
        hidden={!open}
        className="absolute inset-x-0 top-full border-b border-line bg-bg shadow-hard-lg"
      >
        <nav aria-label="Mobile">
          <ul>
            {NAV_LINKS.map((link) => {
              const active = isActivePath(pathname, link.href);
              return (
                <li key={link.href}>
                  <Link href={link.href} aria-current={active ? 'page' : undefined} className={itemClass}>
                    {link.label}
                    {active ? <span className="size-2 rounded-full bg-accent" aria-hidden="true" /> : null}
                  </Link>
                </li>
              );
            })}
            {githubUrl ? (
              <li>
                <a href={githubUrl} className={itemClass}>
                  GitHub
                </a>
              </li>
            ) : null}
            <li>
              <a href={signInUrl} className={itemClass}>
                Sign in
              </a>
            </li>
          </ul>
          <div className="p-5">
            <a
              href={signUpUrl}
              className="flex h-12 items-center justify-center rounded-md bg-accent text-base font-medium text-accent-fg shadow-hard-sm"
            >
              Get started
            </a>
          </div>
        </nav>
      </div>
    </div>
  );
}
