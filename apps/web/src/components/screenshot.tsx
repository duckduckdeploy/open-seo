import screens from '@/content/screens.json';

export type ScreenName = keyof typeof screens;

const sizeOf = (name: ScreenName) => screens[name];

/**
 * A real screenshot of the app (taken by scripts/screenshots.mjs), in the light or dark theme to
 * match the reader's system. `window` frames a whole screen like an app window; crops of one
 * part of a page sit in a plain frame.
 */
export function ScreenImage({
  name,
  alt,
  priority = false,
  thumbnail = false,
}: {
  name: ScreenName;
  alt: string;
  priority?: boolean;
  /** Shrinks to fit at any width, for small previews. */
  thumbnail?: boolean;
}) {
  const { width, height } = sizeOf(name);
  // On a phone a desktop screen would shrink past reading: it keeps a readable width and scrolls.
  return (
    <div className="overflow-x-auto overscroll-x-contain">
      <picture>
        <source srcSet={`/screens/${name}-dark.webp`} media="(prefers-color-scheme: dark)" />
        <img
          src={`/screens/${name}.webp`}
          alt={alt}
          width={width}
          height={height}
          loading={priority ? 'eager' : 'lazy'}
          fetchPriority={priority ? 'high' : undefined}
          decoding="async"
          className={`block h-auto w-full ${thumbnail ? '' : 'max-sm:min-w-[40rem]'}`}
        />
      </picture>
    </div>
  );
}

export function WindowFrame({ children, label }: { children: React.ReactNode; label?: string }) {
  return (
    <div className="overflow-hidden rounded-xl border border-line bg-surface shadow-hard-lg">
      <div className="flex items-center gap-1.5 border-b border-line bg-sunken/60 px-4 py-2.5" aria-hidden="true">
        <span className="size-2.5 rounded-full bg-line" />
        <span className="size-2.5 rounded-full bg-line" />
        <span className="size-2.5 rounded-full bg-line" />
        {label ? <span className="ml-3 truncate font-mono text-xs text-faint">{label}</span> : null}
      </div>
      {children}
    </div>
  );
}

export function Screenshot({
  name,
  alt,
  caption,
  window: framed = false,
  label,
  priority,
  className = '',
}: {
  name: ScreenName;
  alt: string;
  caption?: React.ReactNode;
  window?: boolean;
  /** Address shown in the window frame, e.g. "app.openseo.gg/tools/keyword-overview". */
  label?: string;
  priority?: boolean;
  className?: string;
}) {
  const image = <ScreenImage name={name} alt={alt} priority={priority} />;
  return (
    <figure className={className}>
      {framed ? <WindowFrame label={label}>{image}</WindowFrame> : <div className="overflow-hidden rounded-xl border border-line bg-surface shadow-hard">{image}</div>}
      {caption ? <figcaption className="mx-auto mt-4 max-w-2xl text-center text-sm leading-relaxed text-muted">{caption}</figcaption> : null}
    </figure>
  );
}
