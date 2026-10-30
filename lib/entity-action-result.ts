export type EntityMutation = 'edit' | 'archive' | 'delete';

// A successful transport is not proof that the selected record was changed.
export function confirmsEntityAction(value:unknown,change:EntityMutation,kind:string,id:string,versioned=false):boolean{
 if(!value||typeof value!=='object'||Array.isArray(value))return false;
 const result=value as Record<string,unknown>;
 if(result.id!==id||result.entity_type!==kind)return false;
 if(change==='delete')return result.deleted===true;
 if(result.ok!==true)return false;
 return change==='archive'?result.archived===true:!versioned||result.brief_version===1;
}

// These database errors abort the RPC transaction. Network/connection failures
// and ambiguous errors cannot establish whether the write committed.
export function isDefinitiveEntityDenial(error:unknown):boolean{
 const code=error&&typeof error==='object'&&'code' in error?String(error.code):'';
 return /^(22|23|42)[A-Z0-9]{3}$/.test(code)||['P0001','40001','40P01','PGRST202'].includes(code);
}

export function entityActionErrorMessage(error:unknown):string{
 const code=error&&typeof error==='object'&&'code' in error?String(error.code):'';
 if(code==='42501')return "This record is unavailable or you don't have permission to manage it.";
 if(code==='PGRST202'||code.startsWith('42'))return 'This action is unavailable right now. Refresh the page and try again.';
 if(code==='23505')return 'A record with these details already exists. Check the name before saving.';
 return error instanceof Error?error.message:'The action could not complete. Please try again.';
}
