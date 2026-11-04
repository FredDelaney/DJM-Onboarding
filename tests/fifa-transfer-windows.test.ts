import assert from 'node:assert/strict';
import {test} from 'node:test';
import {parseFifaTransferWindows} from '../lib/fifa-transfer-windows.ts';

test('FIFA timeline keeps valid registration periods by association and category',()=>{
 const event={itemType:'event',startDate:'2026-12-01T00:00:00',endDate:'2027-01-22T00:00:00'};
 const html='<script id="__NEXT_DATA__" type="application/json">'+JSON.stringify({props:{data:[{
   associationId:'NZL',country:'New Zealand',flagUrl:'https://other.example/flag',data:[
    {type:"Men's professional",timelineItems:[event,event,{...event,itemType:'season'},{...event,startDate:'2026-11-31'}]},
    {type:'Amateur',timelineItems:[{...event,startDate:'2026-12-08'}]},
   ],
 }]}})+'</script>';
 const [row]=parseFifaTransferWindows(html);
 assert.equal(row.flag,'https://api.fifa.com/api/v3/picture/flags-sq-5/NZL');
 assert.deepEqual(row.windows["Men's professional"],[{start:'2026-12-01',end:'2027-01-22'}]);
 assert.deepEqual(row.windows.Amateur,[{start:'2026-12-08',end:'2027-01-22'}]);
 assert.throws(()=>parseFifaTransferWindows('<html></html>'));
});
