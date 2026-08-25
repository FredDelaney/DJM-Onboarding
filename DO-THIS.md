# DJM Player — UX Pass 2: Fewer taps + faster feedback

The structural speed release is already live and green.

This pass removes friction INSIDE the player flows. It does not redesign anything.

## 1. Home should open the exact Profile editor

Open:

`app/home/page.tsx`

In the `readiness()` checks, make these exact href changes:

### Football basics

Replace:

```tsx
href: '/profile',
```

on the check labelled:

```tsx
label: 'Complete your football basics',
```

with:

```tsx
href: '/profile?edit=football',
```

### Current club/status

On:

```tsx
label: 'Confirm your current club or status',
```

change its href to:

```tsx
href: '/profile?edit=football',
```

### Contact number

On:

```tsx
label: 'Add a contact number',
```

change its href to:

```tsx
href: '/profile?edit=career',
```

### Passports

On:

```tsx
label: 'Add your passports',
```

change its href to:

```tsx
href: '/profile?edit=career',
```

### Markets

On:

```tsx
label: 'Tell DJM which markets you would consider',
```

change its href to:

```tsx
href: '/profile?edit=career',
```

### Trusted source

On:

```tsx
label: 'Add a trusted football source',
```

change its href to:

```tsx
href: '/profile?edit=sources',
```

### Footage

Replace:

```tsx
href: '/profile#media',
```

with:

```tsx
href: '/profile?edit=media',
```

Leave the current-photo action as `/profile` because the photo picker is deliberately on the Profile header itself.

---

## 2. Profile: support direct editor links

Open:

`app/profile/page.tsx`

Find this whole effect:

```tsx
  useEffect(() => {
    if (
      typeof window !== 'undefined' &&
      window.location.hash === '#media'
    ) {
      setEditor('media');
    }
  }, []);
```

Replace it with:

```tsx
  useEffect(() => {
    if (
      typeof window === 'undefined'
    ) {
      return;
    }

    const params =
      new URLSearchParams(
        window.location.search,
      );

    const requested =
      params.get('edit');

    if (
      requested === 'football' ||
      requested === 'career' ||
      requested === 'media' ||
      requested === 'sources'
    ) {
      setEditor(
        requested as Editor,
      );

      return;
    }

    if (
      window.location.hash === '#media'
    ) {
      setEditor('media');
    }
  }, []);
```

Now Home can open Football / Career / Media / Sources directly in one tap.

---

## 3. Profile: close immediately after a successful save

Still in:

`app/profile/page.tsx`

At the end of `save()`, find:

```tsx
    await ctx.refresh();

    setDirty(false);
    setBusy(false);

    if (closeAfter) {
      setEditor(null);
    }

    flash('Saved');
    return true;
```

Replace it with:

```tsx
    setDirty(false);
    setBusy(false);

    if (closeAfter) {
      setEditor(null);
    }

    flash('Saved');

    /*
     * The database write already succeeded.
     * Do not keep the player waiting for a
     * second global refresh before closing.
     */
    void ctx.refresh();

    return true;
```

This is a major feel improvement: Save finishes when the save actually finishes.

---

## 4. Profile: show a new photo immediately

Still in `app/profile/page.tsx`, in `uploadPhoto()` find:

```tsx
    await ctx.refresh();

    setBusy(false);
    flash('Photo updated');
```

Replace with:

```tsx
    setP(
      (current: any) => ({
        ...current,
        profile_photo_path:
          path,
      }),
    );

    setBusy(false);
    flash('Photo updated');

    void ctx.refresh();
```

The image changes immediately instead of waiting for another complete player refresh.

---

## 5. Inbox: complete requests optimistically

Open:

`app/inbox/page.tsx`

Inside `update()`, find this block AFTER the successful Supabase update:

```tsx
    setReply('');
    setExpanded(null);

    setToast(
      status === 'completed'
        ? 'Sent to DJM'
        : 'Reply saved'
    );

    setTimeout(() => setToast(''), 1800);

    await load();
    await ctx.refresh();

    setBusy(false);
```

Replace it with:

```tsx
    setRequests(
      (current) =>
        current.map(
          (item) =>
            item.id === r.id
              ? {
                  ...item,
                  player_reply:
                    reply ||
                    r.player_reply ||
                    null,
                  status,
                  completed_at:
                    status ===
                    'completed'
                      ? new Date()
                          .toISOString()
                      : null,
                }
              : item,
        ),
    );

    setReply('');
    setExpanded(null);

    setToast(
      status === 'completed'
        ? 'Sent to DJM'
        : 'Reply saved'
    );

    setTimeout(
      () => setToast(''),
      1800,
    );

    setBusy(false);

    /*
     * UI is already correct. Reconcile quietly.
     */
    void Promise.all([
      load(),
      ctx.refresh(),
    ]);
```

A completed request now moves immediately rather than waiting for Inbox + global context to reload.

---

## 6. Inbox: sending a message should not wait for a reload

In the same file, at the end of `send()`, find:

```tsx
    await load();

    setBusy(false);
```

Replace with:

```tsx
    setBusy(false);

    void load();
```

The composer closes immediately after Supabase confirms the message was sent.

---

## 7. Check-in: success should not wait for global refresh

Open:

`app/check-in/page.tsx`

At the end of `submit()`, find:

```tsx
    setDone(true);

    await ctx.refresh();

    setBusy(false);
```

Replace with:

```tsx
    setDone(true);
    setBusy(false);

    /*
     * The weekly update is already saved.
     * Refresh global badges/state in the background.
     */
    void ctx.refresh();
```

The success screen now means exactly what it says: once the database write succeeds, the player is done.

---

# Commit

Commit these four edited files as:

`Remove friction from core player flows`

Then tell ChatGPT:

`done`

## What this pass changes in practice

Before:
Home -> generic Profile -> tap section -> edit -> Save -> wait for global reload.

After:
Home -> exact editor -> edit -> Save -> closed immediately.

Before:
Reply -> spinner -> reload Inbox -> reload player context -> finished.

After:
Reply -> instantly moves to complete -> background reconciliation.

Before:
Check-in saved -> still waiting for global refresh.

After:
Check-in saved -> success immediately.

This is the right kind of UX improvement now: fewer taps and less waiting, not more features.
