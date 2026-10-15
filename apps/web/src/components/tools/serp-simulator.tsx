'use client';

import { useEffect, useState } from 'react';
import { inputClass, Label } from './tool-ui';

// Search results set titles in about 20px Arial and cut them at roughly 600px on desktop.
const TITLE_FONT = '20px Arial, sans-serif';
const DESKTOP_TITLE_PX = 600;
const MOBILE_WIDTH_PX = 328;
// Descriptions are cut by length; about 155 to 160 characters fit on desktop.
const DESCRIPTION_CHARS = 158;

/**
 * The title's width at `font`, and the title cut to fit `maxPx` with an ellipsis, as a search
 * result would. Measured in the browser after render, so server and client markup match.
 */
function useMeasuredTitle(text: string, font: string, maxPx: number): { width: number | null; fitted: string } {
  const [measured, setMeasured] = useState<{ width: number | null; fitted: string }>({ width: null, fitted: text });
  useEffect(() => {
    const context = document.createElement('canvas').getContext('2d');
    if (!context) return setMeasured({ width: null, fitted: text });
    context.font = font;
    const width = Math.round(context.measureText(text).width);
    let fitted = text;
    if (width > maxPx) {
      let cut = text;
      while (cut.length && context.measureText(`${cut}…`).width > maxPx) cut = cut.slice(0, -1);
      fitted = `${cut.trimEnd()}…`;
    }
    setMeasured({ width, fitted });
  }, [text, font, maxPx]);
  return measured;
}

export function SerpSimulator() {
  const [title, setTitle] = useState('Emergency Plumber in Austin, TX | 24/7 Callouts | Acme Plumbing');
  const [description, setDescription] = useState('Burst pipe or blocked drain? Acme Plumbing sends a licensed plumber to you in under an hour, day or night. Upfront prices and a 12-month guarantee on every repair.');
  const [url, setUrl] = useState('https://www.acme.com/emergency-plumber');
  const [device, setDevice] = useState<'desktop' | 'mobile'>('desktop');
  const [showDate, setShowDate] = useState(false);

  // Mobile titles wrap onto a second line instead of being cut at one line's width.
  const maxTitle = device === 'desktop' ? DESKTOP_TITLE_PX : MOBILE_WIDTH_PX * 2;
  const { width, fitted: fittedTitle } = useMeasuredTitle(title, TITLE_FONT, maxTitle);
  // Set after render: the server's date and the visitor's may differ.
  const [today, setToday] = useState('');
  useEffect(() => setToday(new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })), []);
  const shownDescription = (showDate && today ? `${today} — ` : '') + description;
  const cutDescription = shownDescription.length > DESCRIPTION_CHARS ? `${shownDescription.slice(0, DESCRIPTION_CHARS).trimEnd()}…` : shownDescription;
  let crumbs = url;
  try {
    const parsed = new URL(url);
    crumbs = [parsed.hostname, ...parsed.pathname.split('/').filter(Boolean)].join(' › ');
  } catch {
    // Show the text as typed until it is a full URL.
  }

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <form className="grid gap-4 rounded-lg border border-line bg-surface p-6 shadow-hard-sm sm:p-7" onSubmit={(event) => event.preventDefault()}>
        <div>
          <Label htmlFor="title" hint={width == null ? undefined : `${width} / ${DESKTOP_TITLE_PX} px`}>
            Title
          </Label>
          <input id="title" className={inputClass} value={title} onChange={(e) => setTitle(e.target.value)} maxLength={300} />
          {width != null && width > DESKTOP_TITLE_PX ? <p className="mt-1 text-sm text-neg">About {width - DESKTOP_TITLE_PX}px too wide for desktop: the end will be cut.</p> : null}
        </div>
        <div>
          <Label htmlFor="description" hint={`${description.length} characters`}>
            Meta description
          </Label>
          <textarea id="description" rows={4} className={`${inputClass} h-auto py-2`} value={description} onChange={(e) => setDescription(e.target.value)} maxLength={500} />
          {shownDescription.length > DESCRIPTION_CHARS ? <p className="mt-1 text-sm text-muted">Longer than about {DESCRIPTION_CHARS} characters: likely cut.</p> : null}
        </div>
        <div>
          <Label htmlFor="url">URL</Label>
          <input id="url" className={inputClass} value={url} onChange={(e) => setUrl(e.target.value)} maxLength={500} />
        </div>
        <div className="flex flex-wrap gap-4 text-sm">
          <fieldset className="flex gap-3">
            <legend className="sr-only">Device</legend>
            {(['desktop', 'mobile'] as const).map((d) => (
              <label key={d} className="flex items-center gap-1.5">
                <input type="radio" name="device" checked={device === d} onChange={() => setDevice(d)} /> {d === 'desktop' ? 'Desktop' : 'Mobile'}
              </label>
            ))}
          </fieldset>
          <label className="flex items-center gap-1.5">
            <input type="checkbox" checked={showDate} onChange={(e) => setShowDate(e.target.checked)} /> Show a date
          </label>
        </div>
      </form>

      <div>
        <p className="mb-3 text-sm font-medium text-muted">Preview, {device}</p>
        <div className="rounded-lg border border-line bg-white p-5 text-[#202124]" style={{ maxWidth: device === 'mobile' ? MOBILE_WIDTH_PX + 40 : 652 }}>
          <p className="truncate text-sm text-[#4d5156]">{crumbs}</p>
          <p className="mt-1 text-xl leading-snug text-[#1a0dab]" style={{ fontFamily: 'Arial, sans-serif' }}>
            {fittedTitle}
          </p>
          <p className="mt-1 text-sm leading-relaxed text-[#4d5156]" style={{ fontFamily: 'Arial, sans-serif' }}>
            {cutDescription}
          </p>
        </div>
        <p className="mt-3 text-sm text-muted">An approximation of a typical search result. Nothing you type leaves your browser.</p>
      </div>
    </div>
  );
}
