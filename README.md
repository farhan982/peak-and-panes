# Peak & Panes — Field Ops

Mobile-first field operations app for Peak & Panes. Installable PWA, works
offline, no build step, no dependencies. Data lives in `localStorage` on the
device that logged it.

Run it:

    python3 serve.py 8942

Then open http://localhost:8942.

## What is built

**Canvassing — the full loop.** Create territories, start a timed session, and
log every door with one tap:

- Live session timer with doors-per-hour, and a live stat strip (doors,
  answered, quotes, jobs, revenue booked).
- Five one-tap outcomes. *No Answer* and *Not Interested* log instantly;
  *Follow Up*, *Quote Given* and *Booked* open a short sheet.
- *Quote Given* creates a customer and an open quote with a follow-up date.
  *Booked* creates a customer and a scheduled job. Both in one tap plus a form.
- Undo on the most recent door, which also removes anything that tap created —
  a mis-tapped "Booked" doesn't leave a phantom job on the schedule.
- Route progress against the territory's door count.
- **The 20-door test**: after each block of 20 doors the app grades the block
  and says whether to keep going or move on.
- End-of-session summary: duration, doors per hour, answer rate, quote value,
  revenue per door, and the verdict on the last block. A session with no doors
  logged is discarded rather than saved.
- Territories are ranked by **revenue per door**, so the picker answers "where
  should I canvass today".

**Jobs closes the loop.** Tap an open quote to mark it **won** (which schedules
the job and carries the customer over) or **lost**. Tap a job to see it, call or
navigate to the customer, and mark it complete with a payment method — or
complete it unpaid and record the payment later. The Completed tab shows
revenue **collected** and how much is still owed. **Customers** is a read-only
list of everyone whose name you took at a door.

**Settings** (gear, top left) holds the revenue goal, backup/restore and
delete-all-data.

## What is not built yet

- **Dashboard** — goal card, weekly revenue, funnel, today's schedule, quick
  actions.
- **Goal & territories** — pace against the $20,000 target, territory scores,
  revenue per hour, weekly review.
- **Location capture** — stamping each door with GPS coordinates so the
  neighbourhoods covered don't have to be typed in.
- Photos, review and referral prompts on job completion. Editing or deleting a
  territory. Map view, seasonal reminders, expenses.

## Structure

    index.html          shell
    manifest.json       PWA manifest
    sw.js               service worker (network-first, cache fallback)
    serve.py            dev server that sends no-cache headers
    assets/styles.css   all styling; navy/blue/gold tokens at the top
    assets/brand/       the shield logo (see below)
    src/icons.js        inline SVG icons
    src/views/header.js the shared navy band every screen starts with
    src/storage.js      localStorage read/write, ids
    src/backup.js       export/validate/restore — validation is strict on purpose
    src/state.js        the mutable store + every write action
    src/domain.js       pure calculations: stats, rates, the 20-door test
    src/app.js          hash router
    src/views/          one file per screen, plus modals.js for the sheets

Data model: flat top-level arrays (`territories`, `sessions`, `doors`,
`customers`, `quotes`, `jobs`). Doors point at a session and a territory;
quotes and jobs point at a customer.

## The logo

`assets/brand/logo.svg` is a **vector recreation** of the Peak & Panes badge —
navy disc in a gold ring, roof and four-pane window, squeegee left, brush
right, wordmark on the ribbon, tagline below. It is redrawn, not the original
file.

To use the real artwork instead, save it as `assets/brand/logo.png` and change
the one `<img src>` in `src/views/header.js`. Nothing else references the mark.

The wordmark and tagline use `textLength` with `lengthAdjust="spacingAndGlyphs"`
so they stay pinned inside the ribbon on devices whose font metrics differ
(Arial Black does not exist on iOS). Don't remove those attributes.

The app icons in `assets/icons/` are a **simplified** version of the badge —
rings plus the roof and window, no text, because the wordmark is illegible at
180px. Regenerate them with the PIL snippet in the git history of this repo.

## iOS notes

Two settings here are load-bearing and were learned the hard way on an
iPhone — do not "clean them up":

- The viewport tag is plain `width=device-width, initial-scale=1`, and the
  status bar style is `black`, **not** `viewport-fit=cover` +
  `black-translucent`. The latter pair renders the installed app under the
  Dynamic Island, and the safe-area insets that would fix it report zero in
  standalone mode. It looks fine in a Safari tab and broken as an app.
- Form inputs are never below 16px. iOS Safari zooms the viewport on focus
  otherwise and never zooms back out.
