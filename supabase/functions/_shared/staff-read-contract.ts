// Assigned staff receive football evidence through an explicit allowlist.
const pick = (value: any, fields: string[]) => Object.fromEntries(fields.filter(key => value?.[key] !== undefined).map(key => [key,value[key]]));
export const restrictedPlayerProfile = (profile: any) => ({
 access:{scope:'assigned',restricted:true},
 player:pick(profile?.player,['id','first_name','last_name','preferred_name','date_of_birth','nationalities','height_cm','preferred_foot','primary_position','secondary_positions','current_club','current_league','current_country','football_status','transfermarkt_url','wyscout_url','stats_url','profile_photo_path','verification_status','verified_at','current_season_label']),
 career:(Array.isArray(profile?.career)?profile.career:[]).map((row:any)=>pick(row,['id','player_id','club_name','country','league','season_label','start_date','end_date','appearances','starts','minutes','goals','assists','is_international','sort_order','source_name','source_url','source_reviewed_at','source_provider','source_synced_at','updated_at'])),
 videos:(Array.isArray(profile?.videos)?profile.videos:[]).map((row:any)=>pick(row,['id','title','url','video_type','featured','sort_order'])),
 settings:{},published:null,documents:[],shares:[],deals:[],clubs:[],branding:{},
 communication:{summary:{},items:[],open_followups:[]},
 auto_key_stats:Array.isArray(profile?.auto_key_stats)?profile.auto_key_stats.map((row:any)=>pick(row,['label','value'])):[],
 auto_stats_meta:profile?.auto_stats_meta?pick(profile.auto_stats_meta,['row_id','season_label','club_name','league','provider','source_name','source_url','data_updated_at','checked_at','automated']):null,secondary_ready:true,
});
export const restrictedClubAccount = (account:any) => ({
 access:{scope:'identity',restricted:true},
 club:pick(account?.club,['id','organisation_id','name','country','city','league_name','website_url']),
});
