import '@/app/globals.css';
import '@/app/admin-polish.css';
import '@/app/player-21.css';
import '@/app/dossier.css';
import '@/app/club-share.css';
import '@/app/profile-21.css';
import '@/app/ux-smooth.css';
import '@/app/player-premium.css';
import '@/app/player-nav-contrast-fix.css';
import '@/app/(djm-os)/djm-os.css';
import '@/app/product.css';
import { Inter } from 'next/font/google';
const font = Inter({subsets:['latin'],display:'swap',variable:'--font-redream-inter'});
import type {AppProps} from 'next/app';
export default function App({Component,pageProps}:AppProps){return <div className={font.variable} style={{fontFamily:'var(--font-redream-inter), sans-serif'}}><Component {...pageProps}/></div>;}
