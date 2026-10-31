// Ordered code unfolds from the bottom of the stationary screen.
(() => {
 if(reducedMotion)return;
 const layer=document.createElement('canvas');layer.className='code-background';layer.setAttribute('aria-hidden','true');document.body.append(layer);
 const ctx=layer.getContext('2d'),laptop=document.querySelector('#sculpture');
 let w=innerWidth,h=innerHeight,lastY=-1,lastDark=-1;
 const clamp=n=>Math.max(0,Math.min(1,n)),mix=(a,b,p)=>a+(b-a)*p;
 const ease=value=>{const p=clamp(value);return p*p*p*(p*(p*6-15)+10);};
 function resize(){w=innerWidth;h=innerHeight;const dpr=Math.min(devicePixelRatio||1,1.7);layer.width=w*dpr;layer.height=h*dpr;ctx.setTransform(dpr,0,0,dpr,0,0);lastY=-1;}
 addEventListener('resize',resize,{passive:true});resize();
 function draw(){
  const state=window.codeScene,geometry=window.laptopCodeGeometry,source=window.portfolioCode;
  if(!state||!geometry||!source)return;
  if(Math.abs(lastY-state.y)<.015&&lastDark===state.dark)return;
  lastY=state.y;lastDark=state.dark;ctx.clearRect(0,0,w,h);
  const bounds=laptop.getBoundingClientRect(),travel=state.y/h,timing=window.fallingCodeTiming;
  const sourceSize=Math.max(5,geometry.fontSize*bounds.width/geometry.width);
  const longest=Math.max(...source.map(text=>text.length));
  const maxSize=Math.min(w<600?timing.maxFontMobile:timing.maxFontDesktop,w*.84/(longest*.61));
  const light=[[47,97,64],[61,103,82],[81,109,57]],dark=[[181,222,179],[148,201,170],[206,228,191]];
  const lines=[];
  source.forEach((text,i)=>{
   if(!text.trim())return;
   const age=Math.max(0,travel-.06-(source.length-1-i)*timing.lineDelay);
   const release=timing.releaseProgress(travel,i,source.length);
   if(release<=0)return;
   const point=geometry.points[i],sx=bounds.left+point[0]*bounds.width/geometry.width,sy=bounds.top+point[1]*bounds.height/geometry.height;
   const growth=ease(age/timing.growthDuration),size=mix(sourceSize,maxSize,growth);
   const destination=(w-longest*size*.6)/2;
   const x=mix(sx,destination,growth)+Math.sin(Math.PI*growth)*w*.016;
   const y=sy+ease(age/1.65)*h*timing.fallSpeed+i*(size-sourceSize)*.95;
   const alpha=release*mix(.62,.5,growth)*(1-ease((y-h*.86)/(h*.26)));
   if(alpha<=0||y>h+size)return;
   const color=light[i%3].map((c,j)=>Math.round(mix(c,dark[i%3][j],state.dark)));
   ctx.font=size+'px Consolas,ui-monospace,monospace';
   ctx.fillStyle='rgba('+color.join(',')+','+alpha+')';ctx.fillText(text,x,y);
   lines.push({index:i,x,y,size,alpha});
  });
  layer.dataset.phase=travel===0?'on-screen':'unfolding-lines';layer.dataset.visibleLines=String(lines.length);window.fallingCodeLines=lines;
 }
 function animate(){requestAnimationFrame(animate);if(!document.hidden)draw();}
 requestAnimationFrame(animate);
})();

