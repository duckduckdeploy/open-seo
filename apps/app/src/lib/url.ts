type Text = string | null | undefined;

/** Hostname without "www.", for a URL or a bare domain; "" when there is nothing to parse. */
export function hostOf(value: Text): string {
  if (!value) return "";
  try {
    return new URL(value.includes("://") ? value : `https://${value}`).hostname.replace(/^www\./, "");
  } catch {
    return value;
  }
}

/** Only http(s) links are ever rendered as anchors. */
export const safeHref = (value: Text): string | undefined => (value && /^https?:\/\//i.test(value) ? value : undefined);

/** Orders two values with empty ones (null, "", NaN) always last, whatever the direction. */
export function compareValues(a: string | number | null | undefined, b: string | number | null | undefined, order: "asc" | "desc"): number {
  const aEmpty = a == null || a === "" || (typeof a === "number" && Number.isNaN(a));
  const bEmpty = b == null || b === "" || (typeof b === "number" && Number.isNaN(b));
  if (aEmpty || bEmpty) return aEmpty === bEmpty ? 0 : aEmpty ? 1 : -1;
  const result = typeof a === "number" && typeof b === "number" ? a - b : String(a).localeCompare(String(b), undefined, { numeric: true, sensitivity: "base" });
  return order === "asc" ? result : -result;
}
