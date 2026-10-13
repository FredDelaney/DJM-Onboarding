// Only capture routes can supply a post-login return path; never an external URL.
export function captureReturnPath(value: string | null): string | null {
  if (!value || /[\\\r\n]/.test(value)) return null;
  if (!/^\/(?:tell(?:\?|$)|workspace\/[a-z0-9][a-z0-9-]*\/capture(?:\?|$))/.test(value)) return null;
  return value;
}

export function captureWorkspaceReturnPath(value:string|null,workspaceSlug:string):string {
 const slug=/^[a-z0-9][a-z0-9-]*$/.test(workspaceSlug)?workspaceSlug:'';
 const fallback=slug?'/workspace/'+slug:'/agency';
 if(!value||!value.startsWith('/')||value.startsWith('//')||/[\\\r\n]/.test(value))return fallback;
 try{
  const url=new URL(value,'https://redream.invalid');
  if(url.origin!=='https://redream.invalid'||!['/agency',fallback].includes(url.pathname))return fallback;
  const requested=url.searchParams.get('workspace');
  if(requested&&requested!==slug)return fallback;
  return url.pathname+url.search+url.hash;
 }catch{return fallback;}
}
