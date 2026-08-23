# Issues & Backlog

## Closed / Completed (Session 2026-08-22/23)

✓ Banrisul account cleanup — all local data deleted (11 imports, 29 transactions, 1 card, 1 account)
✓ LandingPage implementation (Persuade mode, before/after reveal)
✓ @lurem/ui v0.0.2 — 15 critical components fixed, all tests green
✓ P0 bug: FlagsPage hook-order (fixed)
✓ Data integrity: routes.ts duplicate detection (fixed)
✓ One Focus Rule refactor (AdminPage tabs)
✓ Waitlist feature complete
✓ Timeline UI spec (325+ tests)
✓ Transaction selection & summary features
✓ Card redesign (institution badges, account/card labels)
✓ Import review pipeline (e2e working)
✓ Recurring transactions (integrated)

## Active / Open

### High Priority
- (none currently blocking)

### Backlog
- Calendar feature: global admin-managed dates (holidays, deadlines) shown on timeline
- Invite notifications: "You sent invite to X" / "You deleted invite to X" (partial: events exist, UI text needed)
- Card/Account editing from list view (partial: dialogs exist, need onClick in AccountsPage/CardsPage)
- Archive accounts/cards (soft-delete) with undo, real deletion only if no transactions
- Recurring transaction creation from NewTransactionDialog (currently isolated to RecurringPage)
- "Confirm monthly" label & pending approval state for recurring confirmations
- Invoice closing/due dates synthesized in timeline (today only shows dates that occurred, not future projected dates)
- Clear initial alerts once setup complete for their category
- "What's New" alert on each production deploy + linked changelog page