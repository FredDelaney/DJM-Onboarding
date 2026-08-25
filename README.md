# DJM Player — UX Smoothness Release

This release is deliberately **not a redesign**.

It fixes the structural reasons the app can feel like separate web pages instead of one fluid product.

## What changes

### 1. Navigation stops reloading the player from zero
`components/PlayerShell.tsx`

The current app creates a new local player context on every page. That means moving between Home, Inbox, Check-in and Profile repeatedly starts from `loading: true`, rechecks auth and fetches the same player/private/request/check-in data again.

The replacement keeps the current player state in memory for the life of the app session.

Result:
- repeat tab navigation renders immediately;
- no full-screen loading flash on every player tab;
- data quietly revalidates in the background;
- simultaneous page loads share one request instead of duplicating it;
- nothing private is written to localStorage or sessionStorage.

### 2. Admin auth also stays warm
`components/AdminShell.tsx`

Admin/scout identity is cached in memory for 60 seconds and quietly revalidated. Moving around Admin no longer needs to start authentication from zero each time.

### 3. iPhone controls feel more physical
`app/ux-smooth.css`

Adds:
- subtle pressed feedback;
- smoother bottom sheets;
- smoother backdrop/toast entry;
- stable iOS bottom navigation compositor layer;
- touch-action optimisation;
- proper reduced-motion support.

### 4. Root layout loads the interaction layer
`app/layout.tsx`

Only adds the new CSS import. No metadata or product structure changes.

---

# Upload these exact files

Replace:

`components/PlayerShell.tsx`

with the file from this bundle.

Replace:

`components/AdminShell.tsx`

with the file from this bundle.

Create:

`app/ux-smooth.css`

with the file from this bundle.

Replace:

`app/layout.tsx`

with the file from this bundle.

Commit:

`Make DJM Player navigation feel instant`

Then tell ChatGPT `done`.

---

# What I will do after it is green

The next UX pass is about **removing taps**, not adding design:

1. Home “best next update” opens the exact Profile editor (Football / Career / Media / Sources).
2. Profile saves close immediately after the database write, while the global context refreshes quietly.
3. Inbox completion updates optimistically instead of holding the button while it reloads the inbox + global context.
4. Weekly check-in gets a faster success return into My Season.
5. Admin player actions stop reloading all 15 data sources after every small edit where a targeted update is enough.

Those should be done after this structural smoothness layer is verified, because this release removes the biggest source of perceived slowness everywhere at once.
