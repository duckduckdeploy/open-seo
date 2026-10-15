// Normalise user input ("https://www.Example.com/path") to a bare hostname.
export function toDomain(input: string): string {
  const trimmed = input.trim().toLowerCase();
  try {
    const url = new URL(trimmed.includes("://") ? trimmed : `https://${trimmed}`);
    return url.hostname.replace(/^www\./, "");
  } catch {
    return trimmed.replace(/^www\./, "").replace(/\/.*$/, "");
  }
}

export function hostOf(url: string): string | null {
  try {
    return new URL(url).hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return null;
  }
}

// True when host is the domain itself or one of its subdomains.
export function hostMatches(host: string | null, domain: string): boolean {
  if (!host) return false;
  const d = domain.toLowerCase().replace(/^www\./, "");
  return host === d || host.endsWith(`.${d}`);
}
