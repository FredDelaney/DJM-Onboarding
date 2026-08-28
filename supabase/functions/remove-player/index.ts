import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return new Response(JSON.stringify({ error: "Method not allowed" }), { status: 405, headers: { ...cors, "Content-Type": "application/json" } });

  try {
    const url = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const authHeader = req.headers.get("Authorization") || "";
    const token = authHeader.replace(/^Bearer\s+/i, "");
    if (!token) return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...cors, "Content-Type": "application/json" } });

    const admin = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
    const { data: authData, error: authError } = await admin.auth.getUser(token);
    const user = authData?.user;
    if (authError || !user) return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...cors, "Content-Type": "application/json" } });

    const { data: profile } = await admin.from("profiles").select("role").eq("id", user.id).maybeSingle();
    if (profile?.role !== "admin") return new Response(JSON.stringify({ error: "Admin access required" }), { status: 403, headers: { ...cors, "Content-Type": "application/json" } });

    const body = await req.json().catch(() => ({}));
    const playerId = String(body?.player_id || "");
    const confirmation = String(body?.confirmation || "").trim();
    if (!playerId) return new Response(JSON.stringify({ error: "Missing player" }), { status: 400, headers: { ...cors, "Content-Type": "application/json" } });

    const { data: player, error: playerError } = await admin.from("players").select("id,user_id,first_name,last_name,preferred_name,profile_photo_path").eq("id", playerId).maybeSingle();
    if (playerError || !player) return new Response(JSON.stringify({ error: "Player not found" }), { status: 404, headers: { ...cors, "Content-Type": "application/json" } });

    const playerName = [player.first_name, player.last_name].filter(Boolean).join(" ") || player.preferred_name || "REMOVE";
    if (confirmation.toLowerCase() !== playerName.toLowerCase() && confirmation !== "REMOVE") {
      return new Response(JSON.stringify({ error: "Confirmation did not match" }), { status: 400, headers: { ...cors, "Content-Type": "application/json" } });
    }

    const { data: docs } = await admin.from("player_documents").select("bucket_id,object_path").eq("player_id", playerId);
    const byBucket = new Map<string, string[]>();
    for (const doc of docs || []) {
      if (!doc?.object_path) continue;
      const bucket = doc.bucket_id || "player-private";
      const paths = byBucket.get(bucket) || [];
      paths.push(doc.object_path);
      byBucket.set(bucket, paths);
    }
    if (player.profile_photo_path) {
      const paths = byBucket.get("player-public") || [];
      paths.push(player.profile_photo_path);
      byBucket.set("player-public", paths);
    }
    for (const [bucket, paths] of byBucket.entries()) {
      if (paths.length) await admin.storage.from(bucket).remove(paths);
    }

    const { error: deletePlayerError } = await admin.from("players").delete().eq("id", playerId);
    if (deletePlayerError) throw deletePlayerError;

    let auth_deleted = false;
    if (player.user_id) {
      const { error: deleteAuthError } = await admin.auth.admin.deleteUser(player.user_id);
      auth_deleted = !deleteAuthError;
    }

    return new Response(JSON.stringify({ ok: true, player_name: playerName, auth_deleted }), { status: 200, headers: { ...cors, "Content-Type": "application/json" } });
  } catch (error) {
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : "Could not remove player" }), { status: 500, headers: { ...cors, "Content-Type": "application/json" } });
  }
});
