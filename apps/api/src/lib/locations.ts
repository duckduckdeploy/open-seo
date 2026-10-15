import { searchLocations } from "@openseo/yepapi";
import { badRequest } from "./errors";

export type LocationInfo = { code: number; name: string; country: string };

const cache = new Map<number, { at: number; info: LocationInfo }>();
const DAY = 24 * 3600_000;

/**
 * Name and ISO country (lowercase) of a YepAPI location code, from the free location list.
 * Several endpoints take a country instead of a code, so anything that changes a market must
 * know both. Throws rather than guessing when the code cannot be found.
 */
export async function locationInfo(code: number): Promise<LocationInfo> {
  const hit = cache.get(code);
  if (hit && Date.now() - hit.at < DAY) return hit.info;
  try {
    const { results } = await searchLocations(String(code));
    const match = results.find((row) => row.code === code);
    if (match?.country) {
      const info = { code, name: match.name, country: match.country.toLowerCase() };
      if (cache.size > 2000) cache.clear();
      cache.set(code, { at: Date.now(), info });
      return info;
    }
  } catch {
    // Reported below.
  }
  throw badRequest(`Could not find location ${code}. Pass country (e.g. "de") with it, or pick a location from search_locations.`);
}
