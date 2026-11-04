export type RequestStaff = {id: string; name: string};
export type RequestPreferenceRecord = {updated_at: string; preferences: Record<string, unknown>};
export type RequestPreferencesResult = {records: Record<string, RequestPreferenceRecord>; staff: RequestStaff[]};

export const requestPreferenceKeys = ['window_preference','player_origin','loan_option','transfer_budget_min','salary_budget_min','assigned_user_ids'] as const;
export const requestWindowOptions = [['','Any window'],['winter','Winter'],['summer','Summer']] as const;
export const requestOriginOptions = [['','Any'],['domestic','Domestic'],['international','International']] as const;
export const additionalRequestFields = [
  {key:'window_preference',label:'Window',type:'select',options:requestWindowOptions},
  {key:'player_origin',label:'Origin',type:'select',options:requestOriginOptions},
  {key:'transfer_budget_min',label:'Transfer fee budget (minimum)',type:'number'},
  {key:'salary_budget_min',label:'Salary budget (minimum)',type:'number'},
] as const;
export const preferenceValue = (value: unknown): string => Array.isArray(value) ? value.join(',') : String(value ?? '');
export const requestPreferencesPatch = (draft: Record<string,unknown>) => Object.fromEntries(
  requestPreferenceKeys.filter(key=>key in draft).map(key=>[
    key, key==='assigned_user_ids' ? preferenceValue(draft[key]).split(',').filter(Boolean) : preferenceValue(draft[key]).trim() || null,
  ]),
);
