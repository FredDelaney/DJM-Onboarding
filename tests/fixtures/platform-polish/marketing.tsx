import ReDreamPublicLanding from '@/components/ReDreamPublicLanding';
import Product from '@/app/(redream-public)/product/page';
import Security from '@/app/(redream-public)/security/page';
import Support from '@/app/(redream-public)/support/page';
import Switch from '@/app/(redream-public)/switch/page';
const pages={home:ReDreamPublicLanding,product:Product,security:Security,support:Support,switch:Switch};
export default async function MarketingFixture({searchParams}:{searchParams:Promise<{screen?:string}>}){
 const {screen='home'}=await searchParams;
 const Component=pages[screen as keyof typeof pages];
 return Component?<Component/>:<p>Unknown marketing fixture</p>;
}
