export const REDREAM_PUBLIC_SANDBOX_CONTRACT = 'redream_public_sandbox_v1';

// The public website intentionally reads from an isolated synthetic demo environment,
// separate from customer production data. Vercel can override this endpoint explicitly.
export const REDREAM_PUBLIC_SANDBOX_ENDPOINT =
  process.env.NEXT_PUBLIC_REDREAM_PUBLIC_SANDBOX_URL ||
  'https://ltvmopvarlnidiozvpow.supabase.co/functions/v1/redream-public-sandbox';

export function isReDreamPublicSandboxPayload(
  payload: { contract_version?: string; synthetic?: boolean } | null | undefined,
) {
  return Boolean(
    payload?.contract_version === REDREAM_PUBLIC_SANDBOX_CONTRACT &&
    payload?.synthetic === true,
  );
}

let sharedSandboxRequest: Promise<unknown> | null = null;

export function loadReDreamPublicSandbox<T>() {
  if (!sharedSandboxRequest) {
    sharedSandboxRequest = fetch(REDREAM_PUBLIC_SANDBOX_ENDPOINT, {
      method: 'GET',
      headers: { Accept: 'application/json' },
    })
      .then(async (response) => {
        if (!response.ok) throw new Error(`sandbox_${response.status}`);
        const payload = await response.json();
        if (!isReDreamPublicSandboxPayload(payload)) {
          throw new Error('sandbox_contract_mismatch');
        }
        return payload;
      })
      .catch((error) => {
        sharedSandboxRequest = null;
        throw error;
      });
  }

  return sharedSandboxRequest as Promise<T>;
}
