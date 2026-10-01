export function opportunityReadState(data: any, view: string): 'ready' | 'loading' | 'error' {
  const source = view === 'deals' ? 'deals' : 'market';
  if (data?.opportunity_errors?.[source]) return 'error';
  return data?.[source] != null ? 'ready' : 'loading';
}
