<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.
<!-- LOVABLE:END -->

## Architecture rules
- Ledger data is read/written directly from the browser via the Supabase client with RLS policies scoped to `auth.uid()` — keeps screens simple and enforces per-shop isolation in the database.
- Protected screens live under `src/routes/_authenticated/`; the gate also signs out users whose email is unverified.
- Twilio WhatsApp and SMS sending goes through `src/lib/twilio.functions.ts` (server function) and checks customer channel consent, so per-shop auth tokens never reach the browser and unsolicited direct sends are blocked.
- Load complete ledger transactions in pages for reports, balances, and statements, since the database API limits individual responses to 1,000 rows.
- Prebundle the Radix UI packages used by protected screens in Vite so late dependency discovery cannot reload React during sign-in and break dialog hooks.
- Send signup confirmation links to the published `/auth` page and handle reset links on public `/reset-password` — avoids fallback to the unrelated auth Site URL and keeps recovery outside the protected gate.
- Store appearance preference in browser storage and apply semantic CSS theme tokens at the root — each app user can choose a visual style without changing ledger data.
