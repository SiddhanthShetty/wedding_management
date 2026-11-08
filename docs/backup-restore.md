# Backups and restore drill

The project is on Supabase's free plan, so Supabase keeps **no backups** for it (checked 2026-11-08: no backups listed, point-in-time recovery off). Backups are made with our own script instead.

## Making a backup

```bash
npm run backup
```

- Saves to `~/Wedding backups/<date_time>/` (or set `BACKUP_ROOT=/path/to/encrypted/disk`). The script refuses to save inside the repository.
- Contents:
  - `roles.sql`, `schema.sql` and `data.sql`: database roles, structure and every row;
  - `storage/`: uploaded documents from the private `wedding-documents` bucket;
  - `SHA256SUMS`: checksums to detect a damaged copy.
- The folder is readable only by your macOS user. It contains guests' names, contact details, replies, meal and assistance notes, and payments. Keep it on an encrypted disk (FileVault is enough), and never put it in git, chat or email.
- **When to run it:** before every release or migration push, and at least weekly from the moment real guests reply. Keep at least the last 4 weekly copies, and one copy on a second device or encrypted drive.
- First run: 2026-11-08, 532 KB, no documents uploaded yet.

`pg_dump` warns about circular foreign keys (for example between guests and plus-ones). That's expected. The restore below loads data with triggers and foreign-key checks switched off for the session, which is Supabase's documented method.

## Restore drill (do this once now, then after big schema changes)

Never restore into `wedding_management` for a drill. Use the separate **staging** project.

1. Create the staging project in Supabase (free) if it doesn't exist. Copy its connection string from **Connect → Session pooler** and keep it out of the repository:

   ```bash
   export STAGING_DB_URL='postgresql://postgres.[ref]:[password]@aws-0-eu-west-1.pooler.supabase.com:5432/postgres'
   ```

2. Restore the latest backup into it. Supabase's method is one transaction, with replication-role mode switched on so triggers and foreign keys don't block the data load:

   ```bash
   B="$HOME/Wedding backups/<date_time>"
   (cd "$B" && shasum -a 256 -c SHA256SUMS)
   psql --single-transaction --variable ON_ERROR_STOP=1 \
     --file "$B/roles.sql" --file "$B/schema.sql" \
     --command 'SET session_replication_role = replica' \
     --file "$B/data.sql" --dbname "$STAGING_DB_URL"
   ```

3. Check the restore:
   - Row counts match production for `guests`, `guest_rsvps`, `functions`, `financial_bookings` and `invitation_designs`.
   - `select count(*) from supabase_migrations.schema_migrations` matches.
   - Signing in to staging shows the same wedding.
4. Upload the documents back if needed:

   ```bash
   npx supabase storage cp --experimental -r "$B/storage/wedding-documents" ss:///wedding-documents --remote=<staging-ref>
   ```

5. Write down the date, how long it took and any errors in the drill log below.

## Drill log

| Date | Backup used | Result | Notes |
| --- | --- | --- | --- |
| *not yet run* | | | |

## If you upgrade to Supabase Pro later

Daily backups (kept 7 days) come with the Pro plan, and point-in-time recovery is a paid add-on. Keep running the script as well, because it gives you a copy outside Supabase.
