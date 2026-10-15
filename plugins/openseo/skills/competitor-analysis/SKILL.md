---
name: competitor-analysis
description: Understand a competitor's search strategy, including their traffic, best keywords, top pages and the keyword gap with the user's site, and turn it into a short plan. Use when asked about competitors or why someone outranks the user.
---

# Competitor analysis

## Money rules (every OpenSEO skill)

- Rough costs: `domain_overview` $0.14 (or $0.08 for totals only), `domain_keywords` and `keyword_gap` from $0.03, `backlinks_summary` $0.05.
- Before each paid call, run it with `dry_run: true` and say the price. Agree one limit for the whole analysis and pass it as `max_cost_usd`. A full analysis of one competitor is usually under $0.60.
- End with what the paid calls cost in total.

## Steps

1. **Who.** Read `get_project` for the user's domain and known competitors.
   - If the user names none, find them with `competitors_domain` (organic overlap) or `competitors_serp` on the user's main keywords.
   - If a rank tracker exists, `get_rank_competitors` shows who keeps appearing, for free.
2. **Size them up.** For each competitor, at most three:
   - `domain_overview`: traffic, keyword count, ranking distribution
   - `domain_pages`: the pages that bring them the most traffic
3. **Their best keywords.** Run `domain_keywords` sorted by traffic. Note the topics, not just the words.
4. **The gap.** Run `keyword_gap` with the user's domain and the competitor's. It shows keywords the competitor ranks for and the user doesn't. Pick the ones that match the user's business.
5. **Links, if relevant.** If they clearly win on authority:
   - compare with `backlinks_summary` on both domains
   - use `link_intersect` to find sites linking to competitors but not to the user
6. **Plan.** Report what the competitor does well, in three bullets, and where the user can win, as three to five actions:
   - pages to create or improve
   - keywords to target
   - link opportunities
7. **Remember.** Add the competitors and the findings to the project context with `update_project_context`, and offer to save the gap keywords with `save_keywords`.
