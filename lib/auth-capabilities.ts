export type DjmAuthCapabilities = {
  passkeysEnabled: boolean;
  passkeysSupported: boolean;
};

export async function getDjmAuthCapabilities(): Promise<DjmAuthCapabilities> {
  const passkeysSupported =
    typeof window !== 'undefined' &&
    'PublicKeyCredential' in window &&
    typeof navigator !== 'undefined' &&
    typeof navigator.credentials !== 'undefined';

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

  if (!url || !key) {
    return { passkeysEnabled: false, passkeysSupported };
  }

  try {
    const response = await fetch(`${url}/auth/v1/settings`, {
      headers: { apikey: key },
      cache: 'no-store',
    });
    const data = await response.json().catch(() => ({}));
    return {
      passkeysEnabled: Boolean(response.ok && data?.passkeys_enabled),
      passkeysSupported,
    };
  } catch {
    return { passkeysEnabled: false, passkeysSupported };
  }
}
