export type AiDraftSaveResult = {
  state: 'uploaded' | 'queued' | 'unsaved';
  error?: unknown;
};

// Local persistence protects the draft, but browser connectivity state is only
// a hint. Mobile browsers and installed PWAs can report navigator.onLine=false
// while requests still work, so every save gets one real upload attempt.
//
// If that upload genuinely fails, a locally persisted draft remains queued.
// If neither local persistence nor the upload succeeds, the draft stays unsaved
// in the active UI so the user can retry the exact same capture.
export async function saveAiDraft<T>(
  draft: T,
  options: {
    saveLocal: (draft: T) => Promise<unknown>;
    upload: (draft: T) => Promise<unknown>;
    online: () => boolean;
  },
): Promise<AiDraftSaveResult> {
  let locallySaved = false;
  let localError: unknown;

  try {
    await options.saveLocal(draft);
    locallySaved = true;
  } catch (error) {
    localError = error;
  }

  // Read the browser hint for compatibility with existing callers, but never
  // use it as the authority for whether a network request is possible.
  options.online();

  try {
    await options.upload(draft);
    return { state: 'uploaded' };
  } catch (error) {
    const state = locallySaved ? 'queued' : 'unsaved';

    return {
      state,
      error: locallySaved ? error : error || localError,
    };
  }
}
