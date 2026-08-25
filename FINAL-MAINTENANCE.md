# DJM Player — Final Maintenance Release

This is **not another redesign**. It contains only issues found in the final end-to-end audit.

## What is already fixed live

The Supabase integrity rule is already applied in production and recorded as migration:

`20260825120914 require_fresh_verification_after_admin_player_edits_v1`

The rule now means:

- if a player changes verified football information → verification becomes `reviewing`;
- if a DJM admin changes verified football information → verification also becomes `reviewing`;
- the previous DJM verification date is cleared;
- DJM must explicitly verify the current data again.

The SQL in this bundle is the **GitHub mirror** of the live migration. Do not run it again manually. Add it to the repo so database history and source control stay aligned.

---

# Files to upload directly

## 1. New file

Upload:

`components/admin/RemovePlayerSheet.tsx`

from this bundle to the exact same repo path.

## 2. New migration mirror

Upload:

`supabase/migrations/20260825120914_require_fresh_verification_after_admin_player_edits_v1.sql`

## 3. Replace migration ledger

Replace:

`supabase/MIGRATIONS.md`

with the file in this bundle.

---

# Four tiny code edits

These are intentionally small enough to be safer than replacing another 100k Admin file.

---

## A. `app/profile/page.tsx` — keep the new photo/status in sync

Find the end of the first `useEffect` that loads the player and videos/doc count.

It currently ends with:

```tsx
  }, [ctx.player?.id]);
```

Replace only that line with:

```tsx
  }, [
    ctx.player?.id,
    ctx.player?.updated_at,
  ]);
```

Why: after a profile photo or verified football detail changes, `ctx.refresh()` gets the new player row. The Profile page must re-hydrate its local state rather than continuing to display the old photo or verification state.

---

## B. `app/admin/players/[id]/page.tsx` — Club Ready should use the Admin draft

### B1. Add the Remove Player sheet import

Immediately after:

```tsx
import SeasonRecordEditor
  from '@/components/SeasonRecordEditor';
```

add:

```tsx
import RemovePlayerSheet
  from '@/components/admin/RemovePlayerSheet';
```

### B2. Add the modal state

Immediately after:

```tsx
const [unpublishOpen,setUnpublishOpen]=useState(false);
```

add:

```tsx
const [removeOpen,setRemoveOpen]=useState(false);
```

### B3. Replace the existing `clubReady` definition

Replace:

```tsx
const clubReady=
  getClubReadyState(
    p,
    cv,
    career,
    videos
  );
```

with:

```tsx
const readinessPlayer={
  ...p,
  nationalities:
    String(
      p.nationalitiesInput
      ??arr(p.nationalities)
    )
      .split(',')
      .map(
        (value:string)=>
          value.trim()
      )
      .filter(Boolean)
};

const clubReady=
  getClubReadyState(
    readinessPlayer,
    cv,
    career,
    videos
  );
```

This fixes the one-click edge case where you type a nationality into the Admin draft and immediately press Verify.

### B4. In `verify()`

Inside `verify()`, after `save()` succeeds, there is currently another:

```tsx
const readiness=
  getClubReadyState(
    p,
    cv,
    career,
    videos
  );
```

replace that whole block with:

```tsx
const readiness=
  clubReady;
```

### B5. In `publish()`

At the start of `publish()`, replace its duplicate:

```tsx
const readiness=
  getClubReadyState(
    p,
    cv,
    career,
    videos
  );
```

with:

```tsx
const readiness=
  clubReady;
```

---

## C. `app/admin/players/[id]/page.tsx` — remove browser confirm/prompt

Replace the complete current `removePlayer` function with:

```tsx
const removePlayer=async(
  confirmation:string
)=>{
  if(
    !isFullAdmin
    ||confirmation!==name
  ){
    return;
  }

  setBusy(true);

  const {data,error}=
    await supabase
      .functions
      .invoke(
        'remove-player',
        {
          body:{
            player_id:id,
            confirmation
          }
        }
      );

  setBusy(false);

  if(
    error
    ||!data?.ok
  ){
    flash(
      data?.error
      ||error?.message
      ||'Could not remove player'
    );

    return;
  }

  setRemoveOpen(false);

  router.replace('/admin');
  router.refresh();
};
```

Find the existing **Remove player** button:

```tsx
onClick={removePlayer}
```

replace only that prop with:

```tsx
onClick={()=>
  setRemoveOpen(true)
}
```

Then, near the bottom of the JSX, immediately before the existing `{toast&&(` block, add:

```tsx
<RemovePlayerSheet
  open={removeOpen}
  name={name}
  busy={busy}
  onClose={()=>
    !busy
    &&setRemoveOpen(false)
  }
  onConfirm={
    removePlayer
  }
/>
```

This removes both `window.confirm()` and `window.prompt()` from the permanent player-removal flow.

---

## D. `app/onboarding/page.tsx` — remove the old red alert

Find the inline error box containing:

```tsx
background: '#fff4f4',
color: '#8a1c1c',
```

Replace those two lines with:

```tsx
background: '#fff9dd',
color: '#5b5100',
```

Nothing else in that error box needs to change.

This keeps validation clear without introducing red into the DJM product.

---

# Commit

Commit all files/edits together as:

`Final DJM Player integrity and polish audit`

Then tell ChatGPT **done**.

The next step is only verification:
- GitHub files
- Vercel build
- runtime logs
- current production route
- migration ledger

No more redesign work is planned.

---

# Legacy data note

The audit found legacy records that were marked verified before Club Ready existed. The bundle includes:

`supabase/legacy-data-review.sql`

It is **read-only** and changes nothing.

Do not unpublish or change legacy players blindly. Review them individually after the code/migration release is green.
