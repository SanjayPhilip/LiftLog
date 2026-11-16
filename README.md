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
