import type { MetadataRoute } from 'next';
export default function manifest():MetadataRoute.Manifest{return {
  name:'DJM Player',short_name:'DJM Player',description:'Private career app by DJM Sports Management',
  start_url:'/home',scope:'/',display:'standalone',orientation:'portrait-primary',
  background_color:'#f5f5f7',theme_color:'#061f3a',
  categories:['sports','business'],
  icons:[
    {src:'/icon-192.png',sizes:'192x192',type:'image/png',purpose:'any'},
    {src:'/icon-512.png',sizes:'512x512',type:'image/png',purpose:'any'},
    {src:'/icon-maskable-512.png',sizes:'512x512',type:'image/png',purpose:'maskable'}
  ]
}}
