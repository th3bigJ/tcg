# Price Scraper Prompts

Run an individual series with:

```bash
node --import tsx/esm scripts/scrapePricing.ts --series="SERIES NAME"
```

You can also use the npm script form:

```bash
npm run scrape:pricing -- --series="SERIES NAME"
```

## Individual Series

```bash
npm run scrape:pricing -- --series="Miscellaneous"
```

```bash
npm run scrape:pricing -- --series="Base"
```

```bash
npm run scrape:pricing -- --series="Gym"
```

```bash
npm run scrape:pricing -- --series="Neo"
```

```bash
npm run scrape:pricing -- --series="Legendary Collection"
```

```bash
npm run scrape:pricing -- --series="E-Card"
```

```bash
npm run scrape:pricing -- --series="EX"
```

```bash
npm run scrape:pricing -- --series="Diamond & Pearl"
```

```bash
npm run scrape:pricing -- --series="POP"
```

```bash
npm run scrape:pricing -- --series="Platinum"
```

```bash
npm run scrape:pricing -- --series="HeartGold & SoulSilver"
```

```bash
npm run scrape:pricing -- --series="Call of Legends"
```

```bash
npm run scrape:pricing -- --series="Black & White"
```

```bash
npm run scrape:pricing -- --series="XY"
```

```bash
npm run scrape:pricing -- --series="Trainer kits"
```

```bash
npm run scrape:pricing -- --series="Sun & Moon"
```

```bash
npm run scrape:pricing -- --series="McDonald's Collection"
```

```bash
npm run scrape:pricing -- --series="Sword & Shield"
```

```bash
npm run scrape:pricing -- --series="Scarlet & Violet"
```

```bash
npm run scrape:pricing -- --series="Mega Evolution"
```

## Full Scrape In 4 Batches

These four prompts cover all current series in the repo, split into roughly even chunks of about 5,000 cards each.

### Batch 1

Approx. 5,387 cards.

```bash
npm run scrape:pricing -- --series="Sword & Shield,Base,Neo,Gym,POP,Legendary Collection,Call of Legends,McDonald's Collection,Trainer kits"
```

### Batch 2

Approx. 5,293 cards.

```bash
npm run scrape:pricing -- --series="Scarlet & Violet,Diamond & Pearl,Mega Evolution"
```

### Batch 3

Approx. 4,947 cards.

```bash
npm run scrape:pricing -- --series="Sun & Moon,Black & White,E-Card"
```

### Batch 4

Approx. 4,587 cards.

```bash
npm run scrape:pricing -- --series="XY,EX,Platinum,HeartGold & SoulSilver"
```

## Scrydex card metadata (printed number, attacks, rules)

Same four batch groupings: see `docs/scrydex-card-meta-scrape.md`. After each run, gaps are appended to `docs/scrydex-card-meta-gaps.md`.

npm run backfill:price-history -- --series="Sword & Shield,Base,Neo,Gym,POP,Legendary Collection,Call of Legends,McDonald's Collection,Trainer kits"

npm run backfill:price-history -- --series="Scarlet & Violet,Diamond & Pearl,Mega Evolution"

npm run backfill:price-history -- --series="Sun & Moon,Black & White,E-Card"

npm run backfill:price-history -- --series="XY,EX,Platinum,HeartGold & SoulSilver"


npm run portfolio:snapshot