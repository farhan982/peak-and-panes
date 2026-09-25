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

**Jobs closes the loop.** Tap an open quote to mark it **accepted** (which
schedules the job and carries the customer over) or **declined**. Tap a job to see it, call or
navigate to the customer, and mark it complete with a payment method — or
complete it unpaid and record the payment later. The Completed tab shows
revenue **collected** and how much is still owed. Tap a **customer** for their record: collected and booked totals, contact
details, referral source, and every quote and job they have had, each opening
its own sheet. From there they can be edited or deleted.

Jobs and quotes can be edited or deleted from their own sheets too, and both
have an undo for a mis-tap: **Reopen job** puts a completed job back on the
schedule and clears any payment recorded with it; **Reopen quote** returns a
settled quote to the open list.

Territories have the same, reached from the dots on a row in the picker or by
tapping one in the Goal screen's ranking. The sheet shows how that territory
has actually performed — doors, answer and quote rates, revenue per door and
per hour, sessions, last worked — before offering Edit and Delete. Renaming
one carries into the session history, since a rename here is a correction. A
territory cannot be deleted while a session is running in it.

Deleting anything **keeps the doors** — you still knocked that door, and
erasing it would quietly rewrite your canvassing counts and conversion rates.
Deleting a customer cascades to their quotes and jobs; deleting a job, quote
or territory leaves everything else alone. Every confirmation names what is
being destroyed, including how much will come off collected revenue, because
that figure feeds goal progress.

**Addresses fill themselves in.** The first house of a session comes from GPS;
after that each outcome you log leaves the *next* house already in the field,
worked out from the numbering of the doors you have logged. Turn onto a new
street and GPS notices and re-seeds it. Anything you type by hand wins and is
never overwritten.

**Location.** Tap "Use my location" on the canvassing screen and the app finds
the neighbourhood you're standing in — recognising a territory you've worked
before, or offering to create one named after where you are. From then on every
door you log is stamped with coordinates, and the end-of-session summary lists
the streets you actually covered, so none of it has to be typed up afterwards.

**Settings** (gear, top left) holds your name, the revenue goal,
backup/restore, location status and delete-all-data.

**Dashboard** answers "how is the business doing right now": goal progress,
this week's revenue against last week's, open quotes, jobs booked, doors
knocked, today's schedule, the doors-to-quotes-to-jobs funnel, and four quick
actions.

**Goal & Territories** answers "am I going to make it": collected against the
target with a chart of actual versus the pace needed, territories ranked by
revenue per door, the weekly target, and a short list of what to do next —
each item derived from something the app can actually see.

Both treat **collected** money as the headline. Work that is booked but not yet
paid for is shown alongside, never folded in — counting revenue you have not
received towards a revenue goal is how people fool themselves.

Quote statuses are `open` / `accepted` / `declined`, and a customer whose only
quote was declined is `declined` too. Records written under the earlier
`won`/`lost` vocabulary are translated on load by `migrateVocabulary` in
`storage.js`.

## Goals are a sequence

`settings.goals` is a list, not one number. Each goal has its own window and
counts only money collected inside it; reach one and you start the next, while
**all-time revenue keeps climbing** on the Goal screen regardless.

The boundary matters and is easy to get wrong. Each goal carries a `startAt`
timestamp, not just a date: a goal that begins today starts counting from *now*,
not from midnight, or finishing one goal and starting the next on the same day
would count that morning's takings towards both. Starting a new goal also
stamps `closedAt` on every earlier goal, including one already reached, so
money earned afterwards cannot keep accruing to a goal that is over.

Reaching the target stamps `achievedAt` but leaves the goal running, so the
screen can show that it was hit; it only retires when the next goal starts.
Achievement is re-checked when money lands *and* when a goal is edited, since
lowering a target can put an already-collected sum over the line.

## What is not built yet

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

## Location, and its three hard limits

`src/geo.js`. Worth knowing before changing anything here:

- **Secure context only.** Geolocation is unavailable over plain http. It works
  on the deployed https site and on localhost, and nowhere else.
- **Foreground only.** iOS gives web apps no background location, so a passive
  all-day trail is impossible. Instead a fix is taken at the moment an outcome
  is tapped — which is exactly when the app is open and being looked at.
- **About 10m accuracy.** Enough to know the street, not enough to tell #123
  from #125. This never replaces the address field.

Coordinates are stored always, with no dependency, so the app keeps working
offline. Street names are a bonus resolved from OpenStreetMap's Nominatim when
there is signal: lookups are keyed to a ~100m grid cell and cached permanently
in localStorage, and spaced at least 1.2s apart, so a street of 85 houses costs
a handful of requests rather than 85. Failure is silent by design.

**House numbers are predicted, not geocoded.** Canvassing is sequential, so
once two doors on a street are known the step between them is known, and the
next address is arithmetic — free, offline, and more accurate than a 10m fix.
GPS is reserved for the question it can actually answer: which street you have
just turned onto. `predictNextAddress` falls back to +2 when the step looks
like noise (over 20) and returns null rather than guessing past zero.

Stamping happens *after* the door is logged, via `state.attachDoorLocation`,
which writes to storage **without** notifying listeners. That is deliberate: a
fix landing mid-typing would otherwise re-render and steal focus from the
address field.

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
