import { platformInvoke } from '@/lib/platform-client';

export type HistoryBootstrapResult = {
  ok?: boolean;
  messages_seen?: number;
  messages_imported?: number;
  duplicates?: number;
  unsupported?: number;
  identity_refreshed?: number;
};

export async function bootstrapSelectedInstagramHistory(
  workspaceSlug: string,
  externalThreadId: string,
): Promise<HistoryBootstrapResult> {
  return platformInvoke<HistoryBootstrapResult>(
    'redream-meta-connect',
    {
      action: 'instagram_thread_history',
      workspace_slug: workspaceSlug,
      external_thread_id: externalThreadId,
    },
  );
}
