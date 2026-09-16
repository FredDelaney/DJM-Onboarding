export type AiDraftSaveResult = { state: 'uploaded' | 'queued' | 'unsaved'; error?: unknown };

// Local failure must not prevent an online save. Network failure must not discard
// the draft unless local persistence has actually succeeded.
export async function saveAiDraft<T>(draft: T, options: {
  saveLocal: (draft: T) => Promise<unknown>;
  upload: (draft: T) => Promise<unknown>;
  online: () => boolean;
}): Promise<AiDraftSaveResult> {
  let locallySaved = false;
  let localError: unknown;
  try { await options.saveLocal(draft); locallySaved = true; }
  catch (error) { localError = error; }
  if (!options.online()) return {
    state: locallySaved ? 'queued' : 'unsaved',
    error: locallySaved ? undefined : localError,
  };
  try { await options.upload(draft); return { state: 'uploaded' }; }
  catch (error) { return { state: locallySaved ? 'queued' : 'unsaved', error }; }
}
