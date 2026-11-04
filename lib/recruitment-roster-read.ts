import {friendlyError} from './platform-client';
import {readWithDeadline} from './read-with-deadline';

export async function readRecruitmentRoster(invoke:<T,>(action:string,body?:Record<string,unknown>)=>Promise<T>) {
  try {
    const response=await readWithDeadline(invoke<any>('recruitment_board',{limit:500}));
    if (!Array.isArray(response?.recruitment?.items)) throw new Error('Recruitment unavailable');
    return {recruitment:response.recruitment,recruitment_error:null};
  } catch(error) {
    return {recruitment:{items:[]},recruitment_error:friendlyError(error)};
  }
}
