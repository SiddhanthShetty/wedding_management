# Deploying to Vercel

Owner's decision (2026-11-08): deploy straight to production without a staging project. Signed-in flows are checked on the live site after deploying (see "After the first deploy"). Everything in the database is already in place, and all 25 migrations are applied to `wedding_management`.

## One-time setup (in your browser, about 10 minutes)

1. Go to https://vercel.com → sign in with GitHub → **Add New → Project** → import `SiddhanthShetty/wedding_management`. Keep the detected framework (Next.js) and the build command (`next build`). `vercel.json` already pins the region to **Dublin (dub1)**, next to the database in eu-west-1.
2. **Environment variables.** Add these for Production, and for Preview too if you want preview deploys to work:

   | Variable | Value |
   | --- | --- |
   | `NEXT_PUBLIC_SUPABASE_URL` | the same value as in your `.env.local` |
   | `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | the same value as in your `.env.local` |
   | `GUEST_PORTAL_HMAC_SECRET` | **exactly the same value as in your `.env.local`**. Mark it **Sensitive**. |
   | `NEXT_PUBLIC_SITE_URL` | your public address, for example `https://wedding-management.vercel.app`, or your own domain once it's added |

   - **Why the same secret:** the live database already holds 20 guest links (as of 2026-11-08). Only their keyed digests are stored, made with this secret, so a different value would silently break every link already sent. Copy it straight from `.env.local` into Vercel. Don't paste it into chat, email or the repository.
   - Never add a Supabase secret or service-role key. The app doesn't use one.
3. Click **Deploy**. From then on, every push to `main` deploys automatically.
4. In Supabase, go to **Authentication → URL configuration**:
   - Site URL: your Vercel address (or your domain).
   - Redirect URLs: add `https://<your-address>/**`.

   Without this, sign-up confirmation emails point at the wrong address.
5. Optional: add your own domain in Vercel (**Settings → Domains**), then update `NEXT_PUBLIC_SITE_URL` and the Supabase URLs to match, and redeploy.

## Before each later deploy

1. `npm run backup`. If there are new migrations, apply them first (back up, dry run, push).
2. Locally, these must all pass: `npm run lint`, `npx tsc --noEmit -p .`, `npm run test:unit`, `npm run build` and `npm run test:smoke`.
3. Push to `main`.

## After the first deploy

**1. Headers (2 minutes):**

```bash
curl -sI https://<your-address>/sign-in | grep -iE 'content-security-policy|strict-transport|x-frame|x-content-type|permissions-policy'
curl -sI https://<your-address>/guest | grep -iE 'cache-control|referrer-policy|x-robots-tag'
```

The first command shows five headers. The second shows `private, no-store`, `no-referrer` and `noindex`.

**2. Read-only signed-in check (saves nothing):**

```bash
E2E_TARGET=readonly E2E_EMAIL='<your email>' E2E_PASSWORD='<your password>' \
PLAYWRIGHT_BASE_URL=https://<your-address> npx playwright test tests/signed-in.spec.ts
```

It signs in, opens every section, and checks each one fits a phone screen. The two journeys that would create data are skipped.

**3. By hand, on your phone (about 15 minutes).** Use clearly named TEST records and delete them afterwards:
- [ ] Sign in and sign out. Open Overview, Guests and Invitations.
- [ ] Upload a small PDF in Documents, view it, download it, then archive it. This is the first real check of private file storage.
- [ ] In Invitations → Share, create a family preview link and open it on another phone.
- [ ] Open a real guest link you already sent yourself (or create one for a TEST guest). Reply "Yes", then check the reply shows in Guests.
- [ ] Upload a gallery photo and a song, open the guest link, and tap "Open" to hear the music.
- [ ] Make a guest's PDF card and share it to yourself on WhatsApp.

Note anything that fails and send it to me before inviting more guests.

**4. Back up again** (`npm run backup`) once the checks pass.
