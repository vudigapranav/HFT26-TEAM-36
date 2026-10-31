import {defineConfig,loadEnv,type Plugin} from 'vite';
import react from '@vitejs/plugin-react';
// Vite serves public files by exact URL; a public directory has no index fallback.
// Resolve the story directory before Vite's SPA fallback can return the React app.
const landingIndex:Plugin={name:'torquecode-landing-index',configureServer(server){server.middlewares.use((req,res,next)=>{const url=new URL(req.url||'/','http://localhost');if(url.pathname==='/landing/'||url.pathname==='/landing'){res.writeHead(302,{Location:'/landing/index.html'+url.search});res.end();return;}next();});},configurePreviewServer(server){server.middlewares.use((req,res,next)=>{const url=new URL(req.url||'/','http://localhost');if(url.pathname==='/landing/'||url.pathname==='/landing'){res.writeHead(302,{Location:'/landing/index.html'+url.search});res.end();return;}next();});}};
// The interactive preview (sample data) exists only on an explicit VITE_DEMO=1 dev server. Every build is live-only.
export default defineConfig(({command,mode})=>({define:{__DEMO_BUILD__:JSON.stringify(command==='serve'&&loadEnv(mode,process.cwd(),'VITE_').VITE_DEMO==='1')},plugins:[landingIndex,react()],server:{proxy:{'/api':{target:'http://127.0.0.1:3001',changeOrigin:false,rewrite:path=>path.replace(/^\/api/,'')}}},build:{chunkSizeWarningLimit:650}}));
