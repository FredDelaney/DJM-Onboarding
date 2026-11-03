export type RequestPriorityFilter = 'all' | 'high' | 'normal' | 'low' | 'unset';
export type RequestDealFilter = 'all' | 'permanent' | 'loan' | 'free_agent' | 'unset';

export type RequestSummary = {
  club?: { name?: string | null } | null;
  need?: {
    title?: string | null;
    position?: string | null;
    need_type?: string | null;
    priority?: number | string | null;
    transfer_type?: string | null;
  } | null;
};

export function filterClubRequests<T extends RequestSummary>(
  requests: readonly T[],
  query: string,
  priority: RequestPriorityFilter,
  deal: RequestDealFilter,
): T[] {
  const search = query.trim().toLocaleLowerCase();
  return requests.filter(item => {
    const need = item.need;
    if (search && ![
      item.club?.name,
      need?.title,
      need?.position,
      need?.need_type,
    ].filter(Boolean).join(' ').toLocaleLowerCase().includes(search)) return false;

    const value = Number(need?.priority);
    const hasPriority = need?.priority !== null && need?.priority !== undefined &&
      String(need.priority).trim() !== '' && Number.isInteger(value) && value >= 1 && value <= 5;
    if (priority === 'high' && (!hasPriority || value < 4)) return false;
    if (priority === 'normal' && (!hasPriority || value !== 3)) return false;
    if (priority === 'low' && (!hasPriority || value > 2)) return false;
    if (priority === 'unset' && hasPriority) return false;

    const preference = String(need?.transfer_type || '').trim().toLocaleLowerCase();
    if (deal === 'unset' && preference) return false;
    if (deal !== 'all' && deal !== 'unset' && preference !== deal) return false;
    return true;
  });
}
