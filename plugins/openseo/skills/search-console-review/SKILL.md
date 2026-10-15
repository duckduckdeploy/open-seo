---
name: search-console-review
description: Review the site's own Google Search Console and Analytics data (free) to find queries one push from page one, pages losing ground and the pages most worth improving. Use when asked how the site is doing in search or what to improve next.
---

# Search Console review

Everything in this skill is free: it reads the user's own Google data.

## Steps

1. **Connected?** Call `get_google_connections`.
   - If Search Console is not connected, explain that it's free and read-only, and ask the user to connect it in the app under Search performance. Agents can't connect it. Stop there.
2. **The big picture.** Call `get_search_performance` with `range: "last_28_days"`. Report:
   - clicks, impressions, CTR and average position against the previous period
   - the direction of the daily series in one sentence

   Remember that the data lags about three days.
3. **Quick wins.**
   - The striking-distance list in the same result holds queries whose best page ranks 5 to 20.
   - Pick up to ten with the most impressions.
   - For each, say which page should be improved and how, for example: make the title match the query, add a section that answers it, or link to it from related pages.
4. **What's worth the effort.** Call `get_search_opportunities`.
   - With Analytics connected, the score includes the value of each page's visits; say which pages lead and why.
   - Without it, suggest connecting GA4 for better scores.
5. **Losses.** Compare the queries or pages that dropped:
   - call `get_search_console_rows` for `last_28_days` and for `last_3_months`, with `dimensions: ["page"]`
   - flag large declines and suggest checking them with the `seo-audit` skill
6. **Index check, if something looks wrong.** For up to ten important URLs, `inspect_urls` shows whether Google has them indexed and which canonical it chose.
7. **Report.** One paragraph on the state of the site, then a numbered list of up to five improvements, most valuable first. Offer to save striking-distance queries as keywords with `save_keywords`, tagged `search-console`.
