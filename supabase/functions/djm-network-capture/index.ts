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
  value.normalize("NFKD").replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "").slice(0, 100) || "capture";

const captureTypeFromMime = (mime: string) => {
  if (mime.startsWith("image/")) return "image";
  if (mime.startsWith("audio/")) return "audio";
  if (mime.startsWith("video/")) return "video";
  return "document";
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  try {
    const url = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const authHeader = req.headers.get("Authorization") || "";
    const token = authHeader.replace(/^Bearer\s+/i, "");
    if (!token) return json({ error: "Unauthorized" }, 401);

    const admin = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
    const { data: authData, error: authError } = await admin.auth.getUser(token);
    const user = authData?.user;
    if (authError || !user) return json({ error: "Unauthorized" }, 401);

    const client = createClient(url, anonKey, {
      global: { headers: { Authorization: `Bearer ${token}` } },
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const { error: accessError } = await client.rpc("djm_network_dashboard");
    if (accessError) return json({ error: "DJM Network access required" }, 403);

    const contentType = req.headers.get("content-type") || "";

    if (contentType.includes("application/json")) {
      const body = await req.json().catch(() => ({}));
      const mode = String(body?.mode || "capture").toLowerCase();

      if (mode === "message" || body?.external_thread_id) {
        const externalThreadId = String(body?.external_thread_id || "").trim();
        if (!externalThreadId) return json({ error: "external_thread_id is required" }, 400);
        const channel = String(body?.channel || "whatsapp");
        const { data: threadId, error: threadError } = await client.rpc("djm_upsert_thread", {
          p_channel: channel,
          p_external_thread_id: externalThreadId,
          p_person_id: body?.person_id || null,
          p_organisation_id: body?.organisation_id || null,
          p_thread_label: body?.thread_label || null,
          p_metadata: body?.metadata || {},
        });
        if (threadError) throw threadError;

        const text = body?.text == null ? null : String(body.text);
        const transcript = body?.transcript_text == null ? null : String(body.transcript_text);
        if (!text && !transcript && !body?.asset_uri) return json({ error: "Message text, transcript or asset is required" }, 400);

        const { data: messageResult, error: messageError } = await client.rpc("djm_store_message", {
          p_thread_id: threadId,
          p_sent_at: body?.sent_at || new Date().toISOString(),
          p_direction: String(body?.direction || "incoming"),
          p_raw_text: text,
          p_external_message_id: body?.external_message_id || null,
          p_sender_label: body?.sender_label || null,
          p_message_type: String(body?.message_type || (transcript ? "audio" : "text")),
          p_asset_uri: body?.asset_uri || null,
          p_transcript_text: transcript,
          p_reply_to_external_id: body?.reply_to_external_id || null,
        });
        if (messageError) throw messageError;
        return json({ ok: true, mode: "message", thread_id: threadId, result: messageResult });
      }

      const text = String(body?.text || "").trim();
      if (!text) return json({ error: "Capture text is required" }, 400);
      const { data, error } = await client.rpc("djm_network_capture_smart", {
        p_text: text,
        p_channel: String(body?.channel || "whatsapp"),
        p_person_id: body?.person_id || null,
        p_organisation_id: body?.organisation_id || null,
        p_occurred_at: body?.occurred_at || new Date().toISOString(),
      });
      if (error) throw error;
      return json({ ok: true, mode: "capture", type: "text", result: data });
    }

    if (contentType.includes("multipart/form-data")) {
      const form = await req.formData();
      const file = form.get("file");
      if (!(file instanceof File)) return json({ error: "File is required" }, 400);
      if (file.size > 12 * 1024 * 1024) return json({ error: "File is too large (12 MB max)" }, 413);

      const inferred = captureTypeFromMime(file.type || "application/octet-stream");
      const requested = String(form.get("capture_type") || inferred);
      const captureType = ["image", "audio", "video", "document"].includes(requested) ? requested : inferred;
      const channel = String(form.get("channel") || "whatsapp");
      const personId = String(form.get("person_id") || "") || null;
      const organisationId = String(form.get("organisation_id") || "") || null;
      const externalThreadId = String(form.get("external_thread_id") || "") || null;
      const noteText = String(form.get("text") || "").trim();

      const bucket = "djm-network-captures";
      const { error: bucketError } = await admin.storage.createBucket(bucket, { public: false, fileSizeLimit: 12 * 1024 * 1024 });
      if (bucketError && !/already exists/i.test(bucketError.message || "")) throw bucketError;

      const date = new Date().toISOString().slice(0, 10);
      const path = `${user.id}/${date}/${crypto.randomUUID()}-${safeName(file.name)}`;
      const bytes = await file.arrayBuffer();
      const { error: uploadError } = await admin.storage.from(bucket).upload(path, bytes, { contentType: file.type || "application/octet-stream", upsert: false });
      if (uploadError) throw uploadError;
      const storagePath = `${bucket}/${path}`;

      if (externalThreadId) {
        const { data: threadId, error: threadError } = await client.rpc("djm_upsert_thread", {
          p_channel: channel,
          p_external_thread_id: externalThreadId,
          p_person_id: personId,
          p_organisation_id: organisationId,
          p_thread_label: String(form.get("thread_label") || "") || null,
          p_metadata: {},
        });
        if (threadError) throw threadError;
        const { data: messageResult, error: messageError } = await client.rpc("djm_store_message", {
          p_thread_id: threadId,
          p_sent_at: String(form.get("sent_at") || new Date().toISOString()),
          p_direction: String(form.get("direction") || "incoming"),
          p_raw_text: noteText || null,
          p_external_message_id: String(form.get("external_message_id") || "") || null,
          p_sender_label: String(form.get("sender_label") || "") || null,
          p_message_type: captureType,
          p_asset_uri: storagePath,
          p_transcript_text: String(form.get("transcript_text") || "") || null,
          p_reply_to_external_id: String(form.get("reply_to_external_id") || "") || null,
        });
        if (messageError) throw messageError;
        return json({ ok: true, mode: "message", type: captureType, thread_id: threadId, storage_path: storagePath, result: messageResult });
      }

      const { data, error } = await client.rpc("djm_network_capture_asset", {
        p_storage_path: storagePath,
        p_capture_type: captureType,
        p_channel: channel,
        p_person_id: personId,
        p_organisation_id: organisationId,
      });
      if (error) {
        await admin.storage.from(bucket).remove([path]);
        throw error;
      }

      let noteResult: unknown = null;
      if (noteText) {
        const { data: smartNote, error: noteError } = await client.rpc("djm_network_capture_smart", {
          p_text: noteText,
          p_channel: channel,
          p_person_id: personId,
          p_organisation_id: organisationId,
          p_occurred_at: new Date().toISOString(),
        });
        if (noteError) throw noteError;
        noteResult = smartNote;
      }

      return json({ ok: true, mode: "capture", type: captureType, storage_path: storagePath, result: data, note_result: noteResult });
    }

    return json({ error: "Use JSON or multipart/form-data" }, 415);
  } catch (error) {
    console.error("djm-network-capture", error);
    return json({ error: error instanceof Error ? error.message : "Capture failed" }, 500);
  }
});
