export type DjmAuthCapabilities = {
  passkeysEnabled: boolean;
  passkeysSupported: boolean;
};

function browserSupportsPasskeys() {
  return (
    typeof window !== 'undefined' &&
    window.isSecureContext &&
    'PublicKeyCredential' in window &&
    typeof navigator !== 'undefined' &&
    typeof navigator.credentials !== 'undefined'
  );
}

export async function getDjmAuthCapabilities(): Promise<DjmAuthCapabilities> {
  const passkeysSupported = browserSupportsPasskeys();

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

    const passkeysEnabled = Boolean(
      response.ok &&
        (
          data?.passkey_enabled === true ||
          data?.passkeys_enabled === true ||
          data?.webauthn?.enabled === true
        ),
    );

    return { passkeysEnabled, passkeysSupported };
  } catch {
    return { passkeysEnabled: false, passkeysSupported };
  }
}
