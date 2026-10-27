import {readWithDeadline} from './read-with-deadline.ts';

// Share one deadline between the preferred read and its compatibility fallback.
// A late preferred response cannot replace the fallback or poison the view cache.
export async function readHomePosition<T>(
 preferred:()=>Promise<{home?:T}>,fallback:()=>Promise<T>,budgetMs=12000,
):Promise<T>{
 const started=performance.now();
 try{
  const result=await readWithDeadline(preferred(),Math.min(3000,budgetMs/4));
  if(!result?.home||typeof result.home!=='object'||Array.isArray(result.home))throw new Error('Home response unavailable');
  return result.home;
 }catch{
  const remaining=budgetMs-(performance.now()-started);
  if(remaining<=0)throw new Error('The request took too long. Please try again.');
  const result=await readWithDeadline(fallback(),remaining);
  if(!result||typeof result!=='object'||Array.isArray(result))throw new Error('We could not confirm your agency position. Please try again.');
  return result;
 }
}
