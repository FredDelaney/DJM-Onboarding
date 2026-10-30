import assert from 'node:assert/strict';import test from 'node:test';
import { normaliseCalendarEvents,filterCalendarEvents,groupCalendarEvents,todayProjection } from '../lib/calendar/events.ts';
import { parseCalendarPreferences } from '../lib/calendar/preferences.ts';
test('legacy deal follow-up deduplicates the agency deadline and preserves meeting links',()=>{
 const events=normaliseCalendarEvents({operations:{deadlines:{items:[{deadline_type:'deal_next_action',entity_id:'deal',deadline_at:'2026-10-04',title:'Same action'}]}},follow_ups:{items:[{task_id:'f',source:'redream:deal_followup:deal',due_at:'2026-10-04',title:'Follow up'}]},meetings:{items:[{meeting_id:'m',starts_at:'2026-10-04T10:00:00Z',title:'Meet',person_id:'p',meeting_url:'https://example.com/meet'}]}},{items:[]},[]);
 assert.equal(events.length,2);assert.equal(events[0].kind,'follow_up');assert.equal(events.find(e=>e.kind==='meeting')?.meetingUrl,'https://example.com/meet');
});
test('layer and birthday preferences filter events and Today never follows the selected month',()=>{
 const events=normaliseCalendarEvents({meetings:{items:[{id:'m',starts_at:'2026-10-04T14:00:00Z',title:'Today meeting'}]}},{items:[{item_id:'b',date_at:'2026-10-04',title:'Birthday',birthday_category:'contacts'}]},[{id:'t',title:'Company work',visibility:'company',due_on:'2026-10-04',due_at:null,status:'open',archived_at:null} as any]);
 const prefs=parseCalendarPreferences(null);assert.equal(filterCalendarEvents(events,prefs).length,2);
 const summary=todayProjection(filterCalendarEvents(events,prefs),new Date('2026-10-04T10:00:00Z'));assert.equal(summary.dueToday.length,1);assert.equal(summary.nextMeeting?.title,'Today meeting');
 assert.equal(groupCalendarEvents(events,'2026-11-02','month',30,new Date('2026-10-04T10:00:00Z')).length,0);
 prefs.layers.company=false;assert.equal(todayProjection(filterCalendarEvents(events,prefs),new Date('2026-10-04T10:00:00Z')).dueToday.length,0);
});
test('overdue work groups separately and birthdays are never overdue',()=>{
 const events=normaliseCalendarEvents({follow_ups:{items:[{task_id:'old',title:'Late',due_at:'2026-10-01'}]}},{items:[{item_id:'b',title:'Birthday',date_at:'2026-10-01',birthday_category:'players'}]},[]);
 const groups=groupCalendarEvents(events,'2026-10-04','agenda',7,new Date('2026-10-04T10:00:00Z'));assert.equal(groups[0].key,'overdue');assert.equal(groups[0].items.length,1);assert.equal(todayProjection(events,new Date('2026-10-04T10:00:00Z')).overdue.length,1);
});

test('undated shared work never becomes a 1970 deadline or overdue warning',()=>{
 const events=normaliseCalendarEvents({follow_ups:{items:[
  {task_id:'undated',title:'No date',due_at:null},
  {task_id:'empty',title:'Empty date',due_at:''},
  {task_id:'dated',title:'Recorded work',due_at:'2026-11-28',date_only:true}
 ]}},{items:[]},[]);
 assert.deepEqual(events.map(event=>event.title),['Recorded work']);
 assert.equal(todayProjection(events,new Date('2026-11-28T12:00:00Z')).overdue.length,0);
});

test('actual recorded all-day deadline timestamps survive normalization and remain on their recorded day',()=>{
 const previous=process.env.TZ;
 try{
  for(const zone of ['Europe/Rome','America/Los_Angeles']){
   process.env.TZ=zone;
   const kinds=['contract_expiry','representation_record_end','document_expiry','player_next_action'];
   const events=normaliseCalendarEvents({operations:{deadlines:{items:kinds.map(kind=>({deadline_type:kind,entity_id:kind,deadline_at:'2026-11-28T00:00:00+00:00',date_only:true,title:kind}))}},follow_ups:{items:[{task_id:'shared',title:'Recorded follow-up',due_at:'2026-11-28T00:00:00+00:00',date_only:true}]},meetings:{items:[{meeting_id:'timed',title:'Timed meeting',starts_at:'2026-11-28T00:00:00+00:00'}]}},{items:[]},[]);
   assert.equal(events.length,6,'All-day timestamp rows must not be discarded as invalid');
   const allDay=events.filter(event=>event.dateOnly);
   assert.equal(allDay.length,5);assert.ok(allDay.every(event=>event.dateAt==='2026-11-28'));
   assert.equal(events.find(event=>event.kind==='meeting')?.dateAt,'2026-11-28T00:00:00+00:00');
   const now=new Date(2026,10,28,12);
   assert.equal(groupCalendarEvents(allDay,'2026-11-28','month',30,now)[0]?.items.length,5);
   assert.equal(groupCalendarEvents(allDay,'2026-11-28','agenda',30,now)[0]?.items.length,5);
   assert.equal(todayProjection(allDay,now).dueToday.length,5);
   assert.equal(todayProjection(allDay,now).overdue.length,0);
   assert.equal(todayProjection(allDay,new Date(2026,10,29,12)).overdue.length,5);
   const preferences=parseCalendarPreferences(null);preferences.layers.agencyDates=false;
   assert.equal(filterCalendarEvents(events,preferences).length,2,'Existing layer filtering stays intact');
  }
 }finally{if(previous===undefined)delete process.env.TZ;else process.env.TZ=previous;}
});
