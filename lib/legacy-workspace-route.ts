export function legacyWorkspaceRecordHref(kind:'club'|'contact'|'deal'|'recruitment',id:string):string {
 const params:Record<string,string>=kind==='club'?{view:'network',club:id}:
  kind==='contact'?{view:'network',person:id}:
  kind==='recruitment'?{view:'players',tab:'recruitment',target:id}:
  {view:'opportunities',tab:'deals',record:id};
 return '/agency?'+new URLSearchParams(params).toString();
}
