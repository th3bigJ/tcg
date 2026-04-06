# Scrydex card metadata scrape

This job reads `data/cards/{setCode}.json`, fetches each card’s Scrydex detail page, and writes back:

| Field | Source on Scrydex |
| --- | --- |
| `externalId` | Dev pane `id` (e.g. `me2pt5-256`) |
| `cardNumber` | `printed_number` when present (e.g. `256/217`) |
| `fullDisplayName` | Rebuilt when `cardNumber` changes (same pattern as seed scripts) |
| `attacks` | Attack table: `name` + `damage` (Pokémon); omitted when none |
| `rules` | Rules text under **Details** (mainly Trainer cards) |

Static data is uploaded to R2 as `data/cards/{setCode}.json` by `npm run r2:upload-static-data` — run that after batches if the bucket should match the repo.

## Commands

Single series:

```bash
npm run scrape:scrydex-card-meta -- --series="SERIES NAME"
```

Dry run (no file writes):

```bash
npm run scrape:scrydex-card-meta -- --dry-run --series="SERIES NAME"
```

Optional: label a run in the gaps log (see below):

```bash
npm run scrape:scrydex-card-meta -- --series="..." --batch-name="Batch 1"
```

Single or comma-separated set codes:

```bash
npm run scrape:scrydex-card-meta -- --set=sv1,me2
```

## Concurrency

Set `SCRYDEX_CARD_META_CONCURRENCY` (default `12`) if you need to lower load on Scrydex.

## Four batch prompts (same series groupings as pricing)

These mirror the “Full scrape in 4 batches” split in `docs/scraper.md`.

### Batch 1

```bash
npm run scrape:scrydex-card-meta -- --series="Sword & Shield,Base,Neo,Gym,POP,Legendary Collection,Call of Legends,McDonald's Collection,Trainer kits" --batch-name="Batch 1"
```

### Batch 2

```bash
npm run scrape:scrydex-card-meta -- --series="Scarlet & Violet,Diamond & Pearl,Mega Evolution" --batch-name="Batch 2"
```

### Batch 3

```bash
npm run scrape:scrydex-card-meta -- --series="Sun & Moon,Black & White,E-Card" --batch-name="Batch 3"
```

### Batch 4

```bash
npm run scrape:scrydex-card-meta -- --series="XY,EX,Platinum,HeartGold & SoulSilver" --batch-name="Batch 4"
```

## Gaps report

After each run, the script **appends** a section to:

`docs/scrydex-card-meta-gaps.md`

That file lists counts and samples for:

- Sets with no Scrydex expansion mapping
- Cards with no list path (could not match a listing URL)
- Fetch or parse failures (no Scrydex `id` in HTML)
- Cards where `printed_number` was still empty after parse
- Trainer cards where **Rules** text was missing (unexpected)

Review that file after each batch to see what could not be filled automatically.
