import { ImageResponse } from 'next/og';

export const alt = 'OpenSEO: the open-source SEO suite you control.';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

const ink = '#111210';
const paper = '#fafaf7';
const accent = '#2563eb';
const onAccent = '#ffffff';

export default function OpenGraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          background: paper,
          color: ink,
          padding: 72,
          fontFamily: 'sans-serif',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 20 }}>
          <svg width="64" height="64" viewBox="0 0 32 32">
            <rect width="32" height="32" rx="4" fill={accent} />
            <circle cx="14" cy="14" r="6.5" fill="none" stroke={onAccent} strokeWidth="4" />
            <path d="M19.5 19.5 25 25" stroke={onAccent} strokeWidth="4" strokeLinecap="square" />
          </svg>
          <div style={{ fontSize: 44, fontWeight: 800, letterSpacing: -1 }}>OpenSEO</div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column' }}>
          <div style={{ fontSize: 84, fontWeight: 800, letterSpacing: -3, lineHeight: 1.02 }}>
            The open-source SEO suite
          </div>
          <div style={{ display: 'flex', marginTop: 8 }}>
            <div
              style={{
                fontSize: 84,
                fontWeight: 800,
                letterSpacing: -3,
                lineHeight: 1.02,
                background: accent,
                color: onAccent,
                padding: '4px 16px 10px',
              }}
            >
              you control.
            </div>
          </div>
        </div>

        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            borderTop: `2px solid ${ink}`,
            paddingTop: 24,
            fontSize: 28,
          }}
        >
          <div>Open source. Self-hostable. MIT licensed.</div>
          <div style={{ fontWeight: 700 }}>openseo.gg</div>
        </div>
      </div>
    ),
    size,
  );
}
