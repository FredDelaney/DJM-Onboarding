// Only a missing new RPC means the staff-assignment migration is not enabled.
// Permission, connection, timeout and underlying database errors stay errors.
export function isMissingStaffAssignmentRpc(error:unknown,name:'redream_home_relevance_v1'|'redream_player_staff_tags_v1'):boolean {
 const value=error as {code?:unknown;message?:unknown}|null;
 return value?.code==='PGRST202' && typeof value.message==='string' && value.message.includes(name);
}
