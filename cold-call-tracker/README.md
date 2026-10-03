# Dial Tracker — Cold Call Accountability Tracker

Next.js + Supabase (auth + Postgres) + Vercel. Email/password login, every user sees only their own data (enforced by Postgres Row Level Security).

## What's inside

```
app/            layout, global styles, page (auth gate)
components/     AuthForm.js, Tracker.js (setup, log, outcomes, pace, save bar)
lib/            supabase.js (client), pace.js (math + formatting)
supabase/       schema.sql  <- paste into the Supabase SQL editor
```

## 1. Create the Supabase project

1. Go to https://supabase.com/dashboard and click **New project**. Pick a name, a database password (save it somewhere), and a region near you.
2. Wait ~1 minute for it to provision.
3. Open **SQL Editor -> New query**, paste the full contents of `supabase/schema.sql`, and click **Run**. You should see "Success. No rows returned."
4. Open **Table Editor** and confirm you see `campaigns` and `call_logs`, both with the RLS badge on.
5. Open **Project Settings -> API** and copy two values:
   - **Project URL**
   - **anon public** key
6. (Optional, for faster testing) **Authentication -> Providers -> Email**: turn off **Confirm email** so new accounts can sign in immediately. Leave it on for production if you want verified emails.

## 2. Run it locally (optional but recommended)

```bash
cd cold-call-tracker
cp .env.local.example .env.local      # then paste your two Supabase values in
npm install
npm run dev
```

Open http://localhost:3000, sign up, fill in the setup card, log a session.

## 3. Push to GitHub

```bash
cd cold-call-tracker
git init
git add .
git commit -m "Initial commit"
```

Create an empty repo on GitHub (no README), then:

```bash
git remote add origin https://github.com/YOUR-USERNAME/cold-call-tracker.git
git branch -M main
git push -u origin main
```

`.env.local` is git-ignored, so your keys are not uploaded.

## 4. Deploy on Vercel

1. Go to https://vercel.com/new and **Import** your GitHub repo.
2. Framework preset should auto-detect as **Next.js**. Leave build settings as-is.
3. Expand **Environment Variables** and add:
   - `NEXT_PUBLIC_SUPABASE_URL` = your Project URL
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY` = your anon public key
4. Click **Deploy**. In about a minute you'll get a URL like `https://cold-call-tracker-xyz.vercel.app`.

## 5. Point Supabase Auth at your live URL

Only needed if email confirmation is on (confirmation links use this URL):

1. Supabase -> **Authentication -> URL Configuration**.
2. Set **Site URL** to your Vercel URL.
3. Add the same URL (and `http://localhost:3000` if you test locally) to **Redirect URLs**.

Done. Open the Vercel URL on your phone, sign up, and add it to your home screen for one-tap access.

## How it behaves

- **Setup**: saved once, auto-loaded on every visit. Edit any field and use **Save Progress**.
- **Daily log**: each **Add** writes a row to Supabase immediately. The Totals column is the running dial total through that row. Footer totals update live. The x button deletes a row.
- **Outcomes**: Shows and Closes +/- buttons save on every tap. Targets are derived from your funnel math: closes target = close goal; shows target = goal / close rate.
- **Pace summary**: appears after the first log entry. Projects dials and closes from your daily average over the working days, and calls it ahead (>=105% of goal), on track (95-105%), or behind (<95%).
- **Save Progress**: commits unsaved setup edits and any half-filled log row. The "Last saved" time is stored in Supabase, so it shows correctly on every load and device.

## Troubleshooting

- **"Missing NEXT_PUBLIC_SUPABASE_URL..."** — env vars aren't set. On Vercel add them under Project -> Settings -> Environment Variables, then redeploy.
- **"new row violates row-level security policy"** — re-run `schema.sql`; the policies didn't get created.
- **Can't sign in after sign-up** — email confirmation is on; click the link in the email or disable **Confirm email** (step 1.6).
- **Changed env vars on Vercel but nothing changed** — env vars apply at build time for `NEXT_PUBLIC_*`; trigger a redeploy.
