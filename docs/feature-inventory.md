# Feature inventory

Every feature in Runway Tomorrow and where it lives in the four-tab layout (Today, Plan, Money, Accounts).
Each row is checked by `npm run test:features` (scripts/feature-check.mjs), which opens the demo and uses the feature. A missing or broken feature fails the check.

| # | Area | Feature | Where | Before | Check |
|---|---|---|---|---|---|
| 1 | Today | Today's limit, status pill and days to payday | Today | same | `today-limit` |
| 2 | Today | Can I afford it? button | Today | same | `today-afford` |
| 3 | Today | Noticed line linking to Trends | Today | same | `today-noticed` |
| 4 | Today | How did it go? plan check-ins | Today | same | `today-checkins` |
| 5 | Today | Daily limits strip for the days ahead | Today | same | `today-daily-limits` |
| 6 | Today | Plans list with + Add | Today | same | `today-plans` |
| 7 | Today | Next 30 days | Today | same | `today-next30` |
| 8 | Today | Snapshot tiles | Today | same | `today-snapshot` |
| 9 | Today | Coming up | Today | same | `today-coming` |
| 10 | Today | A plan opens in a pop-up with its answer | Today | same | `today-plan-popup` |
| 11 | Today | Plan pop-up: tap the planned amount to set your own | Today | same | `plan-amount-edit` |
| 12 | Everywhere | ⓘ bubbles open inside pop-ups | Today | same | `info-in-popup` |
| 13 | Plan · Month | Month grid with daily limits and ‹ › months | Plan → Month | Calendar tab | `cal-month` |
| 14 | Plan · Month | Tap a day: its limit and plans | Plan → Month | Calendar tab | `cal-day` |
| 15 | Plan · Month | + Add a plan (with live what-if) | Plan → Month | Calendar tab | `cal-add` |
| 16 | Plan · Month | Sync all | Plan → Month | Calendar tab | `cal-sync` |
| 17 | Plan · Month | How your plans went | Plan → Month | Calendar tab | `cal-history` |
| 18 | Plan · Month | Connected calendars, connect a link, upload a file | Plan → Month | Calendar tab | `cal-connect` |
| 19 | Plan · Month | Where to find the iCal link (Google, Apple, Outlook) | Plan → Month | Calendar tab | `cal-help` |
| 20 | Plan · What if | What if I spend: amount, plan chips and quick picks | Plan → What if (also Today → Can I afford it?) | What if tab | `wi-ask` |
| 21 | Plan · What if | When: today, Saturday, payday, best time to buy | Plan → What if (also Today → Can I afford it?) | What if tab | `wi-when` |
| 22 | Plan · What if | Debit vs credit, when cash leaves | Plan → What if (also Today → Can I afford it?) | What if tab | `wi-pay` |
| 23 | Plan · What if | Add to my plans | Plan → What if (also Today → Can I afford it?) | What if tab | `wi-add` |
| 24 | Plan · What if | What-if scenarios (raise, cancel, skip, cushion) | Plan → What if (also Today → Can I afford it?) | What if tab | `wi-scenarios` |
| 25 | Plan · Days | Lowest ahead with chart | Plan → Days | Forecast tab | `fc-lowest` |
| 26 | Plan · Days | Key days | Plan → Days | Forecast tab | `fc-keydays` |
| 27 | Plan · Days | Card's next bill | Plan → Days | Forecast tab | `fc-card` |
| 28 | Plan · Days | Max bill without savings, both statements, how it adds up | Plan → Days | Forecast tab | `fc-max` |
| 29 | Plan · Days | Day by day 30/60/90 with lean tags | Plan → Days | Forecast tab | `fc-days` |
| 30 | Plan · Days | Open a day: why its limit, plans, bills | Plan → Days | Forecast tab | `fc-day-open` |
| 31 | Money | Income − Fixed − Spent = Net, each tappable | Money → Month | same | `mo-tiles` |
| 32 | Money | Budget with groups and category editor | Money → Month | same | `mo-budget` |
| 33 | Money | New category (name, symbol, color) | Money → Month | same | `mo-newcat` |
| 34 | Money | Transactions by day with search, account and time filters | Money → Activity | same | `ac-list` |
| 35 | Money | Category chips with totals | Money → Activity | same | `ac-chips` |
| 36 | Money | A transaction: category, repeats, history, edit | Money → Activity | same | `ac-txn` |
| 37 | Money | Recategorize: just this one or all with this name | Money → Activity | same | `ac-recat` |
| 38 | Money | Edit or delete a category from the picker (✎) | Money → Activity | same | `ac-cat-edit` |
| 39 | Money | Income − Bills = Left, % of income, over time | Money → Bills | same | `bi-overview` |
| 40 | Money | Repeating items by kind, + Add | Money → Bills | same | `bi-repeating` |
| 41 | Money | Found in your history: add as repeating | Money → Bills | same | `bi-found` |
| 42 | Money | Noticed: lead insight with evidence and actions | Money → Trends | same | `tr-noticed` |
| 43 | Money | Categories vs average (+/−) | Money → Trends | same | `tr-cats` |
| 44 | Money | Category pop-up: tiles, bars, months, drill into a name | Money → Trends | same | `tr-cat-popup` |
| 45 | Money | ✎ on a category pop-up | Money → Trends | same | `tr-cat-pencil` |
| 46 | Money | Net cash flow by month or pay period | Money → Trends | same | `tr-flow` |
| 47 | Accounts | Net worth, accounts and cards | Accounts | same | `acc-list` |
| 48 | Accounts | Goals (protected ones never suggested) | Accounts | same | `acc-goals` |
| 49 | Accounts | A card: statement, max bill, how you pay it | Accounts | same | `acc-card` |
| 50 | Settings | Profile, appearance, morning note, everyday purchases | Settings (⚙ in Accounts and the header) | same | `set-profile` |
| 51 | Settings | Forecast & advice (cushion etc.) | Settings (⚙ in Accounts and the header) | same | `set-forecast` |
| 52 | Settings | Categories: rename, symbol, color, delete | Settings (⚙ in Accounts and the header) | same | `set-categories` |
| 53 | Settings | What we remember, decisions | Settings (⚙ in Accounts and the header) | same | `set-memory` |
| 54 | Settings | Hide amounts, export, delete data and account | Settings (⚙ in Accounts and the header) | same | `set-privacy` |
| 55 | Everywhere | Pull a pop-up down to close it | Money → Trends | same | `swipe-close` |
| 56 | Everywhere | Bottom bar: Today, Plan, Money, Accounts | Today | same | `nav` |
| 57 | Everywhere | Plan's views: Days, Month, What if | Plan → Days | Forecast tab | `plan-pills` |
| 58 | Everywhere | Old links still land in the right place | Old /calendar link | same | `old-links` |
| 59 | Accounts | ⚙ Settings from Accounts | Accounts | same | `acc-settings` |

Old links (/calendar, /forecast, /what-if, with any options like ?add=1 or #afford) redirect to their new homes.
