Context
Before building out new financial features (transaction improvements, market value tracking, profit reporting), the user wants to audit the current logging to identify gaps. This plan documents what's working, what's missing, and proposes a minimal set of logging fixes that should be in place before adding new features on top.

Current State Summary
What's Working
account_transactions table captures:

direction (purchase/sale), product_type_id, description, master_card_id, quantity, unit_price, transaction_date, notes
Auto-created on collection add (when purchase_type = 'bought' + price_paid set) — /app/api/collection/route.ts:136-155
Auto-created on card removal with reason "sold" — /components/CardGrid.tsx

P&L calculation in TransactionsClient.tsx:
netPnl = totalSold + currentCollectionValue - totalSpent
Market value calculated on-demand from TCGPlayer/CardMarket/Scrydex via estimateCollectionMarketValueGbp() — /lib/collectionMarketValueGbp.ts

Identified Logging Gaps (Prioritised)
Priority 1 — Gaps that corrupt P&L (fix before new features)
GapImpactWhere it happensTrade completion creates no financial logUnrealised gains/losses from trades invisiblecomplete_profile_share_trade() stored proc — no INSERT into account_transactionsNon-sale card removals not loggedCost basis never written off for lost/gifted/damaged/built_deck cardsCardGrid.tsx — removes card but skips transaction for non-"sold" reasons"Traded" removal creates no sale transactionGiving cards in a trade shows no outgoing valueSame as above — "traded" removal goes straight to delete
Priority 2 — Missing context (makes data unreliable without)
GapImpactNo collection value snapshotsP&L at a point-in-time is unrecoverable; can't produce historical chartsNo transaction edit audit trailEdits to unit_price/quantity are silent overwrites — no before/afterGrading/condition change not loggedCollection value change from condition upgrade invisible
Priority 3 — Nice-to-have (add when building new features)
GapImpactNo fee/expense transaction sub-typeGrading fees, postage, platform fees mix with purchase cost basisNo price source metadataCan't explain valuation swings when pricing source changesNo realized vs. unrealized gains splitAll P&L shown as one numberNo per-card P&L (cost basis per unit)Can't know profit on individual card sales

Recommended Fixes (Logging Sufficiency Baseline)
These are the minimum changes to make the existing P&L correct before layering new features:
Fix 1: Log non-sale card removals as write-offs
File: /components/CardGrid.tsx (removal confirmation handler)
When removal reason is lost, damaged, gifted, built_deck, or traded:

POST to /api/transactions with direction: 'purchase' (as a negative cost event) OR introduce a new direction value write-off
Log: unit_price: price_paid (cost basis), notes: "removed: {reason}", master_card_id


Simplest approach: add a write-off direction to account_transactions.direction check constraint and handle it in the P&L formula.

Fix 2: Log trade completion as paired transactions
File: /supabase/migrations/ — new migration extending complete_profile_share_trade()
When a trade completes:

For each card the user gives: INSERT a sale transaction at the agreed trade valuation (or current market price)
For each card the user receives: INSERT a purchase transaction at same valuation
notes field: reference the trade_id for linkage


Use the existing account_transactions table — no schema change needed beyond including trade_id in notes, or optionally adding a nullable trade_id uuid FK column.

Fix 3: Collection value snapshot (lightweight)
New table: customer_collection_value_snapshots
sqlid uuid PRIMARY KEY,
customer_id integer,
total_value_gbp numeric(12,2),
card_count integer,
snapshot_date date,
created_at timestamptz DEFAULT now()
Populated by: a daily/weekly background job (or on-demand when user visits the transactions page).
This unblocks historical P&L charts without requiring full price history per card.

Files to Modify
FileChange/components/CardGrid.tsxAdd write-off transaction logging for non-sale removals/app/api/transactions/route.tsAccept write-off as valid direction (or handle in validation)/supabase/migrations/new_file.sqlExtend complete_profile_share_trade() to INSERT transactions; optionally add snapshots table/app/(app)/account/transactions/TransactionsClient.tsxUpdate P&L formula to account for write-offs if new direction added

Verification

Add a card as "bought" → verify account_transactions row created ✓ (already works)
Remove a card as "lost" → verify write-off transaction created (new)
Complete a trade → verify sale + purchase transactions created in account_transactions (new)
Check transactions page P&L before/after — numbers should now reflect full cost basis


Out of Scope (for now)

Tax lot tracking, FIFO/LIFO cost basis
Currency conversion logging
Per-card profit breakdown UI
Fee/expense sub-types
Real-time price history per card


Potential New Features (Ideas for Discussion)
Once logging is solid, these are the most valuable things to build:
High Value
1. Realized vs. Unrealized P&L Split
Currently everything is one number. Split it:

Realized = actual sale proceeds minus cost basis of sold cards
Unrealized = current market value of held collection minus what you paid for it
Requires tracking cost basis per collection entry (already partially there via price_paid)

2. Per-Card Profit on Sale
When a card is sold, calculate and display: sale_price - price_paid = profit/loss
Show a "most profitable sales" list. Needs cost basis lookup at time of sale.
3. Portfolio Value Over Time Chart
Using the value snapshots table (Fix 3), plot collection value as a line chart.
Answer: "Is my collection growing in value month over month?"
4. Collection Price vs. Cost Basis per Card
In the card grid, show each card with a +/- indicator against its purchase price.
Green = current market > what you paid. Red = underwater. Requires price_paid to be reliably populated.
5. Set/Expansion Performance
Group collection by set, show:

Total spent on cards from that set
Current market value
Net gain/loss and % ROI per set
Useful for knowing which expansions were good investments.

Medium Value
6. Expense Tracking Sub-Type
Add direction: 'expense' or a dedicated expense_type to transactions.
Track: grading fees, shipping, platform seller fees, storage supplies.
These reduce actual profit but aren't card purchases.
7. Booster Box / Pack EV Tracking
When you open packs, log what you pulled vs. what the box cost.
Calculate: actual pull value / box price = % of box value recovered.
Could be as simple as a "pack opening session" transaction group.
8. Trade History Value Summary
Show all completed trades with: cards given (value at time), cards received (value at time), cash exchanged, net gain/loss from trade.
Currently trades are invisible to P&L.
9. ROI Metrics Dashboard
Top-level stats:

Overall ROI % (unrealized + realized gains / total spent)
Best performing card, set, year
Average hold time for sold cards
Monthly spend/income chart


Reporting Improvements
The current reporting in TransactionsClient.tsx is one page with three numbers (total spent, total sold, net P&L) and a period filter. Here's what would make it genuinely useful:
Reporting — High Value
1. P&L Summary Card (improved)
Current: Three raw numbers.
Improved version:

Realized P&L (from completed sales)
Unrealized P&L (collection value vs. cost basis of held cards)
Total invested (all-time spend, adjusted for write-offs)
Collection current value
Overall ROI %

2. Monthly Spend / Income Chart
Bar chart: month on X axis, spend vs. income as paired bars.
Instantly shows seasonality (do you spend more around set releases?) and whether you're net positive.
Data: already exists in account_transactions, just needs grouping by month.
3. Transaction Table Improvements
Current table is a plain list. Improvements:

Show profit/loss column on sale rows (sale price - cost basis of that card)
Group by date or product type
Filter by card name / master_card_id
Sort by any column
Inline expand to see collection entry for that card

4. Set/Expansion Breakdown Report
Table of sets you own cards from:
| Set | Cards | Spent | Current Value | Gain/Loss | ROI % |
Shows which sets were good investments vs. money pits.
5. Collection Value Trend
Line chart of collection value over time (requires snapshot table from Fix 3).
Overlay key events: "added 50 cards", "sold 10 cards", "new set released".
Reporting — Medium Value
6. Top Performers / Worst Performers

Top 10 cards by unrealized gain (current value vs. price paid)
Top 10 cards by realized profit (already sold)
Cards currently underwater (worth less than paid)

7. Purchase Type Breakdown
Pie/donut chart: what % of your collection came from packs vs. bought vs. traded?
And what's the current value of each segment vs. cost?
8. Velocity Metrics

Cards added per month
Cards sold per month
Average hold time before selling
Sell-through rate: what % of bought cards get sold vs. kept?

9. Product Type Report
Using product_type_id already on transactions:
Show P&L broken down by: singles, booster packs, ETBs, booster boxes, etc.
Which product type has been the best ROI?
Reporting — Nice to Have
10. Printable / Exportable Reports
CSV export of the transactions table with computed cost basis and gain per row.
PDF snapshot of portfolio value on a given date (for insurance, tax, etc.).

Lower Priority
11. Spending Budget / Goals
Set a monthly or annual spend budget. Show progress and warn when approaching limit.
11. Tax Report Export
Generate a CSV with: item description, purchase date + cost, sale date + proceeds, gain/loss.
Simplest version just exports the transactions table with computed gain per row.
12. Market Price Alerts
Trigger a notification when a wishlisted card drops to a target price.
Builds on the existing wishlist system (customer_wishlists table).