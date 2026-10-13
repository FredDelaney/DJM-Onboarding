export function recordEditReady({
  requestedId,
  loadedId,
  busy,
  error,
  restricted,
}: {
  requestedId: string;
  loadedId: string;
  busy: boolean;
  error: string;
  restricted: boolean;
}): boolean {
  return Boolean(
    requestedId && loadedId === requestedId && !busy && !error && !restricted,
  );
}
