import {invoiceCurrencyMinorUnit} from './invoice-currencies.ts';

// These are request budgets, never agreed player earnings or agency revenue.
export const clubNeedCommercialFields = [
  {key:'salary_budget', label:'Salary budget (maximum)', type:'number'},
  {key:'currency', label:'Currency', type:'text'},
  {key:'salary_period', label:'Salary period', type:'select', options:[['','Unknown'],['monthly','Monthly'],['weekly','Weekly'],['annual','Annual']]},
  {key:'salary_tax_basis', label:'Tax basis', type:'select', options:[['','Unknown'],['gross','Gross'],['net','Net']]},
  {key:'contract_months', label:'Initial contract (months)', type:'number'},
  {key:'contract_guaranteed', label:'Guaranteed initial term requested?', type:'select', options:[['','Not established'],['true','Yes'],['false','No']]},
  {key:'option_months', label:'Optional extension (months)', type:'number'},
  {key:'transfer_type', label:'Transfer preference', type:'select', options:[['','Unknown'],['free_agent','Free agent preferred'],['permanent','Permanent'],['loan','Loan']]},
  {key:'transfer_budget', label:'Transfer fee budget (maximum)', type:'number'},
  {key:'availability_notes', label:'Availability / joining deadline', type:'textarea'},
] as const;

export const clubNeedFootballFields = [
  {key:'secondary_position',label:'Other suitable positions',type:'text'},
  {key:'min_age',label:'Minimum age',type:'number'},
  {key:'max_age',label:'Maximum age',type:'number'},
  {key:'preferred_foot',label:'Preferred foot',type:'select',options:[['','Not specified'],['left','Left'],['right','Right'],['both','Both']]},
  {key:'min_height_cm',label:'Minimum height (cm)',type:'number'},
  {key:'level_requirements',label:'Playing level & experience',type:'textarea'},
  {key:'nationality_preferences',label:'Nationality preferences (one per line)',type:'textarea'},
  {key:'passport_requirements',label:'Passport requirements',type:'textarea'},
  {key:'registration_notes',label:'Registration, work permit & deadlines',type:'textarea'},
  {key:'foreign_player_notes',label:'Foreign-player restrictions',type:'textarea'},
  {key:'playing_style',label:'Playing style',type:'textarea'},
] as const;
export const clubNeedSourceFields = [
  {key:'source_status', label:'Source status', type:'select', options:[['','Not established'],['confirmed','Confirmed with source'],['reported','Reported'],['unverified','Unverified']]},
  {key:'source_person_id',label:'Source contact',type:'reference',lookupKind:'contact'},
  {key:'source_organisation_id',label:'Source organisation',type:'reference',lookupKind:'organisation'},
  {key:'received_on',label:'Date received (if known)',type:'date'},
  {key:'priority',label:'Priority',type:'select',options:[['','Normal'],['1','Low'],['2','Routine'],['3','Normal'],['4','High'],['5','Urgent']]},
  {key:'source_context',label:'Source context',type:'textarea'},
] as const;
export const clubNeedBriefFields=[...clubNeedCommercialFields.map(field=>({...field,section:'Budget & contract'})),...clubNeedFootballFields.map(field=>({...field,section:'Football requirements'})),...clubNeedSourceFields.map(field=>({...field,section:'Source & priority'}))] as const;

export type ClubNeedBrief = Partial<Record<typeof clubNeedBriefFields[number]['key'], unknown>>;
export const emptyClubNeedBrief = Object.fromEntries(clubNeedBriefFields.map(field => [field.key, ''])) as Record<typeof clubNeedBriefFields[number]['key'], string>;

export function validateClubNeedBrief(brief:ClubNeedBrief):void {
  const text=(key:keyof ClubNeedBrief)=>clubNeedFieldValue(key,brief[key]).trim();
  const currency=text('currency').toUpperCase();
  if(currency && invoiceCurrencyMinorUnit(currency)===null)throw new Error('Choose a valid three-letter currency, or leave it blank.');
  for(const key of ['salary_budget','transfer_budget'] as const){
    const value=text(key),digits=currency?invoiceCurrencyMinorUnit(currency)!:4;
    if(value && (!/^\d{1,12}(\.\d{1,4})?$/.test(value) || (value.split('.')[1]?.length??0)>digits))throw new Error(`Check the ${key==='salary_budget'?'salary':'transfer fee'} budget and currency precision.`);
  }
  for(const key of ['contract_months','option_months'] as const){
    const value=text(key);
    if(value && (!/^\d{1,3}$/.test(value) || Number(value)<1 || Number(value)>120))throw new Error('Contract and extension terms must be between 1 and 120 months.');
  }
  for(const field of clubNeedBriefFields){
    if(field.type==='select' && !field.options.some(([value])=>value===text(field.key)))throw new Error(`Check ${field.label.toLowerCase()}.`);
  }
  if(text('contract_guaranteed') && !text('contract_months'))throw new Error('Add the initial contract term before recording its guarantee.');
  if(text('availability_notes').length>2000)throw new Error('Keep availability details within 2,000 characters.');
  for(const field of [...clubNeedFootballFields,...clubNeedSourceFields])if(field.type==='textarea'&&text(field.key).length>2000)throw new Error(`Keep ${field.label.toLowerCase()} within 2,000 characters.`);
  const nationalities=text('nationality_preferences').split('\n').map(value=>value.trim()).filter(Boolean);
  if(nationalities.length>30||nationalities.some(value=>value.length>100))throw new Error('Use up to 30 nationality preferences, with at most 100 characters each.');
  for(const key of ['min_age','max_age','min_height_cm'] as const){
    const value=text(key),min=key==='min_height_cm'?140:1,max=key==='min_height_cm'?230:99;
    if(value&&(!/^\d{1,3}$/.test(value)||Number(value)<min||Number(value)>max))throw new Error(key==='min_height_cm'?'Minimum height must be between 140 and 230 cm.':'Ages must be whole years between 1 and 99.');
  }
  if(text('min_age')&&text('max_age')&&Number(text('min_age'))>Number(text('max_age')))throw new Error('Minimum age must not exceed maximum age.');
  if(text('secondary_position').length>200)throw new Error('Keep other suitable positions within 200 characters.');
  const date=text('received_on');if(date&&(!/^\d{4}-\d{2}-\d{2}$/.test(date)||Number.isNaN(Date.parse(date+'T00:00:00Z'))||new Date(date+'T00:00:00Z').toISOString().slice(0,10)!==date))throw new Error('Choose a valid date received.');
  for(const key of ['source_person_id','source_organisation_id'] as const)if(text(key)&&!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(text(key)))throw new Error('Choose an existing source record.');
}

export function clubNeedFieldValue(key:string,value:unknown):string {
  if(key==='nationality_preferences'&&Array.isArray(value))return value.join('\n');
  if(key==='preferred_foot'&&['left','right','both'].includes(String(value).toLowerCase()))return String(value).toLowerCase();
  return value==null?'':String(value);
}

export function clubNeedFootballFacts(need:ClubNeedBrief):[string,string][] {
 const text=(key:keyof ClubNeedBrief)=>clubNeedFieldValue(key,need[key]).trim();
 return [
  ['Other positions',text('secondary_position')],['Age range',text('min_age')&&text('max_age')?`${text('min_age')} to ${text('max_age')}`:text('min_age')?`${text('min_age')} and above`:text('max_age')?`Up to ${text('max_age')}`:''],
  ['Playing level & experience',text('level_requirements')],['Nationalities',text('nationality_preferences').split('\n').filter(Boolean).join(', ')],
  ['Passports',text('passport_requirements')],['Registration & deadlines',text('registration_notes')],['Foreign-player restrictions',text('foreign_player_notes')],['Playing style',text('playing_style')],
 ].filter(([,value])=>value) as [string,string][];
}

function amount(value:unknown,currency:unknown,multiplier=1):string|null {
  const raw=String(value??'').trim(),code=String(currency??'').trim().toUpperCase();
  if(!/^\d{1,12}(\.\d{1,4})?$/.test(raw))return null;
  const [whole,fraction='']=raw.split('.');
  const scale=BigInt(10000);
  const units=(BigInt(whole)*scale+BigInt(fraction.padEnd(4,'0')))*BigInt(multiplier);
  const integer=(units/scale).toString().replace(/\B(?=(\d{3})+(?!\d))/g,',');
  const tail=(units%scale).toString().padStart(4,'0').replace(/0+$/,'');
  return `${code || 'Currency unknown'} ${integer}${tail?'.'+tail:''}`;
}
export {amount as formatCommercialAmount};

export function clubNeedFinancialFacts(brief:ClubNeedBrief):[string,string][] {
  const facts:[string,string][]=[];
  const salary=amount(brief.salary_budget,brief.currency);
  if(salary){
    const period=brief.salary_period==='monthly'?'per month':brief.salary_period==='weekly'?'per week':brief.salary_period==='annual'?'per year':'period unknown';
    facts.push(['Salary budget',`${salary} ${period} · ${brief.salary_tax_basis==='gross'?'gross':brief.salary_tax_basis==='net'?'net':'tax basis unknown'}`]);
    const multiplier=brief.salary_period==='monthly'?12:brief.salary_period==='weekly'?52:brief.salary_period==='annual'?1:null;
    if(multiplier)facts.push([`Annualised budget (${brief.salary_period==='weekly'?'52 weeks':'12 paid months'})`,amount(brief.salary_budget,brief.currency,multiplier)!]);
    // Monthly arithmetic needs no weekly/monthly conversion or rounding assumption.
    if(brief.salary_period==='monthly'){
      for(const [key,label] of [['contract_months','Initial-term base budget'],['option_months','Optional extension budget (not guaranteed)']] as const){
        const months=String(brief[key]??'');
        if(/^\d{1,3}$/.test(months)&&Number(months)>0&&Number(months)<=120)facts.push([label,`${amount(brief.salary_budget,brief.currency,Number(months))} over ${months} months`]);
      }
    }
  }
  if(brief.contract_months)facts.push(['Initial contract',`${brief.contract_months} months · ${brief.contract_guaranteed===true||brief.contract_guaranteed==='true'?'guaranteed term requested':brief.contract_guaranteed===false||brief.contract_guaranteed==='false'?'not guaranteed':'guarantee not established'}`]);
  if(brief.option_months)facts.push(['Extension option',`${brief.option_months} months · not guaranteed`]);
  const fee=amount(brief.transfer_budget,brief.currency);if(fee)facts.push(['Transfer fee budget',fee]);
  return facts;
}
