# Deploying to Vercel

Deployment needs your Vercel account and your approval each time. Nothing here has been run yet.

## One-time setup

1. In Vercel, go to **Add New → Project** and import `SiddhanthShetty/wedding_management` from GitHub. Keep the framework preset (Next.js) and the build command (`next build`).
2. **Environment variables** (Production; use staging values for Preview):

   | Variable | Value |
   | --- | --- |
   | `NEXT_PUBLIC_SUPABASE_URL` | your project URL |
   | `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | the publishable key (safe in the browser) |
   | `GUEST_PORTAL_HMAC_SECRET` | a new random secret of 32+ characters (`openssl rand -base64 48`). Changing it later invalidates every guest link. |
   | `NEXT_PUBLIC_SITE_URL` | your public address, for example `https://our-wedding.in` |

   Never add a Supabase secret or service-role key. The app doesn't need one.
3. Region: **Dublin (dub1)**, close to the database in eu-west-1.
4. In Supabase, go to **Authentication → URL configuration**: set the Site URL to your address and add it to the redirect URLs.

## Before each production deploy

1. `npm run backup`, then apply any new migrations (back up, dry run, then push).
2. Locally, `npm run lint`, `npx tsc --noEmit -p .`, `npm run test:unit`, `npm run build` and `npm run test:smoke` must all pass.
3. Push to `main` (Vercel deploys it), or promote a checked preview.

## After the first deploy, check

```bash
curl -sI https://your-address/sign-in | grep -iE 'content-security-policy|strict-transport|x-frame|x-content-type|permissions-policy'
curl -sI https://your-address/guest | grep -iE 'cache-control|referrer-policy|x-robots-tag'
```

- The first command shows all five security headers. The second shows `private, no-store`, `no-referrer` and `noindex`.
- On Vercel, rate limits use Vercel's own client-address header (`x-vercel-forwarded-for`), which visitors cannot fake. This is what clears the "trusted proxy headers" blocker.
- Open a guest link on your phone over mobile data: the page, photos and music should load and a reply should save.
