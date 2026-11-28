# Feature inventory

Every feature in Runway Tomorrow, where it lives now, and where it goes in the four-tab layout (Today, Plan, Money, Accounts).
Each row is checked automatically by `npm run test:features` (scripts/feature-check.mjs): it opens the demo and uses the feature. Moving screens only changes a row's location; a missing or broken feature fails the check.

| # | Area | Feature | Now | Four-tab layout | Check |
|---|---|---|---|---|---|
| 1 | Today | Today's limit, status pill and days to payday | Today | Today | `today-limit` |
| 2 | Today | Can I afford it? button | Today | Today | `today-afford` |
| 3 | Today | Noticed line linking to Trends | Today | Today | `today-noticed` |
| 4 | Today | How did it go? plan check-ins | Today | Today | `today-checkins` |
| 5 | Today | Daily limits strip for the days ahead | Today | Today | `today-daily-limits` |
| 6 | Today | Plans list with + Add | Today | Today | `today-plans` |
| 7 | Today | Next 30 days | Today | Today | `today-next30` |
| 8 | Today | Snapshot tiles | Today | Today | `today-snapshot` |
| 9 | Today | Coming up | Today | Today | `today-coming` |
| 10 | Today | A plan opens in a pop-up with its answer | Today | Today | `today-plan-popup` |
| 11 | Today | Plan pop-up: tap the planned amount to set your own | Today | Today | `plan-amount-edit` |
| 12 | Everywhere | ⓘ bubbles open inside pop-ups | Today | Today | `info-in-popup` |
| 13 | Calendar | Month grid with daily limits and ‹ › months | Calendar tab | Plan → Month | `cal-month` |
| 14 | Calendar | Tap a day: its limit and plans | Calendar tab | Plan → Month | `cal-day` |
| 15 | Calendar | + Add a plan (with live what-if) | Calendar tab | Plan → Month | `cal-add` |
| 16 | Calendar | Sync all | Calendar tab | Plan → Month | `cal-sync` |
| 17 | Calendar | How your plans went | Calendar tab | Plan → Month | `cal-history` |
| 18 | Calendar | Connected calendars, connect a link, upload a file | Calendar tab | Plan → Month | `cal-connect` |
| 19 | Calendar | Where to find the iCal link (Google, Apple, Outlook) | Calendar tab | Plan → Month | `cal-help` |
| 20 | What if | What if I spend: amount, plan chips and quick picks | What if tab | Plan → What if… (and Today → Can I afford it?) | `wi-ask` |
| 21 | What if | When: today, Saturday, payday, best time to buy | What if tab | Plan → What if… (and Today → Can I afford it?) | `wi-when` |
| 22 | What if | Debit vs credit, when cash leaves | What if tab | Plan → What if… (and Today → Can I afford it?) | `wi-pay` |
| 23 | What if | Add to my plans | What if tab | Plan → What if… (and Today → Can I afford it?) | `wi-add` |
| 24 | What if | What-if scenarios (raise, cancel, skip, cushion) | What if tab | Plan → What if… (and Today → Can I afford it?) | `wi-scenarios` |
| 25 | Forecast | Lowest ahead with chart | Forecast tab | Plan → Days / Balance | `fc-lowest` |
| 26 | Forecast | Key days | Forecast tab | Plan → Days / Balance | `fc-keydays` |
| 27 | Forecast | Card's next bill | Forecast tab | Plan → Days / Balance | `fc-card` |
| 28 | Forecast | Max bill without savings, both statements, how it adds up | Forecast tab | Plan → Days / Balance | `fc-max` |
| 29 | Forecast | Day by day 30/60/90 with lean tags | Forecast tab | Plan → Days / Balance | `fc-days` |
| 30 | Forecast | Open a day: why its limit, plans, bills | Forecast tab | Plan → Days / Balance | `fc-day-open` |
| 31 | Money | Income − Fixed − Spent = Net, each tappable | Money → Month | Money | `mo-tiles` |
| 32 | Money | Budget with groups and category editor | Money → Month | Money | `mo-budget` |
| 33 | Money | New category (name, symbol, color) | Money → Month | Money | `mo-newcat` |
| 34 | Money | Transactions by day with search, account and time filters | Money → Activity | Money → Activity | `ac-list` |
| 35 | Money | Category chips with totals | Money → Activity | Money → Activity | `ac-chips` |
| 36 | Money | A transaction: category, repeats, history, edit | Money → Activity | Money → Activity | `ac-txn` |
| 37 | Money | Recategorize: just this one or all with this name | Money → Activity | Money → Activity | `ac-recat` |
| 38 | Money | Edit or delete a category from the picker (✎) | Money → Activity | Money → Activity | `ac-cat-edit` |
| 39 | Money | Income − Bills = Left, % of income, over time | Money → Bills | Money → Bills | `bi-overview` |
| 40 | Money | Repeating items by kind, + Add | Money → Bills | Money → Bills | `bi-repeating` |
| 41 | Money | Found in your history: add as repeating | Money → Bills | Money → Bills | `bi-found` |
| 42 | Money | Noticed: lead insight with evidence and actions | Money → Trends | Money (Noticed first) / Categories | `tr-noticed` |
| 43 | Money | Categories vs average (+/−) | Money → Trends | Money (Noticed first) / Categories | `tr-cats` |
| 44 | Money | Category pop-up: tiles, bars, months, drill into a name | Money → Trends | Money (Noticed first) / Categories | `tr-cat-popup` |
| 45 | Money | ✎ on a category pop-up | Money → Trends | Money (Noticed first) / Categories | `tr-cat-pencil` |
| 46 | Money | Net cash flow by month or pay period | Money → Trends | Money (Noticed first) / Categories | `tr-flow` |
| 47 | Accounts | Net worth, accounts and cards | Accounts tab | Accounts | `acc-list` |
| 48 | Accounts | Goals (protected ones never suggested) | Accounts tab | Accounts | `acc-goals` |
| 49 | Accounts | A card: statement, max bill, how you pay it | Accounts tab | Accounts | `acc-card` |
| 50 | Settings | Profile, appearance, morning note, everyday purchases | Settings (header ⚙) | Accounts → ⚙ Settings (and header) | `set-profile` |
| 51 | Settings | Forecast & advice (cushion etc.) | Settings (header ⚙) | Accounts → ⚙ Settings (and header) | `set-forecast` |
| 52 | Settings | Categories: rename, symbol, color, delete | Settings (header ⚙) | Accounts → ⚙ Settings (and header) | `set-categories` |
| 53 | Settings | What we remember, decisions | Settings (header ⚙) | Accounts → ⚙ Settings (and header) | `set-memory` |
| 54 | Settings | Hide amounts, export, delete data and account | Settings (header ⚙) | Accounts → ⚙ Settings (and header) | `set-privacy` |
| 55 | Everywhere | Pull a pop-up down to close it | Money → Trends | Money (Noticed first) / Categories | `swipe-close` |
| 56 | Everywhere | Bottom bar reaches every area | Today | Today | `nav` |

Old links (/calendar, /forecast, /what-if, /spend/*) keep working and redirect to their new homes.
