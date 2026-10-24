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
- Six one-tap outcomes. *No Answer* and *Not Interested* log instantly;
  *Interested*, *Follow Up*, *Quote Given* and *Booked* open a short sheet.
  *Interested* and *Follow Up* differ by who moves next: a follow-up is a date
  you go back on, an interested door is someone who may ring you.
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
- Territories are ranked by **jobs actually finished**, so the picker answers
  "where has the knocking turned into work". Doors measure effort; completed
  jobs measure what the effort produced. Territory job counts are read from the
  jobs themselves, not from doors tapped "Booked" — a quote accepted days later
  still belongs to the territory it came from, and only the job record knows
  whether the work got done. Revenue per door survives as a detail on the
  territory sheet.

**Jobs closes the loop.** Tap an open quote to mark it **accepted** (which
schedules the job and carries the customer over) or **declined**. Tap a job to see it, call or
navigate to the customer, and mark it complete with a payment method — or
complete it unpaid and record the payment later. The Completed tab shows
revenue **collected** and how much is still owed. A customer's status is **derived from their records**, not stored — a finished
job shows them as Completed rather than leaving them stuck on Booked. The
progression is Lead → Interested → Follow up → Quoted → Booked → Completed,
with Declined for a quote that came to nothing.

Tap a **customer** for their record: collected and booked totals, contact
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
this week's revenue against last week's, open quotes, jobs booked (with how
many are done), doors knocked, today's schedule, a **This week** summary card,
the doors-to-quotes-to-jobs funnel, and four quick actions.

**Add Job can log work that is already finished** — the When row switches
between *Scheduled* and *Already done*, and the second asks for the date it was
done and how it was paid, creating the job complete in one step. Without it,
back-entering a job put today's date in both the scheduled and completion
fields, and last Thursday's work counted as this week's revenue.

Weekly revenue is bucketed by **the date the work was done**, not the date it
was typed in — marking last Tuesday's job complete today must not move this
week's figure. Completing a job therefore asks for the date, defaulting to the
day it was scheduled when that is in the past. Dates chosen as a day are stored
at midday, so weekly windows run to the end of today (`domain.endOfToday`)
rather than to the current moment.

The **This week** card deliberately does not repeat the revenue tile above it:
the tile answers "how much", the card answers "off the back of what" — doors,
quotes, booked, finished, collected, plus average job, best territory and best
service. Note "Finished" (work completed this week) is a different question
from the tile's "3 of 6 done" (how many of this week's bookings are complete).

**Services** (`#/services`, reached from the Goal screen) breaks every job and
quote down by the kind of work: jobs completed, revenue collected, average job
value, and how many quotes for that service were accepted. All time.

**Goal & Territories** answers "am I going to make it": collected against the
target with a chart of actual versus the pace needed, territories ranked by
**jobs completed**, the weekly target, and a short list of what to do next —
each item derived from something the app can actually see.

Both treat **collected** money as the headline. Work that is booked but not yet
paid for is shown alongside, never folded in — counting revenue you have not
received towards a revenue goal is how people fool themselves.

Quote statuses are `open` / `accepted` / `declined`, and a customer whose only
quote was declined is `declined` too. Records written under the earlier
`won`/`lost` vocabulary are translated on load by `migrateVocabulary` in
`storage.js`.

The Dashboard carries a **backup reminder** when there is data at risk and no
backup in 30 days (or none ever). Dismissing snoozes it for 7 days; downloading
a backup silences it. A fresh install with no records is never nagged.

### Repeat work

`domain.repeatDue(s)` finds past customers whose work is old enough to offer
again, derived entirely from completed jobs — no extra data entry, and a past
customer is a far cheaper lead than a door. `REPEAT_MONTHS` holds the
intervals (windows 6, interior and eaves 12, painting 36, odd jobs never);
those are **judgement calls about this business, not facts**, so change them
freely.

A multi-service job counts once per service, each against its own interval.
Anyone already re-booked for that service drops off automatically, since the
reminder is derived from the last *completed* job. `snoozeRepeat` quietens one
for three months without pretending the work was done.

It surfaces as a **Due again** card at the top of Customers, a banner on the
customer's own sheet, and a line in the Goal screen's recommendations.

### Search

`attachSearch` filters **in the DOM** rather than by re-rendering. A re-render
would replace the input on every keystroke and lose focus and the caret; the
usual fix is to restore both afterwards, but not needing to is simpler and
does not fight the keyboard on a phone. Each row carries the text it matches
against. On Customers and on all three Jobs tabs.

### Leads

An *Interested* door creates an **open quote with no price** — a lead. It sits
in the Open tab with the real quotes, can carry a follow-up date, and converts
with one tap: **Book this job** asks only for the service and price, then
creates the job against the customer already on file. Before this, an
interested door produced only a customer, so saying yes later meant entering
everything again.

`domain.isLead(quote)` is just "open with no amount". Leads are counted in the
open list but kept out of the pipeline figure, since they have no number yet,
and they are skipped by the Services breakdown because a lead has no service
chosen. `migrateInterestedLeads` in `storage.js` gives the same entry to
interested doors logged before this existed — the interest was already
recorded, it just had nowhere to live.

## Services are components, not bundles

`domain.SERVICES` holds only things that can be sold on their own: Exterior
Windows, Interior Windows, Eaves, Painting, Odd Job. It used to also carry
bundles — "Interior + Exterior", "Windows + Eaves" — which overlapped their own
parts, so picking a bundle alongside one of its components double-counted the
same work. Bundles are now built by tapping their parts.

Don't reintroduce a bundle as a service. If one is ever wanted as a shortcut it
has to expand into component lines, not sit beside them as a seventh option.

Jobs logged under the old bundle names keep working: a service that is no
longer in the list stays selectable on the record that uses it. They are not
split retroactively — the breakdown was never recorded, so any split would be
invented — and they keep their own row on the Services page.

## Services can be priced individually

Tapping more than one service turns the single price field into one per
service, with a running total. Every service picker in the app uses the same
component, including the two door flows: one service costs exactly the taps it
always did, and the extra taps only appear when two things are genuinely sold. Those records store
`lines: [{service, amount}]` alongside the usual `service` summary string and
`amount` total, so every screen that predates this keeps working untouched. A
single service stores no `lines` at all, leaving those records exactly the
shape they have always had.

### Bundle deals

A bundle usually goes out for less than its parts add up to. The lines hold
each service's **standalone price** and `amount` holds **what the customer
actually pays** — you type the agreed figure in **Bundle deal**, and the saving
is shown back to you. The discount is never stored: `bundleDiscount()` derives
it as subtotal minus amount, so the two can't drift apart.

**The Bundle deal field starts empty, with the subtotal as its placeholder, and
is never written to programmatically.** It was once pre-filled with the
subtotal, which made it impossible to type a lower number: clearing the field
set the state back to "following the subtotal", and the refresh that followed
immediately put the subtotal back, so it fought every keystroke. Empty means no
deal. Only the placeholder moves when line prices change.

Typing the agreed price rather than the discount is deliberate — it is the
number said out loud to the customer and the one that has to be exact, while
the discount is bookkeeping. The agreed figure is **sticky**: once set it stays
put while line prices are adjusted around it, since changing your own list
price does not change what you promised. Clearing the field means no deal
again, and changing which services are selected resets it, because a deal
struck on two services means nothing for a different pair.

Keeping list prices on the lines is the point: if the customer later wants only
the windows, that line is still a real quotable number rather than something
already shaded by a deal on work they no longer want. Charging *above* list is
reported honestly as "above list price" rather than as a negative discount.

For reporting, `attributedLines()` spreads the money actually charged across
the lines **in proportion**, so $35 off a $265 + $220 pair takes about $19 off
the windows and $16 off the eaves rather than all of it off whichever line
happens to be first. Per-service revenue then sums exactly to what was
collected. Use `serviceList()` when showing what was quoted and
`attributedLines()` when counting money.

The Services page splits such a job across both rows, with its money divided by
line — the only way to answer "what does eaves work bring in" when eaves is
usually sold alongside windows. Per-service job counts can therefore sum to
more than the total job count, which the page says.

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

## Dates are local, never UTC

`localDay()` in `storage.js` is the only way a calendar day should be derived
from a timestamp, and `toLocalDate()` in `domain.js` is the only way a bare
`YYYY-MM-DD` should be parsed. `toISOString().slice(0, 10)` is wrong here:
west of Greenwich it rolls over in the evening, which is exactly when a day's
admin gets done. It had put completion-date defaults, follow-up comparisons
and "overdue" checks a day out, and made a plain date display a day early.

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
