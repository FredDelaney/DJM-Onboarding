// @ts-nocheck
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, "Content-Type": "application/json" },
  });

const supportedAudioMimes = new Set([
  "audio/webm",
  "audio/mp4",
  "audio/mpeg",
  "audio/mp3",
  "audio/wav",
  "audio/x-m4a",
  "audio/m4a",
]);

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  try {
    const url = Deno.env.get("SUPABASE_URL");
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
    const openAiKey = Deno.env.get("OPENAI_API_KEY");
    if (!url || !serviceKey || !anonKey || !openAiKey) {
      return json({ error: "Server configuration is incomplete" }, 500);
    }

    const authHeader = req.headers.get("Authorization") || "";
    const token = authHeader.replace(/^Bearer\s+/i, "");
    if (!token) return json({ error: "Unauthorized" }, 401);

    const admin = createClient(url, serviceKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data: authData, error: authError } = await admin.auth.getUser(token);
    if (authError || !authData?.user) return json({ error: "Unauthorized" }, 401);

    const client = createClient(url, anonKey, {
      global: { headers: { Authorization: `Bearer ${token}` } },
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const [{ data: player, error: playerError }, { data: settings, error: settingsError }] = await Promise.all([
      client.from("players").select("id,first_name,last_name").eq("user_id", authData.user.id).maybeSingle(),
      client.rpc("djm_player_voice_settings"),
    ]);

    if (playerError) throw playerError;
    if (!player?.id) return json({ error: "Player account not found" }, 403);
    if (settingsError) throw settingsError;
    if (!settings?.enabled) return json({ error: "Voice messages are currently unavailable" }, 503);

    const form = await req.formData();
    const file = form.get("file");
    const durationRaw = String(form.get("duration_seconds") || "").trim();
    const durationSeconds = durationRaw ? Number(durationRaw) : null;
    const maxSeconds = Number(settings?.max_audio_seconds || 240);

    if (!(file instanceof File)) return json({ error: "Voice recording is required" }, 400);
    if (durationSeconds != null && (!Number.isFinite(durationSeconds) || durationSeconds <= 0)) {
      return json({ error: "duration_seconds is invalid" }, 400);
    }
    if (durationSeconds != null && durationSeconds > maxSeconds + 5) {
      return json({ error: "Voice message is longer than the allowed recording limit" }, 413);
    }
    if (file.size <= 0) return json({ error: "Voice message is empty" }, 400);
    if (file.size > 12 * 1024 * 1024) return json({ error: "Voice message is too large" }, 413);

    const baseMime = String(file.type || "audio/webm").split(";")[0].trim().toLowerCase();
    if (!supportedAudioMimes.has(baseMime)) {
      return json({ error: "This audio format is not supported" }, 400);
    }

    const formData = new FormData();
    formData.append("file", file);
    formData.append("model", "gpt-transcribe");
    formData.append("response_format", "json");
    formData.append(
      "prompt",
      "Message from a professional football player to their agency. Preserve names, clubs, dates, amounts and football terms exactly. Do not add or infer information.",
    );

    const transcription = await fetch("https://api.openai.com/v1/audio/transcriptions", {
      method: "POST",
      headers: { Authorization: `Bearer ${openAiKey}` },
      body: formData,
      signal: AbortSignal.timeout(45_000),
    });

    if (!transcription.ok) {
      const detail = await transcription.text().catch(() => "");
      console.error(JSON.stringify({ operation: "player_voice_transcription", status: transcription.status, detail: detail.slice(0, 300) }));
      return json({ error: "DJM could not transcribe that voice message. Please try again." }, 502);
    }

    const payload = await transcription.json();
    const transcript = String(payload?.text || "").trim();
    if (!transcript) return json({ error: "DJM could not hear any speech in that recording" }, 422);

    const { data: requestRow, error: insertError } = await client
      .from("player_requests")
      .insert({
        player_id: player.id,
        title: "Voice message",
        message: null,
        request_type: "message",
        status: "open",
        due_at: null,
        player_reply: transcript,
        created_by: null,
        completed_at: null,
      })
      .select("id,assigned_to_user_id,created_at")
      .single();

    if (insertError) throw insertError;

    return json({
      ok: true,
      request_id: requestRow?.id,
      transcript,
      assigned_to_user_id: requestRow?.assigned_to_user_id || null,
      created_at: requestRow?.created_at || null,
      delivered: true,
    });
  } catch (error) {
    console.error(JSON.stringify({
      operation: "djm_player_voice_message",
      status: "failed",
      error: error instanceof Error ? error.message : "Voice message failed",
    }));
    return json({ error: error instanceof Error ? error.message : "Voice message failed" }, 500);
  }
});
