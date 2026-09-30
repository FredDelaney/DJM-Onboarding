type Invoke = <T = any>(
  action: string,
  body?: Record<string, unknown>,
) => Promise<T>;

type CacheEntry = {
  profile: any;
  expiresAt: number;
};

const profileCache = new Map<string, CacheEntry>();
const profileRequests = new Map<string, Promise<any>>();

const TTL_MS = 60_000;

export const getCachedPlayerProfile = (playerId: string) => {
  const entry = profileCache.get(playerId);
  if (!entry) return null;
  if (entry.expiresAt < Date.now()) {
    profileCache.delete(playerId);
    return null;
  }
  return entry.profile;
};

export const setCachedPlayerProfile = (
  playerId: string,
  profile: any,
) => {
  if (!playerId || !profile) return;
  profileCache.set(playerId, {
    profile,
    expiresAt: Date.now() + TTL_MS,
  });
};

export const prefetchPlayerProfile = (
  playerId: string,
  invoke: Invoke,
) => {
  const cached = getCachedPlayerProfile(playerId);
  if (cached) return Promise.resolve(cached);

  const pending = profileRequests.get(playerId);
  if (pending) return pending;

  const request = invoke<any>('player_profile_core', {
    player_id: playerId,
  })
    .then((response) => {
      const profile = response?.profile || null;
      if (profile) setCachedPlayerProfile(playerId, profile);
      return profile;
    })
    .finally(() => {
      profileRequests.delete(playerId);
    });

  profileRequests.set(playerId, request);
  return request;
};

export const invalidatePlayerProfile = (playerId: string) => {
  profileCache.delete(playerId);
};
