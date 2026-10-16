"use client";

import { Monitor, Moon, Sun } from "lucide-react";
import { useEffect, useState } from "react";
import { THEME_KEY as KEY } from "@/lib/theme-script";
import { cx } from "./ui";

export type Theme = "system" | "light" | "dark";

function readTheme(): Theme {
  const value = document.documentElement.getAttribute("data-theme");
  return value === "light" || value === "dark" ? value : "system";
}

function applyTheme(theme: Theme) {
  if (theme === "system") document.documentElement.removeAttribute("data-theme");
  else document.documentElement.setAttribute("data-theme", theme);
  try {
    if (theme === "system") localStorage.removeItem(KEY);
    else localStorage.setItem(KEY, theme);
  } catch {
    // Storage blocked: the cookie below still remembers it.
  }
  document.cookie = theme === "system" ? `${KEY}=; path=/; max-age=0; samesite=lax` : `${KEY}=${theme}; path=/; max-age=31536000; samesite=lax`;
}

const OPTIONS: { value: Theme; label: string; icon: typeof Sun }[] = [
  { value: "system", label: "System", icon: Monitor },
  { value: "light", label: "Light", icon: Sun },
  { value: "dark", label: "Dark", icon: Moon },
];

/** System, light or dark, as a row of radio buttons (arrow keys move between them). */
export function ThemeSwitcher() {
  const [theme, setTheme] = useState<Theme>("system");
  useEffect(() => setTheme(readTheme()), []);

  function choose(next: Theme) {
    setTheme(next);
    applyTheme(next);
  }

  return (
    <div role="radiogroup" aria-label="Theme" className="flex rounded-md border border-line bg-sunken p-0.5">
      {OPTIONS.map(({ value, label, icon: Icon }, index) => {
        const checked = theme === value;
        return (
          <button
            key={value}
            type="button"
            role="radio"
            aria-checked={checked}
            tabIndex={checked ? 0 : -1}
            title={`${label} theme`}
            onClick={() => choose(value)}
            onKeyDown={(event) => {
              const step = event.key === "ArrowRight" || event.key === "ArrowDown" ? 1 : event.key === "ArrowLeft" || event.key === "ArrowUp" ? -1 : 0;
              if (!step) return;
              event.preventDefault();
              const next = OPTIONS[(index + step + OPTIONS.length) % OPTIONS.length] as (typeof OPTIONS)[number];
              choose(next.value);
              (event.currentTarget.parentElement?.children[OPTIONS.indexOf(next)] as HTMLElement | undefined)?.focus();
            }}
            className={cx(
              "flex flex-1 items-center justify-center gap-1.5 rounded px-2 py-1 text-xs",
              checked ? "bg-surface font-medium text-ink shadow-sm" : "text-muted hover:text-ink",
            )}
          >
            <Icon className="size-3.5" aria-hidden />
            {label}
          </button>
        );
      })}
    </div>
  );
}
