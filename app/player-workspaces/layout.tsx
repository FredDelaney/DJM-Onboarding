import type { Metadata } from 'next';
import type { ReactNode } from 'react';
export const metadata: Metadata={title:'Your player workspaces',robots:{index:false,follow:false},alternates:{canonical:'/player-workspaces'}};
export default function Layout({children}:{children:ReactNode}){return children;}
