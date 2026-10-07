const CONNECTION_MESSAGE = 'We could not connect to secure sign-in. Please check your connection and try again.';

// Only password sign-in is bounded here. Refresh, passkeys and application
// requests retain their SDK behaviour. Aborting the transport prevents a late
// password response from creating a session after the user retries.
export function createPasswordAuthFetch(transport: typeof fetch, milliseconds = 12000): typeof fetch {
  return async (input, init) => {
    const url = new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url);
    const method = init?.method || (input instanceof Request ? input.method : 'GET');
    if (url.pathname !== '/auth/v1/token' || url.searchParams.get('grant_type') !== 'password' || method.toUpperCase() !== 'POST') {
      return transport(input, init);
    }
    const controller = new AbortController();
    const callerSignal = init?.signal || (input instanceof Request ? input.signal : undefined);
    const abort = () => controller.abort(callerSignal?.reason);
    if (callerSignal?.aborted) abort();
    else callerSignal?.addEventListener('abort', abort, {once:true});
    const timer = setTimeout(() => controller.abort(new Error('Secure sign-in took too long. Please try again.')), milliseconds);
    try {
      const response = await transport(input, {...init, signal:controller.signal});
      // Keep the deadline active while the small authentication body arrives.
      const body = await response.arrayBuffer();
      return new Response(body, {status:response.status,statusText:response.statusText,headers:response.headers});
    } finally {
      clearTimeout(timer);
      callerSignal?.removeEventListener('abort', abort);
    }
  };
}

export function authEntryErrorMessage(error: unknown): string {
  const detail = error && typeof error === 'object' ? error as {name?:string;message?:string;status?:number} : {};
  const message = typeof detail.message === 'string' ? detail.message : '';
  if (detail.name === 'AuthRetryableFetchError' || Number(detail.status) >= 500 ||
      /load failed|failed to fetch|fetch failed|networkerror|network request failed/i.test(message)) {
    return CONNECTION_MESSAGE;
  }
  return message || 'We could not open your workspace. Please try again.';
}
