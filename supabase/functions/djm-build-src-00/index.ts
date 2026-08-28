import "jsr:@supabase/functions-js/edge-runtime.d.ts";
Deno.serve(()=>new Response(JSON.stringify({error:"Not found"}),{status:404,headers:{"Content-Type":"application/json"}}));
