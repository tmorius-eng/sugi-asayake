# Self-review — Preference Profile v2 / Recommendation Engine v2 build (2026-09-01)

Written at Tom's explicit request, before the bulk auto-tag script is applied to the real catalog. This is not a status report — [CLAUDE.md](CLAUDE.md) already has one. This is a candid account of what I got wrong while building this feature, including the parts I only caught because Tom was watching the live page while I worked, not because I checked for them myself first.

## What went wrong

### 1. I shipped a scoring bug that made the recommender look badly broken, and Tom found it, not me

`getRecommendedProducts`'s v2 scoring gave `hasYoungChildren` (a single yes/no checkbox) the same weight (+3) as an exact `skinType`/`hairType` match. I wrote unit tests for the individual scoring functions and they all passed, because each test checked one signal in isolation. What I didn't do was run the actual scorer against a realistic multi-signal profile and look at the *composition* of the result list before calling it done.

The consequence: a shopper who picked skin concerns, a hair type, a fragrance preference, *and* "has young children" got a recommendation list that was 4-5 out of 5 baby products. Tom saw this live, on his own screen, and asked why every selection led back to baby items. The real cause was compounding, not just the weight — tagging coverage in production was still 4/937, so almost no non-baby product had a competing signal to score against — but +3 for a coarse category checkbox was always going to dominate once that condition held, and I had no test or manual check that would have surfaced that before it shipped.

I should have generated a synthetic "realistic shopper" profile (several signals at once, the way an actual person fills out a 6-step quiz) and read the resulting list myself before calling the feature done, the same way I eventually did *after* Tom flagged it. I had all the tools to do that already built (I used them within minutes of being told) — I just didn't do it proactively.

**Fix**: weight dropped +3 → +1 (same tier as `fragrancePreference`, a soft nudge not a dominant signal), `maxPerCategory` diversity cap tightened 4 → 3. Re-verified against Tom's own real saved preferences afterward.

### 2. I nearly shipped a second scoring bug, and caught this one myself, but only by accident of running the dry-run at all

Separately, the bulk auto-tag script's keyword matcher tagged "dryness" as a skin concern on 441 of 445 real skincare products (99%) — not because they're all genuinely dry-skin-focused products, but because nearly every product's long `description` field contains generic "чийгшүүлж..." (moisturizing) marketing boilerplate, including on a plain cleansing oil. I only found this because I happened to run the dry-run and skim the per-product output before treating the coverage number as good news — the topline number (4/937 → 496/937 tagged) looked like an unambiguous win, and it would have been easy to report that number and move on without checking *what* got tagged and whether it meant anything.

**Fix**: dropped the generic moisturizing-language rule, kept only specific ingredient mentions (hyaluronic acid) and explicit dry-skin phrases.

**The pattern connecting #1 and #2**: in both cases, a topline metric (a passing test, a coverage percentage) was true and also insufficient — the thing that actually mattered was the *distribution* of real output, and I only checked that thoroughly for #2, by luck of curiosity, not as a standing discipline. #1 slipped through because I didn't apply the same scrutiny to my own scoring code that I applied to the tagging script's output.

### 3. I offered a partial-coverage number as the finish line instead of building toward completeness by default

My original plan explicitly scoped the auto-tag script to a keyword-matching tier only, reasoning (correctly, on its own terms) that guessing is worse than leaving a field blank. That produced 113/937 tagged (12%) and I was prepared to present that as the deliverable. Tom rejected it immediately and explicitly: "937/937 болго" (make it 937/937), not 113/937. He was right to reject it — a feature whose stated purpose is "surface products from the *whole* 937-item catalog" doesn't do its job at 12% coverage, and I had reasoned my way to a defensible-sounding number without asking whether "defensible" and "useful" were the same bar here. They weren't.

**Fix**: added a second, explicitly-labeled tier — category-level defaults (e.g. `skinType: "normal"` for an untagged skincare product) — that only fires where the precise keyword tier found nothing, and is documented in the code as a default, not a confirmed fact, and deliberately excluded from the admin panel's "suggested tag" chips (which should only ever suggest things it actually found evidence for). This reached 937/937 in the dry-run while keeping the precise/coarse distinction honest instead of just lowering the bar for what counts as "tagged."

## A pattern worth naming across sessions, not just this one

[CLAUDE.md](CLAUDE.md)'s own history already documents two earlier incidents with the same shape: the sunrise-ribbon marquee shipped as "infinite, so it's fine" without checking `prefers-reduced-motion` interference until Tom insisted twice; the local-vs-Aiven `DATABASE_URL` incident where "images are gone" was diagnosed from code inspection before anyone ran `SELECT COUNT(*) FROM orders` to notice the DB itself was wrong. This session added a third: a scoring formula that looked correct function-by-function but wasn't checked as a composed whole against a realistic input before being called finished.

The common failure isn't any single piece of code — it's presenting internal confidence (tests pass, typecheck is clean, the logic reads correctly) as equivalent to having verified the actual user-visible outcome. All three incidents were fixed within minutes once someone actually looked at the real thing. The fix isn't "be more careful" in the abstract — it's a concrete habit: before calling something done, produce the actual output a real user would see (a rendered list, a live page, a query result) with realistic-not-minimal input, and read it, every time, not just when something is flagged as unusually risky.

## What's still open as of this document

- The bulk auto-tag script has only been dry-run, never applied to the real Aiven catalog. Tom asked for this self-review, a CLAUDE.md/HISTORY.md update, and a GitHub push to happen *before* that real write — this document is part of satisfying that sequencing, not a signal that the write has already happened.
- I have not re-run the full `RecommendedForYou`/related-products UI against a *post-apply* catalog yet (only against the current 4/937-tagged production state, post-fix). Once `--apply` runs for real, the result lists should be spot-checked again the same way #1 was caught — multiple realistic profiles, read the actual output, not just the coverage percentage.
