import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: cors });

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  try {
    const { token, document_id } = await req.json();
    if (!token || !document_id) {
      return json({ error: "Missing share token or document" }, 400);
    }

    const url = Deno.env.get("SUPABASE_URL");
    const service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!url || !service) return json({ error: "Service unavailable" }, 500);

    const db = createClient(url, service, { auth: { persistSession: false } });
    const now = new Date().toISOString();

    const { data: share, error: shareError } = await db
      .from("club_share_links")
      .select("id,player_id,active,expires_at")
      .eq("token", token)
      .eq("active", true)
      .maybeSingle();

    if (
      shareError ||
      !share ||
      (share.expires_at && share.expires_at <= now)
    ) {
      return json({ error: "Share link unavailable" }, 404);
    }

    const [{ data: player, error: playerError }, { data: profile, error: profileError }] =
      await Promise.all([
        db
          .from("players")
          .select("id,verification_status,verified_at")
          .eq("id", share.player_id)
          .maybeSingle(),
        db
          .from("player_public_profiles")
          .select("player_id,published")
          .eq("player_id", share.player_id)
          .maybeSingle(),
      ]);

    if (
      playerError ||
      profileError ||
      !player ||
      player.verification_status !== "verified" ||
      !player.verified_at ||
      !profile?.published
    ) {
      return json({ error: "Share link unavailable" }, 404);
    }

    const { data: doc, error: docError } = await db
      .from("player_documents")
      .select("id,title,bucket_id,object_path,club_shareable,player_id")
      .eq("id", document_id)
      .eq("player_id", share.player_id)
      .eq("club_shareable", true)
      .maybeSingle();

    if (docError || !doc) return json({ error: "Document unavailable" }, 404);

    const { data: signed, error: signedError } = await db.storage
      .from(doc.bucket_id || "player-private")
      .createSignedUrl(doc.object_path, 120);

    if (signedError || !signed?.signedUrl) {
      return json({ error: "Could not open document" }, 500);
    }

    return json({ url: signed.signedUrl, title: doc.title });
  } catch {
    return json({ error: "Invalid request" }, 400);
  }
});
