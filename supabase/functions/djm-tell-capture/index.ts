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

const safeName = (value: string) =>
  value
    .normalize("NFKD")
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 100) || "tell-djm";

function parseContext(raw: string) {
  try {
    const parsed = JSON.parse(raw || "{}");
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? parsed
      : {};
  } catch {
    throw new Error("context_json must be valid JSON");
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  try {
    const url = Deno.env.get("SUPABASE_URL");
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
    if (!url || !serviceKey || !anonKey) {
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

    const { data: access, error: accessError } = await client.rpc(
      "djm_tell_current_access",
    );
    if (accessError) throw accessError;
    if (!access?.enabled) {
      return json({ error: "Tell DJM is not enabled for this account" }, 403);
    }

    const form = await req.formData();
    const clientCaptureId = String(form.get("client_capture_id") || "").trim();
    const channel = String(form.get("channel") || "voice_debrief").trim();
    const text = String(form.get("text") || "").trim();
    const context = parseContext(String(form.get("context_json") || "{}"));
    const durationRaw = String(form.get("duration_seconds") || "").trim();
    const parentCaptureId = String(form.get("parent_capture_id") || "").trim() || null;
    const file = form.get("file");

    if (!clientCaptureId) return json({ error: "client_capture_id is required" }, 400);
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(clientCaptureId)) {
      return json({ error: "client_capture_id must be a UUID" }, 400);
    }

    const durationSeconds = durationRaw ? Number(durationRaw) : null;
    if (durationSeconds != null && (!Number.isFinite(durationSeconds) || durationSeconds <= 0)) {
      return json({ error: "duration_seconds is invalid" }, 400);
    }
    if (
      durationSeconds != null &&
      durationSeconds > Number(access?.max_audio_seconds || 240) + 5
    ) {
      return json({ error: "Voice note is longer than the allowed recording limit" }, 413);
    }

    let sourceUri: string | null = null;
    let captureType = "text";

    if (file instanceof File) {
      const baseMime = String(file.type || "audio/webm")
        .split(";")[0]
        .trim()
        .toLowerCase();
      const supportedAudioMimes = new Set([
        "audio/webm",
        "audio/mp4",
        "audio/mpeg",
        "audio/mp3",
        "audio/wav",
        "audio/x-m4a",
        "audio/m4a",
      ]);
      if (!supportedAudioMimes.has(baseMime)) {
        return json({ error: "This audio format is not supported by Tell DJM" }, 400);
      }
      if (file.size <= 0) return json({ error: "Voice note is empty" }, 400);
      if (file.size > 12 * 1024 * 1024) {
        return json({ error: "Voice note is too large" }, 413);
      }

      captureType = "audio";
      const bucket = "djm-network-captures";
      const { data: bucketInfo, error: bucketInfoError } = await admin.storage.getBucket(bucket);
      if (bucketInfoError || !bucketInfo) {
        const { error: createBucketError } = await admin.storage.createBucket(bucket, {
          public: false,
          fileSizeLimit: 12 * 1024 * 1024,
          allowedMimeTypes: [
            "audio/webm",
            "audio/mp4",
            "audio/mpeg",
            "audio/mp3",
            "audio/wav",
            "audio/x-m4a",
            "audio/m4a",
          ],
        });
        if (createBucketError && !/already exists/i.test(createBucketError.message || "")) {
          throw createBucketError;
        }
      } else if (bucketInfo.public) {
        throw new Error("Tell DJM capture bucket must remain private");
      }

      const day = new Date().toISOString().slice(0, 10);
      const extension = baseMime.includes("mp4") || baseMime.includes("m4a")
        ? "m4a"
        : baseMime.includes("mpeg") || baseMime.includes("mp3")
          ? "mp3"
          : baseMime.includes("wav")
            ? "wav"
            : "webm";
      const path = `${authData.user.id}/tell-djm/${day}/${clientCaptureId}-${safeName(file.name || `voice.${extension}`)}`;

      const { error: uploadError } = await admin.storage.from(bucket).upload(
        path,
        await file.arrayBuffer(),
        {
          contentType: baseMime,
          upsert: false,
        },
      );

      if (uploadError && !/already exists/i.test(uploadError.message || "")) {
        throw uploadError;
      }
      sourceUri = `${bucket}/${path}`;
    }

    if (!text && !sourceUri) {
      return json({ error: "Voice or text is required" }, 400);
    }

    const { data: queued, error: queueError } = await client.rpc(
      "djm_tell_enqueue_capture",
      {
        p_client_capture_id: clientCaptureId,
        p_capture_type: captureType,
        p_source_uri: sourceUri,
        p_raw_text: text || null,
        p_channel: channel || "voice_debrief",
        p_person_id: context?.person_id || null,
        p_organisation_id: context?.organisation_id || null,
        p_player_id: context?.player_id || null,
        p_context_json: context || {},
        p_duration_seconds: durationSeconds,
        p_parent_capture_id: parentCaptureId,
      },
    );

    if (queueError) {
      // Never delete a stored recording here. The RPC may have committed even if
      // the client lost its response. Keeping a rare orphan is safer than deleting
      // evidence for a valid idempotent capture.
      throw queueError;
    }

    const captureId = queued?.capture_id;
    if (captureId) {
      EdgeRuntime.waitUntil(
        fetch(`${url}/functions/v1/djm-tell-process`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: authHeader,
          },
          body: JSON.stringify({ capture_id: captureId, mode: "process" }),
        }).catch(() => undefined),
      );
    }

    return json({
      ok: true,
      capture_id: captureId,
      status: queued?.status || "queued",
      duplicate: Boolean(queued?.duplicate),
      safely_stored: true,
    });
  } catch (error) {
    console.error(JSON.stringify({
      operation: "djm_tell_capture",
      status: "failed",
      error: error instanceof Error ? error.message : "Tell DJM capture failed",
    }));
    return json(
      { error: error instanceof Error ? error.message : "Tell DJM capture failed" },
      500,
    );
  }
});
