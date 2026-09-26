import {
  readReDreamShare,
} from '@/lib/redream-share';
import {
  resolveTenantRuntime,
} from '@/lib/tenant-runtime';

export const dynamic = 'force-dynamic';

export async function GET(
  request: Request,
) {
  const hostname =
    request.headers.get(
      'x-forwarded-host',
    ) ||
    request.headers.get('host');

  const runtime =
    await resolveTenantRuntime(
      hostname,
    );

  const current =
    new URL(request.url);

  if (!runtime.resolved) {
    return Response.redirect(
      new URL('/', current),
      303,
    );
  }

  const shared =
    readReDreamShare(
      current.searchParams,
    );

  const target =
    new URL(
      `/workspace/${encodeURIComponent(runtime.slug)}/capture`,
      current,
    );

  target.searchParams.set(
    'from',
    '/share-to-redream',
  );

  if (shared.hasContent) {
    target.searchParams.set(
      'shared',
      '1',
    );

    if (shared.title) {
      target.searchParams.set(
        'share_title',
        shared.title,
      );
    }

    if (shared.text) {
      target.searchParams.set(
        'share_text',
        shared.text,
      );
    }

    if (shared.url) {
      target.searchParams.set(
        'share_url',
        shared.url,
      );
    }
  }

  return Response.redirect(
    target,
    303,
  );
}
