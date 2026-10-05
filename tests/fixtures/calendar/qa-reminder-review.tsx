import AgencyActionDrawer from '@/components/AgencyActionDrawer';
const invoke = async () => ({proposal:{proposal_id:'qa-copy-review',action_type:'consolidate_duplicate_tasks',approval_mode:'review_only',executable:false,rationale:'Automatic consolidation stays disabled until task-merging semantics are explicitly approved.',payload:{tasks:[{task_id:'first'},{task_id:'second'}]}}});
export default function Page() {
  return <AgencyActionDrawer request={{key:'copies',eyebrow:'Follow-up',title:'Call the club (2 open copies)',instruction:'Complete the real follow-up, then close or merge the duplicate task records.',label:'Review',action:'action_prepare',payload:{command_id:'task:first'},fallbackHref:'/agency?view=calendar',fallbackLabel:'Open calendar'}} invoke={invoke} onClose={()=>{}} onApplied={()=>{}}/>;
}
