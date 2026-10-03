# RBH Insulation — Safety & Near-Miss Report

A public, mobile-friendly web form for reporting hazards, near misses, unsafe
conditions, unsafe behavior, and vehicle/equipment problems on RBH Insulation
job sites.

The whole form is a single self-contained file (`index.html`) — the logo, fonts,
styling, and scripts are all bundled in, so it works anywhere with no build step
and no server.

**Live site (after you deploy — see below):**
`https://<your-username>.github.io/rbh-safety-report/`

---

## Deploy to GitHub Pages

You only need the `index.html` file. Two ways to do it:

### Option A — GitHub website, no command line (easiest)

1. Go to <https://github.com/new>.
2. Repository name: `rbh-safety-report`. Set it to **Public**. Click **Create repository**.
3. On the new repo page, click **Add file → Upload files**, then drag in
   `index.html` (and this `README.md` if you like). Click **Commit changes**.
4. Go to **Settings → Pages**.
5. Under **Build and deployment → Source**, choose **Deploy from a branch**.
   Set **Branch** to `main` and folder to `/ (root)`. Click **Save**.
6. Wait about a minute, then refresh. GitHub shows the live URL at the top of the
   Pages settings:
   `https://<your-username>.github.io/rbh-safety-report/`

That URL is public — send it to anyone.

### Option B — Command line (git)

```bash
git clone https://github.com/<your-username>/rbh-safety-report.git
cd rbh-safety-report
# copy index.html into this folder, then:
git add .
git commit -m "Add safety report form"
git push origin main
```

Then enable Pages via **Settings → Pages** as in steps 4–6 above.

---

## A note on repo visibility

The **published Pages site is public** — that's the point, so people can open the
form. Keeping the **repository** public is the simplest, cost-free path. The form
holds no secrets (it's just a static page), so a public repo is fine.

---

## Current status: draft

This is the review draft. When someone taps **"Send report to the safety team,"**
the form shows them a copyable summary of what they entered. It does **not** yet
email anyone or save entries to a database.

### Planned next step — make submissions go somewhere

- **Database + login-protected review dashboard:** Supabase (free tier) — Postgres
  database, reviewer logins, photo storage.
- **Email on submit:** notify a fixed group of recipients (via a webhook + email
  service such as Resend).
- Reviewers get a private, logged-in dashboard to read reports, set a status/
  disposition, add timestamped notes, assign owners, and close items out.

When that's wired up, the form's **Send** button will POST the entry (and any
attached photos) to the database and trigger the notification email.

---

## Editing the form

Everything lives in `index.html`.

- **Job site list:** search for `Select a job site` and edit the `<option>` lines.
  (Later this can be pulled live from the database instead.)
- **Hazard types / report types / severity levels:** search for the matching
  `<option>` or `<label>` blocks and edit the text.
- **Recipients / branding / phone number:** phone and address are near the top of
  the file; the logo is embedded as a data URI in the header.

---

## Optional: custom domain

You can later serve this from something like `safety.rbhinsulation.com` by adding a
`CNAME` file to the repo and pointing a DNS record at GitHub Pages. Ask and I'll
walk you through it.

---

RBH Insulation, Inc. · 13105 Crenshaw Blvd, Hawthorne, CA 90250 · 310-322-8883 ·
License #558799
