# Booking and finance milestone

## Data impact

Migration `20261104150000_financial_tracking.sql` adds wedding-owned budget allocations, unbooked estimates, bookings, booking/function allocations, scheduled payment obligations, manual payment/refund transactions and contributor lines, reimbursements, and forecast adjustments. It adds no rows to existing weddings, creates no financial sample fixtures, and does not alter existing function budget fields. It grants access through the existing `suppliers_finance` module and same-wedding foreign keys. Application to the hosted development project is still pending explicit approval.

Amounts use `numeric(14,2)` in PostgreSQL, are validated as decimal strings in form actions, and use `BigInt` minor units for application-side totals. The UI formats amounts only after calculation. No JavaScript floating-point money calculations or automatic currency conversions are used.

## Calculation policy

- **Budget:** the wedding's existing overall budget, shown in the wedding's default currency; category/function allocations are separate plans and are not summed into it.
- **Forecast final cost:** tentative + confirmed bookings, once per booking, + active unbooked estimates + signed forecast adjustments. Converted estimates and cancelled bookings are excluded.
- **Committed cost:** confirmed bookings only, once per booking.
- **Net paid:** manually recorded payment transactions less manually recorded refunds, per currency. Records are not represented as bank-verified.
- **Outstanding balances:** non-negative agreed cost less net payments for active bookings. Cancelled bookings are excluded from this balance and retained in history.
- **Upcoming payments:** scheduled obligations due from today onward, less manual payments linked to each obligation. An unscheduled amount remains in the booking balance.
- **Outstanding refunds:** expected refund less refund transactions already recorded for a cancelled booking. If the expected amount is blank, the UI reports it as unknown.
- **Currency:** every figure is grouped by the stored three-letter currency. No conversion policy, rate, source, or date exists, so currencies are never added together.

Function allocation splits must sum to the complete booking amount. Database constraints and the create-booking RPC enforce the reconciliation at commit. A booking's split rows are descriptive only and do not contribute to totals. Payment submission keys are unique per wedding; a retry with the same key and details returns the original record rather than inserting a duplicate.

## Current scope and limitations

The workspace budget page supports creating unbooked estimates, bookings with one or more function allocations, payment/refund schedule rows, manual payments/refunds with optional contributor splits, cancellations with an optional expected refund, budget allocations, forecast adjustments, and reimbursement records. Existing bookings are not editable after creation except for cancellation; changes to an agreed amount should be represented by a future versioned booking amendment flow. Reimbursement records can be planned or marked paid when first entered; an edit/reversal workflow is deferred. The payment gateway and bank reconciliation are intentionally absent.

Run `npm run test:security` to apply every local migration in PGlite, including this migration, and run SQL access and calculation tests. Supabase local `db reset` requires Docker/Podman. Hosted migration application is a separate action and is not performed by this milestone.
