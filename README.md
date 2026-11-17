# LiftLog 🏋️

**Training, tracked. Built for my goals.**

[![Live App](https://img.shields.io/badge/Live%20App-Open%20LiftLog-ff534c?style=for-the-badge)](https://liftlog-gym-tracker-theta.vercel.app)

**Live website:** https://liftlog-gym-tracker-theta.vercel.app

LiftLog is my personal fitness tracker, built specifically for my workout routine, strength progression and body recomposition goals. It is not a generic workout template.

## Why LiftLog?

I wanted a fast, mobile-friendly way to record what I actually lift and measure progress from one workout to the next.

## Built around my training

- Five-day split with a dedicated shoulder day
- Extra focus on chest, arms and back development
- Consistent leg training and capped-shoulder goals
- Sets, reps, working weights and progressive overload
- Tracking training progress over time

My requirements can change as I progress. These are personal training preferences, not universal fitness advice.

## Open on your phone

Visit the [live app](https://liftlog-gym-tracker-theta.vercel.app) in your mobile browser. Use **Install app** or **Add to Home screen** when available. The deployed app includes a web app manifest and service worker.

## Deployment

Hosted on Vercel: https://liftlog-gym-tracker-theta.vercel.app

> Vercel Authentication may currently restrict public access to the live deployment.

Built by [Sanjay Philip](https://github.com/SanjayPhilip).

*Every set has a purpose. Every rep leaves a record.*


## Workout tools

- Previous sets are matched by exercise name and workout date, including saved plan snapshots. New drafts prefill the previous values; adjust these to your actual performance before saving.
- Rep targets suggest one more rep at the same load, or considering a load increase once every planned set reaches the top of the range. Timed holds use seconds.
- Progress includes history filters for workout, exercise and date, expandable session sets and notes, and personal records with dated charts and accessible data tables.
- Records include heaviest set, most reps, session volume and estimated 1RM (Epley, weighted sets of 1–12 reps). Timed holds are excluded from volume and 1RM.

The restored app retains the deployed Supabase account payload format. No database migration is required.

## Local verification

Serve the repository with `python -m http.server 4173 --bind 127.0.0.1`, then run `python tests/training_browser.py` with Python Playwright and Chromium installed. The test uses fixture cloud responses and never writes to a real account. It checks mobile and desktop layouts, quick logging, saved edits, history, charts, and the save/reload payload contract.

## Session modules

- Expand a session in **Progress → Workout history** to repeat it or edit it. Repeating uses the saved exercise snapshot, prefilled sets and today's date; it never changes your routine or regular drafts. The repeated draft syncs with your account and can be resumed from Home or the Draft tab.
- Saved-workout edits are isolated until **Save changes**. Correct the date, sets and notes; Cancel discards edits. Multiple sessions on one day keep separate IDs.
- Saving shows a PR celebration for improvements over earlier logged sessions. First logs establish a baseline, ties do not count, and correcting history recalculates records.
- Home and Progress show a Monday–Sunday weekly summary: sessions, logged sets, external load volume, records and improved lifts compared with the previous full week. Navigate backward to inspect earlier weeks. Future-dated logs and timed holds do not inflate current-week volume.

Run `python tests/sessions_browser.py` against the same local server for repeat/resume, draft isolation, edit/cancel/conflicts, validation, record recalculation, week boundaries and mobile/desktop checks. These also use fixture cloud responses.

## Offline recovery and exercise swaps

The `db/guarded_sync.sql` database function compares the last acknowledged account payload under a lock before accepting a save. It runs as the caller, respects existing ownership RLS, and is executable only by authenticated users. Apply it before deploying the sync client. Pending edits and their acknowledged baseline are cached per account. Conflicts pause writes; loading the newer cloud version first archives pending edits into a downloadable device recovery backup. A failed load can restore a previously cached account, and reconnect/manual retry attempts a guarded save. Reopen other devices to update their old client before concurrent editing.

Workout and repeated-draft exercises have **Swap exercise** controls. The replacement affects only that session snapshot, clears its entered weights and reps, and leaves the routine unchanged. Other entered sets stay in the workout.

`python tests/sync_browser.py` simulates offline recovery, stale writes, backup recovery, retry and substitutions with mock account data. Database validation also exercised the guarded function under the authenticated role inside a rolled-back transaction.

## Swap days this week

On Home, drag the **⠿ handle** on a schedule card onto another card to swap them directly. You can also select **Swap days**, then drag anywhere on a card or tap two days. Workout and rest days exchange places for the current Monday–Sunday week. Select **Done swapping** to open workouts normally. Assignments sync with your account and survive reloads; next week uses the regular split. Plan changes reset the week's assignments. Swaps leave workout IDs, entered drafts and saved history intact.

Run `python tests/schedule_browser.py` against the local server for drag, tap, keyboard, reload, workout identity and week-reset checks with mocked account responses.
