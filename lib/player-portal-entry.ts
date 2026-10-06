export function verifiedPlayerPortalUrl(hostname:unknown):string|null {
 const host=typeof hostname==='string'?hostname.trim().toLowerCase():'';
 if(!host||host.length>253||!host.includes('.')||/^[0-9.]+$/.test(host))return null;
 if(!host.split('.').every(part=>/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(part)))return null;
 return 'https://'+host+'/sign-in';
}
