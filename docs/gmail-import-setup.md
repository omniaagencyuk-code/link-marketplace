# Gmail import: setting it up

This lets Press Parrot read publisher replies straight out of the outreach
mailboxes, instead of exporting them from Google Takeout and uploading the
files. Same pipeline afterwards: a thread becomes an email waiting to be read,
Claude reads it, a draft appears, and **you still approve every draft by hand
before anything reaches a listing**.

Setting it up is a one-off, takes about twenty minutes, and needs Google
Workspace admin access for every domain you send outreach from.

The Takeout upload still works and is not going away. If this is ever broken
or switched off, that route is unchanged.

---

## What you are actually granting

A **service account** is a Google identity that belongs to software rather than
a person. **Domain-wide delegation** lets it act as users in your Workspace
without them signing in.

That is a large permission, so it is worth being precise about the limits:

- The scope is **`gmail.readonly`** and nothing else. No sending, no deleting,
  no labels, no drafts. There is no write call anywhere in this feature.
- Delegation would technically let the key open **any** mailbox in the domain.
  What stops it is the **allowlist** in the admin UI: every address is checked
  against that table on the server before a token is issued. An address that is
  not on the list is refused, even if a request asks for it directly.
- The key lives only in a Vercel environment variable. It is decoded on the
  server, never sent to the browser, and never written to a log or an error
  message.

Keep the allowlist to mailboxes you actually send outreach from.

---

## 1. Google Cloud: the project, the API and the key

1. Go to <https://console.cloud.google.com/> and sign in as an admin.
2. **Create a project** (top bar → project dropdown → New project). Call it
   something like `pressparrot-mail`. If you already have one, use it.
3. **Enable the Gmail API**: search "Gmail API" in the top search bar, open it,
   press **Enable**. This is per project, and skipping it produces the
   `accessNotConfigured` error below.
4. **Create the service account**: navigation menu → *IAM & Admin* →
   *Service Accounts* → **Create service account**.
   - Name: `pressparrot-gmail-reader`
   - Skip the optional "grant access" steps — it needs no project roles at all.
     Its power comes from the delegation in step 2, not from this project.
5. **Create a key**: open the new service account → **Keys** tab → *Add key* →
   *Create new key* → **JSON** → Create. A `.json` file downloads. This is a
   password. Do not email it, do not commit it, delete it from Downloads once
   step 3 is done.
6. **Find the client ID**: on the service account's **Details** tab, copy the
   **Unique ID** — a long number like `109876543210987654321`. You need it in
   the next step. (It is also in the JSON file as `client_id`.)

---

## 2. Workspace admin: grant the delegation

**Do this once for every Workspace domain you send from.** If your outreach
addresses span several domains, each domain's admin console needs its own
entry — a grant in one domain does not cover another.

1. Go to <https://admin.google.com/> as a super admin for that domain.
2. **Security** → **Access and data control** → **API controls**.
3. Click **Manage domain-wide delegation**.
4. **Add new**.
5. **Client ID**: the Unique ID you copied in step 1.6.
6. **OAuth scopes**, exactly this one, and only this one:

   ```
   https://www.googleapis.com/auth/gmail.readonly
   ```

7. **Authorise**.

Changes can take a few minutes to take effect, and occasionally up to an hour.
If the first test fails with `unauthorized_client`, wait and try again before
assuming it is wrong.

---

## 3. Base64-encode the key and add it to Vercel

The key is JSON with real newlines inside the private key, which environment
variables handle badly. Base64 removes the problem.

On a Mac or Linux:

```bash
base64 -i ~/Downloads/pressparrot-gmail-reader-abc123.json | tr -d '\n'
```

On Windows PowerShell:

```powershell
[Convert]::ToBase64String([IO.File]::ReadAllBytes("$HOME\Downloads\key.json"))
```

That prints one long line. Then:

1. Vercel → your project → **Settings** → **Environment Variables**.
2. Add `GOOGLE_SERVICE_ACCOUNT_KEY_B64`, paste the line as the value.
3. Tick **Production** and **Preview**.
4. Save, then **redeploy** — environment variables only reach a running
   deployment when it is built.

Then delete the downloaded `.json` file.

To confirm it arrived: open **Admin → Publisher inbox → Import from Gmail**.
When the key is readable, the page shows the service account's address and
client ID at the bottom. If it still says the variable is not set, the
redeploy has not finished or the value did not save.

---

## 4. Add the mailboxes

On the same page, under **Mailboxes we may read**, add each outreach address:

- `jack@omniamedia.uk`
- `info@omniaagency.uk`
- `info@omnia-marketing.co.uk`
- `contact@omniaagency.uk`
- `contact@omnia-marketing.co.uk`

Only addresses on this list can ever be read. You can switch one off with the
**enabled** tick without deleting it — useful for a mailbox you have stopped
using but might want again.

---

## 5. Test small, then do the backlog

**Preview first.** Pick one mailbox, leave the default query, press
**Preview**. It only asks Gmail *which* threads match — no bodies are fetched,
nothing is stored, nothing is sent to Claude, and it costs nothing. You get
three numbers per mailbox: matching, already imported, and new.

If "matching" is zero, the query is wrong or the delegation is not working.
Fix that before going further.

**Then a small fetch.** Set **Max threads** to `10` and press **Fetch**. Watch
the counts. When it finishes, go to the Publisher inbox: you should have up to
ten new emails waiting. Open one draft and check the thread reads sensibly —
there is an **Open the thread in Gmail** link on every imported draft so you
can compare against the original.

**Then the backlog.** Raise the cap to 200, tick the mailboxes you want, and
press Fetch. Fetching continues in the tab, but it is not tied to it: progress
is recorded as it goes, and anything left running is picked up automatically
within ten minutes. **You can close the page.**

Nothing has been read by Claude yet. Importing and extraction are separate
steps on purpose — press **Read** on the Publisher inbox when you are ready to
spend.

### The query box

Standard Gmail search syntax. The default:

```
-from:me newer_than:1y (price OR rates OR "guest post" OR "sponsored")
```

- `-from:me` drops threads where only we wrote. Threads with no publisher
  reply are skipped anyway, but excluding them in the search means a smaller,
  faster job.
- `newer_than:1y` — also `6m`, `90d`.
- `has:attachment` finds rate cards. Attachments are **never downloaded**; the
  filename, type and size are recorded, and a draft whose thread has a PDF,
  spreadsheet or CSV is flagged in the review queue so you know to look.

---

## What gets stored

Per thread: the messages as text (chronological, labelled by sender), a copy
with quoted history stripped, the sender, subject, date, every Message-ID, and
attachment **metadata only**.

A thread is skipped when it contains no message from outside our own
addresses — outreach nobody answered has no publisher terms in it by
definition, and reading it would be paying to be told we wrote it.

A thread already imported is not imported again, and that includes mail you
previously uploaded from Takeout: the importer compares Message-IDs and
recognises the same conversation, so you are not charged to read it twice. A
thread that has gained a **new reply** since it was imported *is* read again —
that is the one case where it is worth it.

### Retention

Off by default. There is a setting to clear the bodies of emails whose drafts
have all been dealt with, after a number of days (default 90). It is
irreversible, and the email is the only record of what a publisher agreed to,
so it stays off until you deliberately switch it on. The rows themselves are
never deleted — they are what prevents the same mail being imported and paid
for again.

---

## Troubleshooting

### `unauthorized_client`

The commonest one. Delegation is not set up, is set up in the wrong domain, or
the scope does not match.

- Check the **client ID** in the admin console matches the service account's
  Unique ID exactly — a truncated paste looks identical at a glance.
- Check the scope is exactly `https://www.googleapis.com/auth/gmail.readonly`
  with no trailing space or extra scope.
- Check you granted it in **the domain the mailbox belongs to**.
  `info@omniaagency.uk` and `info@omnia-marketing.co.uk` are two domains and
  need two grants.
- Wait a few minutes. Delegation changes are not instant.

### `403` — the Gmail API is not enabled

Step 1.3 was skipped, or it was enabled on a different Google Cloud project
from the one the key belongs to. Open the JSON key, check `project_id`, and
enable the Gmail API on *that* project.

### `403` on one mailbox only

That address does not exist, is a group or alias rather than a real mailbox, or
belongs to a domain with no delegation grant. Aliases cannot be impersonated —
use the real mailbox.

### `429` — rate limited

Gmail is throttling the account. The importer already retries with increasing
waits and jitter, and fetches at most five threads at a time per mailbox, so
short bursts sort themselves out. If a whole job fails this way, run it again
with a lower cap, or wait an hour — Gmail's per-user quotas reset on a rolling
window. Nothing is lost: threads already fetched are recorded and the job
resumes where it stopped.

### "Nothing new matched that search"

Everything the query matched is already imported. Widen the date range, or
check the Preview numbers — "already imported" counts threads previously seen
from this mailbox *and* mail already uploaded from Takeout.

### A job says it is running but nothing is happening

Its lease has probably expired — the tab was closed mid-chunk. The cron picks
it up within ten minutes. To push it along yourself, open the Gmail import page
and press **Carry on fetching**, or **Cancel it** if you no longer want it.

### The key changed and imports stopped

Rotate it the same way: create a new key, base64 it, update
`GOOGLE_SERVICE_ACCOUNT_KEY_B64` in Vercel, redeploy. The old key can then be
deleted from the service account's Keys tab. Nothing else needs changing —
the client ID stays the same, so the delegation grants keep working.
