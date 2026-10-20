import {useState} from 'react';
import AgencyConnectionsDrawer from '@/components/AgencyConnectionsDrawer';
export default function Page(){
 const [workspace,setWorkspace]=useState('qa-providers');
 return <main><button onClick={()=>setWorkspace('other-workspace')}>Switch test workspace</button><AgencyConnectionsDrawer workspaceSlug={workspace} presentation="page" onClose={()=>{}} /></main>;
}
