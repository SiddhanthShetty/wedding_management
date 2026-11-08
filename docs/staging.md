# Staging project and signed-in checks

Staging is a second, free Supabase project with the same migrations and **only TEST data**. Signed-in tests, restore drills and risky checks run there, never on `wedding_management`.

## 1. Create the project (once, in the Supabase dashboard)

1. **New project** → name `wedding-staging`, region **eu-west-1** (same as production), and a strong database password kept in your password manager.
2. From **Project Settings → API**, note the project URL and the publishable key. From **Connect → Session pooler**, note the connection string.
3. In **Authentication → Providers → Email**, keep "Confirm email" on, as in production. Your test account confirms by email once.

## 2. Apply the migrations to staging

Run this in your own terminal (the connection string contains the password, so don't paste it into chat):

```bash
export STAGING_DB_URL='postgresql://postgres.[ref]:[password]@aws-0-eu-west-1.pooler.supabase.com:5432/postgres'
npx supabase db push --db-url "$STAGING_DB_URL" --dry-run
npx supabase db push --db-url "$STAGING_DB_URL"
```

The dry run should list every file in `supabase/migrations/`. The private `wedding-documents` bucket and its policies are created by the migrations.

## 3. Run the app against staging

Use a separate guest-link secret for staging (any random 32+ character string), never production's:

```bash
NEXT_PUBLIC_SUPABASE_URL='https://[staging-ref].supabase.co' \
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY='[staging publishable key]' \
GUEST_PORTAL_HMAC_SECRET="$(openssl rand -base64 48)" \
npm run dev -- --port 3200
```

Values set on the command line override `.env.local`, so production settings stay untouched.

## 4. Create the test account and a TEST wedding

Open http://localhost:3200/sign-up, create an account with an email you control (for example `you+staging@gmail.com`), confirm it, then create a wedding named **TEST wedding**. Add a few functions, a TEST household and guests, and save one invitation design.

## 5. Run the signed-in checks

```bash
E2E_TARGET=staging E2E_EMAIL='you+staging@gmail.com' E2E_PASSWORD='…' \
PLAYWRIGHT_BASE_URL=http://localhost:3200 npx playwright test tests/signed-in.spec.ts
```

They cover:
- every section opening without errors on desktop;
- every section fitting a 375 px phone screen without sideways scrolling;
- a document upload, signed download and archive in private Storage;
- the invitation studio preview, and a family preview link opened in a separate browser.

They don't run at all unless `E2E_TARGET=staging` is set.

Also try by hand on your phone, against staging:
- upload a gallery photo and a song;
- make a guest's PDF and share it to yourself on WhatsApp;
- open a guest link, reply "Yes", and check the reply shows in Guests.

## 6. Restore drill

Follow [backup-restore.md](backup-restore.md) to restore the latest production backup into staging. Do this before real guests reply, then after big schema changes.
