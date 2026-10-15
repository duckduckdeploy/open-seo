import { AppError, notFound, parse } from "../lib/errors";
import { cached, getYep } from "../lib/yep";
import { type Estimate, lookupByName, type Market } from "./lookups";

export type LookupOptions = { refresh?: boolean; dryRun?: boolean; maxCostUsd?: number };

/**
 * Refuses a lookup whose worst-case price is above the ceiling. Lookups with no upper price
 * (token-priced AI) are refused only when their minimum is above it; they receive the ceiling
 * in `run` and stop calling once it would be crossed.
 */
export function assertWithinCeiling(estimate: Estimate, maxCostUsd: number | undefined) {
  if (maxCostUsd == null) return;
  const worst = estimate.max ?? estimate.min;
  if (worst > maxCostUsd) {
    const amount = estimate.max == null ? `at least $${worst.toFixed(2)}` : `up to $${worst.toFixed(2)}`;
    throw new AppError(
      400,
      "cost_ceiling_exceeded",
      `This would cost ${amount}, above the $${maxCostUsd.toFixed(2)} ceiling. Raise max_cost_usd or reduce the request.`,
      { estimate },
    );
  }
}

export async function runLookup(userId: string, project: Market, name: string, rawInput: unknown, options: LookupOptions = {}) {
  const lookup = lookupByName.get(name);
  if (!lookup) throw notFound(`Lookup "${name}"`);
  const input = parse(lookup.input, rawInput ?? {});
  const estimate = lookup.estimate(input, project);
  if (options.dryRun) return { name, estimate, dryRun: true as const };
  assertWithinCeiling(estimate, options.maxCostUsd);

  // The project's market is part of the cache key because it fills in omitted location fields.
  const cacheParams = { input, market: [project.locationCode, project.country, project.language] };
  const result = await cached(userId, name, cacheParams, lookup.ttl, options.refresh ?? false, async () => {
    const yep = await getYep({ userId, projectId: project.id, feature: lookup.feature });
    return lookup.run(yep, input, project, { maxCostUsd: estimate.max == null ? options.maxCostUsd : undefined });
  });
  return { name, estimate, ...result };
}
