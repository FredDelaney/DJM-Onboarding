// Patch only the fields changed in this editor. Omitted and unknown fields stay untouched.
export function changedEntityFields(fields:readonly {key:string;value?:unknown}[],draft:Record<string,string>):Record<string,string> {
 return Object.fromEntries(fields.filter(field=>(draft[field.key]??'')!==String(field.value??'')).map(field=>[field.key,draft[field.key]??'']));
}
