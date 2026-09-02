import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json",
  "Cache-Control": "no-store",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: cors });

const unique = (values: string[]) => [...new Set(values.filter(Boolean))];

async function collectFolder(
  admin: any,
  bucket: string,
  prefix: string,
  depth = 0,
): Promise<string[]> {
  if (!prefix || depth > 8) return [];

  const { data, error } = await admin.storage
    .from(bucket)
    .list(prefix, { limit: 1000, sortBy: { column: "name", order: "asc" } });

  if (error) {
    throw new Error(`Could not inspect ${bucket} storage before removal: ${error.message}`);
  }

  const paths: string[] = [];
  for (const item of data || []) {
    const next = `${prefix}/${item.name}`;
    if (item.id) {
      paths.push(next);
    } else {
      paths.push(...await collectFolder(admin, bucket, next, depth + 1));
    }
  }
  return paths;
}

async function removePaths(admin: any, bucket: string, paths: string[]) {
  const items = unique(paths);
  let removed = 0;

  for (let index = 0; index < items.length; index += 100) {
    const batch = items.slice(index, index + 100);
    const { error } = await admin.storage.from(bucket).remove(batch);
    if (error) {
      throw new Error(`Could not remove ${bucket} files: ${error.message}`);
    }
    removed += batch.length;
  }

  return removed;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  try {
    const url = Deno.env.get("SUPABASE_URL");
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const token = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");

    if (!url || !serviceKey) return json({ error: "Service unavailable" }, 500);
    if (!token) return json({ error: "Unauthorized" }, 401);

    const admin = createClient(url, serviceKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const { data: authData, error: authError } = await admin.auth.getUser(token);
    const caller = authData?.user;
    if (authError || !caller) return json({ error: "Unauthorized" }, 401);

    const { data: callerProfile, error: callerProfileError } = await admin
      .from("profiles")
      .select("role")
      .eq("id", caller.id)
      .maybeSingle();

    if (callerProfileError) throw callerProfileError;
    if (callerProfile?.role !== "admin") {
      return json({ error: "Admin access required" }, 403);
    }

    const body = await req.json().catch(() => ({}));
    const playerId = String(body?.player_id || "").trim();
    const confirmation = String(body?.confirmation || "").trim();

    if (!playerId) return json({ error: "Missing player" }, 400);

    const { data: player, error: playerError } = await admin
      .from("players")
      .select("id,user_id,first_name,last_name,preferred_name,profile_photo_path")
      .eq("id", playerId)
      .maybeSingle();

    if (playerError) throw playerError;
    if (!player) return json({ error: "Player not found" }, 404);

    const playerName =
      [player.first_name, player.last_name].filter(Boolean).join(" ").trim() ||
      player.preferred_name?.trim() ||
      "Unnamed player";

    if (confirmation.toLowerCase() !== playerName.toLowerCase()) {
      return json({ error: "Confirmation did not match the player name" }, 400);
    }

    if (player.user_id === caller.id) {
      return json({ error: "A DJM staff account cannot be removed through player deletion" }, 409);
    }

    if (player.user_id) {
      const [{ data: linkedProfile, error: linkedProfileError }, { data: teamMember, error: teamMemberError }] =
        await Promise.all([
          admin
            .from("profiles")
            .select("role")
            .eq("id", player.user_id)
            .maybeSingle(),
          admin
            .schema("djm_os")
            .from("team_members")
            .select("is_active")
            .eq("user_id", player.user_id)
            .eq("is_active", true)
            .maybeSingle(),
        ]);

      if (linkedProfileError) throw linkedProfileError;
      if (teamMemberError) throw teamMemberError;

      if (
        linkedProfile?.role === "admin" ||
        linkedProfile?.role === "scout" ||
        teamMember?.is_active
      ) {
        return json({
          error: "This player is linked to a DJM staff account and must be unlinked manually",
        }, 409);
      }
    }

    const [{ data: docs, error: docsError }, { data: publicProfile, error: publicProfileError }] =
      await Promise.all([
        admin
          .from("player_documents")
          .select("bucket_id,object_path")
          .eq("player_id", playerId),
        admin
          .from("player_public_profiles")
          .select("profile_photo_path,hero_image_path")
          .eq("player_id", playerId)
          .maybeSingle(),
      ]);

    if (docsError) throw docsError;
    if (publicProfileError) throw publicProfileError;

    const byBucket = new Map<string, string[]>();
    for (const doc of docs || []) {
      if (!doc?.object_path) continue;
      const bucket = doc.bucket_id || "player-private";
      byBucket.set(bucket, [...(byBucket.get(bucket) || []), doc.object_path]);
    }

    if (player.user_id) {
      const privateFolder = await collectFolder(admin, "player-private", player.user_id);
      byBucket.set(
        "player-private",
        [...(byBucket.get("player-private") || []), ...privateFolder],
      );
    }

    const publicFolder = await collectFolder(admin, "player-public", `admin/${playerId}`);
    byBucket.set(
      "player-public",
      [
        ...(byBucket.get("player-public") || []),
        ...publicFolder,
        ...(player.profile_photo_path ? [player.profile_photo_path] : []),
        ...(publicProfile?.profile_photo_path ? [publicProfile.profile_photo_path] : []),
        ...(publicProfile?.hero_image_path ? [publicProfile.hero_image_path] : []),
      ],
    );

    let authDeleted = false;
    if (player.user_id) {
      const { error: deleteAuthError } = await admin.auth.admin.deleteUser(player.user_id);
      if (deleteAuthError) {
        throw new Error(`Could not remove linked player login: ${deleteAuthError.message}`);
      }
      authDeleted = true;
    }

    let storageRemoved = 0;
    for (const [bucket, paths] of byBucket.entries()) {
      storageRemoved += await removePaths(admin, bucket, paths);
    }

    const { data: deletedRows, error: deletePlayerError } = await admin
      .from("players")
      .delete()
      .eq("id", playerId)
      .select("id");

    if (deletePlayerError) throw deletePlayerError;
    if (!deletedRows?.length) {
      throw new Error("The player login was removed but the player record could not be deleted");
    }

    const { data: stillThere } = await admin
      .from("players")
      .select("id")
      .eq("id", playerId)
      .maybeSingle();

    if (stillThere) {
      throw new Error("Player record still exists after deletion attempt");
    }

    return json({
      ok: true,
      player_id: playerId,
      player_name: playerName,
      auth_deleted: authDeleted,
      storage_objects_removed: storageRemoved,
      retained_operational_history: true,
    });
  } catch (error) {
    return json(
      { error: error instanceof Error ? error.message : "Could not remove player" },
      500,
    );
  }
});
