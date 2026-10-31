import {defineConfig,type Plugin} from 'vite';
import react from '@vitejs/plugin-react';
// Vite serves public files by exact URL; a public directory has no index fallback.
// Resolve the story directory before Vite's SPA fallback can return the React app.
const landingIndex:Plugin={name:'torquecode-landing-index',configureServer(server){server.middlewares.use((req,res,next)=>{const url=new URL(req.url||'/','http://localhost');if(url.pathname==='/landing/'||url.pathname==='/landing'){res.writeHead(302,{Location:'/landing/index.html'+url.search});res.end();return;}next();});},configurePreviewServer(server){server.middlewares.use((req,res,next)=>{const url=new URL(req.url||'/','http://localhost');if(url.pathname==='/landing/'||url.pathname==='/landing'){res.writeHead(302,{Location:'/landing/index.html'+url.search});res.end();return;}next();});}};
export default defineConfig({plugins:[landingIndex,react()],server:{proxy:{'/api':{target:'http://127.0.0.1:3001',changeOrigin:false,rewrite:path=>path.replace(/^\/api/,'')}}},build:{chunkSizeWarningLimit:650}});
