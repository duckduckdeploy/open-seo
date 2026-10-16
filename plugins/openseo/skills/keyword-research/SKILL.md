---
name: keyword-research
description: Find keywords worth targeting from a seed topic, group them into topics with intent and difficulty, and save the best ones to the project. Use when asked for keywords, content ideas or topics to write about.
---

# Keyword research

## Money rules (every OpenSEO skill)

- `keyword_ideas` costs about $0.08 for 150 ideas, and a repeat within 7 days is free.
- Before each paid call, run it with `dry_run: true`, say the price and agree a limit. Pass that limit as `max_cost_usd`.
- `list_saved_keywords` and Search Console are free; check them first.
- End with what the paid calls cost in total.

## Steps

1. **Context.** Read `get_project` for the business, audience and market. Check `list_saved_keywords` so you don't repeat work.
2. **Seeds.** Agree one to three seed terms with the user: what a customer would type, not internal jargon.
   - If Search Console is connected, `get_search_console_rows` with `dimensions: ["query"]` shows the words people already use to find the site, for free.
3. **Ideas.** For each seed:
   1. Run `keyword_ideas` with `dry_run: true`, then for real with `max_cost_usd`.
   2. Use `minVolume`, `maxDifficulty` or `minWords` to keep the list relevant. For a young site, start with `maxDifficulty` around 30.
4. **Group.** Cluster the ideas by topic: keywords one page could rank for together. For each cluster give:
   - the main keyword
   - the total volume
   - the typical difficulty
   - the intent (learn, compare, buy, find)
   - one line on the page that would serve it
5. **Choose.** Rank the clusters by fit with the business goal, then by volume against difficulty. Recommend three to five to start with, and say why.
6. **Save.** With the user's go-ahead, save the chosen keywords with `save_keywords`. Pass the metrics you already have, and tags by cluster, for example `topic:drain-cleaning`.
7. **Next.** Offer to track them: `create_rank_tracker` plus `add_rank_keywords` are free to set up, and a check costs $0.10 per keyword and device (the top 100 results).
