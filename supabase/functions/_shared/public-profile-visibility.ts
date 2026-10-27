// Only reviewed public fields belong in a public response. Never spread a snapshot.
const publicFields = ["display_name","headline","primary_position","secondary_positions","preferred_foot","age_display","height_display","nationalities","current_status","current_club","key_stats","why_review","career_summary","profile_photo_path","hero_image_path","primary_video_url","transfermarkt_url","wyscout_url","stats_url","career_timeline","selected_videos","notable_experience","market_value_display","market_value_source_url","hidden_sections","hide_market_value","contact_email","verified_at"] as const;
const sectionClears: Record<string, Record<string, unknown>> = {"why_review":{"why_review":null},"stats":{"key_stats":[]},"summary":{"career_summary":null},"career":{"career_timeline":[]},"videos":{"primary_video_url":null,"selected_videos":[]},"experience":{"notable_experience":[]}};
const isRecord = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === "object" && !Array.isArray(value);
function validSections(value: unknown): value is string[] {
  return Array.isArray(value) && value.every(section => typeof section === "string");
}
export function publicProfileSectionHidden(value: unknown, section: string): boolean {
  return !isRecord(value) || !validSections(value.hidden_sections) || value.hidden_sections.includes(section);
}
export function visiblePublicPlayerProfile(value: unknown): Record<string, unknown> | null {
  if (!isRecord(value) || Object.keys(value).length === 0) return null;
  const profile: Record<string, unknown> = {};
  for (const field of publicFields) if (Object.hasOwn(value, field)) profile[field] = value[field];
  profile.hidden_sections = validSections(value.hidden_sections) ? [...value.hidden_sections] : Object.keys(sectionClears);
  for (const [section, cleared] of Object.entries(sectionClears)) {
    if (publicProfileSectionHidden(value, section)) Object.assign(profile, cleared);
  }
  profile.hide_market_value = value.hide_market_value !== false;
  if (profile.hide_market_value) {
    profile.market_value_display = null;
    profile.market_value_source_url = null;
  }
  return profile;
}
