"use client";

import { useQuery } from "@tanstack/react-query";
import { useEffect, useId, useRef, useState } from "react";
import { api } from "@/lib/api";
import { cx, Input } from "./ui";

export type LocationChoice = { code: number; name: string; type?: string; country?: string };
type LocationRow = { code: number; name: string; country: string; type: string; serp: boolean; volume: boolean };

/**
 * Searches YepAPI's location list (countries, regions, cities). Free lookup, no credits used.
 *
 * An ARIA combobox: type to search, Up/Down/Home/End to move through the options, Enter to
 * choose, Escape or leaving the field to close and keep the current choice. Give it a name with
 * `aria-label` when it is not inside a Field (which supplies the label).
 */
export function LocationPicker({
  value,
  onChange,
  countriesOnly,
  "aria-label": ariaLabel,
}: {
  value: LocationChoice;
  onChange: (value: LocationChoice) => void;
  countriesOnly?: boolean;
  "aria-label"?: string;
}) {
  const id = useId();
  const listId = `${id}-options`;
  const [text, setText] = useState("");
  const [term, setTerm] = useState("");
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const wrap = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const timer = setTimeout(() => setTerm(text.trim()), 250);
    return () => clearTimeout(timer);
  }, [text]);

  const results = useQuery({
    queryKey: ["locations", term],
    queryFn: () => api<LocationRow[]>("/locations", { query: { q: term } }),
    enabled: open && term.length >= 2,
    staleTime: Infinity,
  });
  const rows = (results.data ?? []).filter((row) => !countriesOnly || row.type === "Country");
  const showList = open && term.length >= 2;
  const current = Math.min(active, Math.max(0, rows.length - 1));

  const close = () => {
    setOpen(false);
    setText("");
    setTerm("");
  };
  const choose = (row: LocationRow) => {
    onChange(row);
    close();
  };

  return (
    <div
      ref={wrap}
      className="relative"
      onBlur={(event) => {
        // Leaving the widget (Tab, or a click elsewhere) closes it and shows the current choice again.
        if (!wrap.current?.contains(event.relatedTarget as Node | null)) close();
      }}
    >
      <Input
        role="combobox"
        aria-label={ariaLabel}
        aria-expanded={showList}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-activedescendant={showList && rows[current] ? `${id}-option-${rows[current].code}` : undefined}
        value={open ? text : value.name.replaceAll(",", ", ")}
        placeholder={countriesOnly ? "Search countries" : "Search a country, region or city"}
        onFocus={() => setOpen(true)}
        onChange={(event) => {
          setOpen(true);
          setText(event.target.value);
          setActive(0);
        }}
        onKeyDown={(event) => {
          if (event.key === "Escape") {
            if (open) event.preventDefault();
            close();
            return;
          }
          if (!showList || rows.length === 0) return;
          const move = { ArrowDown: current + 1, ArrowUp: current - 1, Home: 0, End: rows.length - 1 }[event.key];
          if (move !== undefined) {
            event.preventDefault();
            setActive((move + rows.length) % rows.length);
          } else if (event.key === "Enter") {
            event.preventDefault();
            const row = rows[current];
            if (row) choose(row);
          }
        }}
      />
      {showList && (
        <ul id={listId} role="listbox" aria-label="Locations" className="absolute z-20 mt-1 max-h-64 w-full overflow-y-auto rounded-md border border-ink bg-surface py-1 shadow-hard-sm">
          {results.isPending && <li className="px-3 py-2 text-[13px] text-muted">Searching…</li>}
          {results.isSuccess && rows.length === 0 && <li className="px-3 py-2 text-[13px] text-muted">No matches</li>}
          {rows.map((row, index) => (
            <li
              key={row.code}
              id={`${id}-option-${row.code}`}
              role="option"
              aria-selected={index === current}
              // Keeps focus in the input, so the blur handler does not close the list first.
              onMouseDown={(event) => event.preventDefault()}
              onMouseEnter={() => setActive(index)}
              onClick={() => choose(row)}
              className={cx(
                "flex cursor-pointer items-baseline justify-between gap-3 px-3 py-1.5 text-[13px]",
                index === current && "bg-sunken",
                row.code === value.code && "font-medium",
              )}
            >
              <span className="truncate">{row.name.replaceAll(",", ", ")}</span>
              <span className="shrink-0 font-mono text-[11px] uppercase text-faint">{row.type}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
