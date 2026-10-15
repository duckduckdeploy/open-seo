---
name: local-seo
description: Check a local business on Google Maps, including its profile, reviews and where it ranks street by street with a geo-grid, and plan improvements. Use for businesses that serve customers in an area, such as plumbers, clinics and restaurants.
---

# Local SEO

## Money rules (every OpenSEO skill)

- Rough costs:
  - `maps_search` $0.07
  - `maps_place` $0.05
  - `maps_reviews` from $0.01
  - a geo-grid $0.07 per point: 3×3 is $0.63, 5×5 is $1.75
- Before each paid call, run it with `dry_run: true` and say the price. Agree a limit and pass it as `max_cost_usd`. Always confirm a geo-grid's price before running it.
- End with what the paid calls cost in total.

## Steps

1. **Find the business.** Run `maps_search` with the business name and city. Confirm the right listing with the user, and note its place ID and coordinates.
2. **Profile.** Run `maps_place`. Check:
   - categories (is the primary one right?)
   - hours, phone and website
   - photos
   - anything missing

   Compare with the top two or three businesses for the main search, for example "plumber Austin", from step 1.
3. **Reviews.** Run `maps_reviews` with `depth: 50`. Summarise:
   - rating and volume against competitors
   - recent trend
   - recurring praise and complaints
   - how many reviews have an owner reply
4. **Where they rank.** Agree one main keyword and a grid:
   - 5×5 with 1 km spacing is a good start for a city business
   - 3×3 is cheaper for a first look

   Run `run_geo_grid` with `max_cost_usd`, then poll `get_geo_grid`. Describe where they are strong and where they drop off.
5. **Plan.** Three to five actions in order, for example:
   - fix the primary category
   - ask recent customers for reviews
   - reply to reviews
   - add service-area pages for weak areas
   - get listed in local directories
6. **Remember.** Save the place ID, main keyword and grid result in the project context with `update_project_context`, so the next grid can be compared.
