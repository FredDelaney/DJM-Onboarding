import {UNRESOLVED_TENANT_RUNTIME,type TenantRuntime} from './tenant-runtime.ts';
type WorkspaceBrand = {tenant_id:string;slug:string;display_name?:string|null;short_name?:string|null;portal_name?:string|null;logo_asset?:string|null;primary_color?:string|null;accent_color?:string|null};
// Membership data identifies the selected workspace. Host branding must not
// label another agency's explicit workspace or become its export fallback.
export function brandingForWorkspace(runtime:TenantRuntime,workspace:WorkspaceBrand|null):TenantRuntime['branding']{
 if(!workspace)return runtime.branding;
 const sameTenant=runtime.tenant_id===workspace.tenant_id;
 const base=sameTenant?runtime.branding:UNRESOLVED_TENANT_RUNTIME.branding;
 const displayName=workspace.display_name||(sameTenant?base.display_name:null)||workspace.slug;
 return {...base,display_name:displayName,
  short_name:workspace.short_name||(sameTenant?base.short_name:null)||displayName,portal_name:null,
  logo_asset:workspace.logo_asset||base.logo_asset,primary_color:workspace.primary_color||base.primary_color,accent_color:workspace.accent_color||base.accent_color};
}
