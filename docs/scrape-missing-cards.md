# Plan: Scrape Missing Cards from Pokémon TCG API

## Context

This project imports card data from two sources:
1. **TCGdex SDK** (`@tcgdex/sdk`) — primary source, has gaps (missing promos, mega evolutions, etc.)
2. **Local JSON files** (`data/cards/en/{setCode}.json`) — fallback source, already supported by the import pipeline

The fix: use the **Pokémon TCG API** (`https://api.pokemontcg.io/v2`) to fill gaps, save results as local JSON files, then run the existing import pipeline.

---

## Step 1 — Create `scripts/fetchMissingCards.ts`

Write a script that:

1. Accepts `--set=<setCode>` CLI arg (e.g. `--set=xyp`)
2. Fetches all cards for that set from pokemontcg.io:
   ```
   GET https://api.pokemontcg.io/v2/cards?q=set.id:{setCode}&pageSize=250
   ```
   - If you have an API key, pass header `X-Api-Key: <key>` (optional, raises rate limit)
   - Handle pagination: check `page`, `pageSize`, `count`, `totalCount` in the response
3. Maps each card to the `JsonCard` shape already used in this project (see `scripts/importSetCardsFromJson.ts` lines 11–27):

```typescript
type JsonCard = {
  id: string;                        // card.id  e.g. "xyp-XY01"
  name: string;                      // card.name
  supertype?: string;                // card.supertype  e.g. "Pokémon"
  subtypes?: string[];               // card.subtypes
  hp?: string;                       // card.hp
  types?: string[];                  // card.types
  evolvesFrom?: string;              // card.evolvesFrom
  number?: string;                   // card.number
  artist?: string;                   // card.artist
  rarity?: string;                   // card.rarity
  nationalPokedexNumbers?: number[]; // card.nationalPokedexNumbers
  images?: {
    small?: string;                  // card.images.small
    large?: string;                  // card.images.large
  };
};
```

4. Writes the array to `data/cards/en/{setCode}.json` (create directories if needed)
5. Logs how many cards were fetched and the output path

### pokemontcg.io response shape (reference)

```json
{
  "data": [
    {
      "id": "xyp-XY01",
      "name": "Pikachu",
      "supertype": "Pokémon",
      "subtypes": ["Basic"],
      "hp": "60",
      "types": ["Lightning"],
      "evolvesFrom": null,
      "number": "XY01",
      "artist": "Kagemaru Himeno",
      "rarity": "Promo",
      "nationalPokedexNumbers": [25],
      "images": {
        "small": "https://images.pokemontcg.io/xyp/XY01.png",
        "large": "https://images.pokemontcg.io/xyp/XY01_hires.png"
      },
      "set": { "id": "xyp", "name": "XY Black Star Promos" }
    }
  ],
  "page": 1,
  "pageSize": 250,
  "count": 250,
  "totalCount": 273
}
```

The field names are an exact match to `JsonCard` — minimal transformation needed.

---

## Step 2 — Add the script to `package.json`

Add a script entry so it can be run easily:

```json
"fetch:missing": "tsx scripts/fetchMissingCards.ts"
```

---

## Step 3 — Run the fetch script for each missing set

Sets most likely to have missing mega/promo cards:

| Set Code | Name |
|---|---|
| `xyp` | XY Black Star Promos (includes all Mega EX promos) |
| `xy12` | Evolutions |
| `xy11` | Steam Siege |
| `xy10` | Fates Collide |
| `xy9` | BREAKpoint |
| `xy8` | BREAKthrough |
| `xy7` | Ancient Origins |
| `xy6` | Roaring Skies |
| `xy5` | Primal Clash |
| `xy4` | Phantom Forces |
| `xy3` | Furious Fists |
| `xy2` | FlashFire |
| `xy1` | XY Base |
| `me1` | Mega Battle Deck — if not in pokemontcg.io, add manually |
| `me2` | Mega Battle Deck 2 — same as above |

Run for each:
```bash
npm run fetch:missing -- --set=xyp
npm run fetch:missing -- --set=xy1
# etc.
```

---

## Step 4 — Import the JSON files

Once the JSON files are in `data/cards/en/`, run the existing import pipeline. The script at `scripts/importSetCardsFromJson.ts` already handles this format:

```bash
# Check how this script is invoked — look for its package.json entry or run directly:
tsx scripts/importSetCardsFromJson.ts --set=xyp
```

The importer will:
- Read `data/cards/en/xyp.json`
- Try to enrich with TCGdex data (will partially work or skip)
- Create `MasterCardList` records and download images to `CardMedia`
- Update `docs/card-import-status.md`

---

## Step 5 — Handle sets not in pokemontcg.io

Some sets (`me1`, `me2`, `me2pt5` — Mega Battle Decks) may not exist in pokemontcg.io. For those:

1. Check if the file already exists in `data/cards/en/` (many already do — see existing files)
2. If it exists but cards are missing, manually append entries to the JSON array using the `JsonCard` format
3. Image URLs can point to TCGdex CDN directly:
   ```
   https://assets.tcgdex.net/en/{setCode}/{localId}/high.webp
   https://assets.tcgdex.net/en/{setCode}/{localId}/low.webp
   ```

---

## Notes

- The `externalId` stored per card uses the format `{setCode}-{localId}` (e.g. `xyp-XY01`) — pokemontcg.io `card.id` follows this exact same format, so deduplication will work correctly
- pokemontcg.io images are hosted at `images.pokemontcg.io` — they're stable CDN URLs
- No API key needed for low volume; get a free key at https://pokemontcg.io if hitting rate limits
- After import, verify counts in `docs/card-import-status.md`
