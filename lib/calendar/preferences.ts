import { calendarPreferences,type BirthdayFilters } from './dates.ts';
export const calendarLayers=['personal','company','meetings','followUps','agencyDates','birthdays'] as const;
export type CalendarLayer=typeof calendarLayers[number];
export type CalendarPreferences={version:2;view:'month'|'agenda';layers:Record<CalendarLayer,boolean>;birthdays:BirthdayFilters};
export function parseCalendarPreferences(raw:string|null):CalendarPreferences {
 let saved:any={};try{saved=JSON.parse(raw||'{}')||{};}catch{}
 return {version:2,view:saved.view==='agenda'?'agenda':'month',layers:Object.fromEntries(calendarLayers.map(layer=>[layer,saved.layers?.[layer]!==false])) as Record<CalendarLayer,boolean>,birthdays:calendarPreferences(JSON.stringify(saved.version===2?saved.birthdays||{}:saved))};
}
