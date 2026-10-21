type InviteResponse = {
  ok?: boolean;
  error?: string;
  account_exists?: boolean;
  account_created?: boolean;
  invite?: unknown;
};

const retryMessage = 'We could not complete your invitation. Please try again.';

export async function readStaffInviteResult({data,error}: {data: unknown; error: unknown}): Promise<InviteResponse> {
  let result: InviteResponse | null = data && typeof data === 'object' && !Array.isArray(data) ? data as InviteResponse : null;
  if (error && typeof error === 'object' && 'context' in error && error.context instanceof Response) {
    try {
      const body: unknown = await error.context.clone().json();
      if (body && typeof body === 'object' && !Array.isArray(body)) result = body as InviteResponse;
    } catch { /* Non-JSON gateway failures use retry guidance below. */ }
  }
  if (result?.account_exists === true) return result;
  if (typeof result?.error === 'string' && result.error.trim()) throw new Error(result.error);
  if (result && 'invite' in result && result.invite === null) throw new Error('This invitation is no longer active. Ask the agency for a new invitation.');
  if (error || result?.ok !== true) throw new Error(retryMessage);
  return result;
}
