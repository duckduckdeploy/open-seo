"use client";

import { useEffect, useRef, useState } from "react";
import { cx } from "@/components/ui";

export type GridPin = { key: string; lat: number; lng: number; label: string; tone: string; title: string; selected?: boolean };

const TILE = 256;
/** Metres per pixel at zoom 0 on the equator, in Web Mercator (the projection Google Maps uses). */
const METRES_PER_PIXEL = 156543.03392;

const mercatorY = (lat: number) => Math.log(Math.tan(Math.PI / 4 + (lat * Math.PI) / 360));

/** The largest whole zoom at which a square `extentM` metres wide fits in `px` pixels. */
function fitZoom(lat: number, extentM: number, px: number) {
  const zoom = Math.floor(Math.log2((METRES_PER_PIXEL * Math.cos((lat * Math.PI) / 180) * px) / extentM));
  return Math.min(18, Math.max(3, zoom));
}

/**
 * A grid of points drawn over a Google Maps view of the area. The map is Google's standard embed,
 * centred on the grid's centre at a whole zoom level, so each pin can be placed with the same Web
 * Mercator projection the map uses. The map does not pan or zoom, so the pins stay on their
 * points; "Open in Google Maps" explores further.
 */
export function GridMap({
  center,
  pins,
  extentM,
  language = "en",
  onPick,
  label,
}: {
  center: { lat: number; lng: number };
  pins: GridPin[];
  /** Width of the area the grid covers, in metres. */
  extentM: number;
  language?: string;
  onPick?: (key: string) => void;
  label: string;
}) {
  const box = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState<{ width: number; height: number } | null>(null);

  useEffect(() => {
    const element = box.current;
    if (!element) return;
    const observer = new ResizeObserver(([entry]) => {
      if (entry) setSize({ width: Math.round(entry.contentRect.width), height: Math.round(entry.contentRect.height) });
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  // The grid takes up to 80% of the shorter side, so its outer pins are clear of the edges.
  const zoom = size ? fitZoom(center.lat, extentM, Math.min(size.width, size.height) * 0.8) : null;
  const scale = zoom == null ? 0 : (TILE * 2 ** zoom) / 360;
  const scaleY = zoom == null ? 0 : (TILE * 2 ** zoom) / (2 * Math.PI);
  const place = (pin: GridPin) => ({
    left: (size?.width ?? 0) / 2 + (pin.lng - center.lng) * scale,
    top: (size?.height ?? 0) / 2 + (mercatorY(center.lat) - mercatorY(pin.lat)) * scaleY,
  });
  const src = zoom == null ? null : `https://maps.google.com/maps?q=${center.lat.toFixed(6)},${center.lng.toFixed(6)}&z=${zoom}&hl=${encodeURIComponent(language)}&output=embed`;
  // Pins scale with the space between them, within limits that keep the rank readable.
  const spacingPx = pins.length > 1 && zoom != null ? Math.abs(place(pins[0] as GridPin).left - place(pins[1] as GridPin).left) || 40 : 40;
  const pin = Math.max(26, Math.min(44, spacingPx * 0.62));

  return (
    <div ref={box} className="relative h-full w-full overflow-hidden bg-sunken" role="img" aria-label={label}>
      {src && (
        <iframe
          key={src}
          src={src}
          title="Map of the area"
          referrerPolicy="no-referrer-when-downgrade"
          // The map stays still so the pins stay on their points.
          className="pointer-events-none absolute inset-0 h-full w-full border-0"
          tabIndex={-1}
          aria-hidden
        />
      )}
      {size &&
        pins.map((item) => {
          const at = place(item);
          return (
            <button
              key={item.key}
              type="button"
              title={item.title}
              onClick={() => onPick?.(item.key)}
              className={cx(
                "absolute grid -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full border-2 border-white font-display font-bold tabular shadow-md transition-transform hover:scale-110 focus-visible:scale-110",
                item.tone,
                item.selected && "ring-4 ring-ink/70",
              )}
              style={{ left: at.left, top: at.top, width: pin, height: pin, fontSize: pin * 0.4 }}
            >
              {item.label}
            </button>
          );
        })}
    </div>
  );
}
