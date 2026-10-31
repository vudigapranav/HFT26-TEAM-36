// A small 3D laptop, drawn locally. The screen represents learning through projects.
(() => {
  const canvas = document.querySelector('#sculpture');
  const ctx = canvas.getContext('2d');
  let width = 600, height = 560, pointerX = 0, pointerY = 0, viewYaw = 0;
  let dragging = false, lastX = 0, visible = true, frame = 0, motionTime = 0;
  const screen = document.createElement('canvas'); screen.width = 1280; screen.height = 800;
  const keyboard = document.createElement('canvas'); keyboard.width = 1280; keyboard.height = 660;
  const clamp = (n,a,b) => Math.max(a,Math.min(b,n));
  function rect(c,x,y,w,h,r,fill) { c.fillStyle=fill;c.beginPath();c.roundRect(x,y,w,h,r);c.fill(); }
  function label(c,text,x,y,size=20,color='#252922',weight=400) {c.font=`${weight} ${size}px Arial,sans-serif`;c.fillStyle=color;c.fillText(text,x,y);}

  const sourceLines = [
  "const assessment = {",
  "  portfolio: \"your claimed skills\",",
  "  session: \"60 minutes\",",
  "  grading: \"deterministic tests\"",
  "};",
  "async function assess(code) {",
  "  return runInSandbox(code);",
  "}"
];
  window.portfolioCode = sourceLines;
  function drawScreen() {
    const c=screen.getContext('2d');c.clearRect(0,0,1280,800);
    rect(c,0,0,1280,800,0,'#101d17');
    rect(c,0,0,1280,64,0,'#213128');
    ['#ef724f','#ceb776','#93a785'].forEach((color,i)=>{c.beginPath();c.fillStyle=color;c.arc(30+i*25,32,6,0,Math.PI*2);c.fill();});
    label(c,'torquecode — terminal',530,40,19,'#b9d2bb');
    const travel=(window.codeScene?.y||0)/(window.codeScene?.viewport||innerHeight);
    const timing=window.fallingCodeTiming;
    sourceLines.forEach((text,i)=>{
      const release=timing.releaseProgress(travel,i,sourceLines.length);
      c.globalAlpha=1-release;
      c.font='30px Consolas,monospace';
      c.fillStyle=i===20?'#7a9c82':i%4===0?'#c7dfb0':i%4===1?'#99c3a1':i%4===2?'#a6c8b3':'#7cba9f';
      c.fillText(text,105,150+i*58);
    });
    c.globalAlpha=1;
    rect(c,0,766,1280,34,0,'#213b2d');label(c,'>_ JAVASCRIPT     /     CLAIMS INTO EVIDENCE',25,789,13,'#b5d6ab');
  }
  function drawKeyboard() {
    const c=keyboard.getContext('2d');
    const finish=c.createLinearGradient(0,0,1280,660);finish.addColorStop(0,'#e3e5dd');finish.addColorStop(.5,'#c9cdc2');finish.addColorStop(1,'#b6bcaf');c.fillStyle=finish;c.fillRect(0,0,1280,660);
    rect(c,72,44,1136,354,18,'#8a9281');
    const rows=['1234567890−+','QWERTYUIOP[]','ASDFGHJKL;\'','ZXCVBNM,./'];
    rows.forEach((row,i)=>{
      const x=93+i*17, y=62+i*68, keyWidth=(1085-i*32)/row.length;
      [...row].forEach((letter,j)=>{rect(c,x+j*keyWidth,y,keyWidth-8,57,8,'#31392d');label(c,letter,x+j*keyWidth+12,y+23,14,'#e1e6d7');});
    });
    rect(c,96,336,130,44,7,'#343b2f');rect(c,235,336,136,44,7,'#343b2f');rect(c,381,336,512,44,7,'#343b2f');rect(c,903,336,133,44,7,'#343b2f');rect(c,1046,336,142,44,7,'#ed673a');label(c,'↵',1100,364,23,'#fff3dd');
    rect(c,414,437,451,166,14,'#a8b09e');rect(c,417,439,445,161,12,'#c5cbbb');
    for(let i=0;i<20;i++){c.fillStyle='#7c867199';c.fillRect(26,65+i*14,21,3);c.fillRect(1233,65+i*14,21,3);}
  }
  drawScreen();drawKeyboard();

  function roundedPoints(x,y,w,h,r) {
    const points=[];
    [[x+w-r,y+r,-Math.PI/2],[x+w-r,y+h-r,0],[x+r,y+h-r,Math.PI/2],[x+r,y+r,Math.PI]].forEach(([cx,cy,start])=>{
      for(let i=0;i<=5;i++){const a=start+i/5*Math.PI/2;points.push([cx+Math.cos(a)*r,cy+Math.sin(a)*r]);}
    });return points;
  }
  const lidOutline=roundedPoints(-2.68,-2.82,5.36,3.57,.13);
  const deckOutline=roundedPoints(-2.87,-.46,5.74,2.98,.14);
  function rotate([x,y,z],rx,ry,rz) {
    const yy=y*Math.cos(rx)-z*Math.sin(rx);z=y*Math.sin(rx)+z*Math.cos(rx);y=yy;
    const xx=x*Math.cos(ry)+z*Math.sin(ry);z=-x*Math.sin(ry)+z*Math.cos(ry);x=xx;
    return [x*Math.cos(rz)-y*Math.sin(rz),x*Math.sin(rz)+y*Math.cos(rz),z];
  }
  let project;
  function polygon(points,fill,stroke) {
    const p=points.map(project);ctx.beginPath();p.forEach((v,i)=>i?ctx.lineTo(v[0],v[1]):ctx.moveTo(v[0],v[1]));ctx.closePath();ctx.fillStyle=fill;ctx.fill();if(stroke){ctx.strokeStyle=stroke;ctx.lineWidth=.7;ctx.stroke();}
  }
  function textureTriangle(img,src,dst) {
    const [s0,s1,s2]=src,[d0,d1,d2]=dst;
    const det=s0[0]*(s1[1]-s2[1])+s1[0]*(s2[1]-s0[1])+s2[0]*(s0[1]-s1[1]);
    if(Math.abs(det)<.001)return;
    const a=(d0[0]*(s1[1]-s2[1])+d1[0]*(s2[1]-s0[1])+d2[0]*(s0[1]-s1[1]))/det;
    const b=(d0[1]*(s1[1]-s2[1])+d1[1]*(s2[1]-s0[1])+d2[1]*(s0[1]-s1[1]))/det;
    const c=(d0[0]*(s2[0]-s1[0])+d1[0]*(s0[0]-s2[0])+d2[0]*(s1[0]-s0[0]))/det;
    const d=(d0[1]*(s2[0]-s1[0])+d1[1]*(s0[0]-s2[0])+d2[1]*(s1[0]-s0[0]))/det;
    const e=(d0[0]*(s1[0]*s2[1]-s2[0]*s1[1])+d1[0]*(s2[0]*s0[1]-s0[0]*s2[1])+d2[0]*(s0[0]*s1[1]-s1[0]*s0[1]))/det;
    const f=(d0[1]*(s1[0]*s2[1]-s2[0]*s1[1])+d1[1]*(s2[0]*s0[1]-s0[0]*s2[1])+d2[1]*(s0[0]*s1[1]-s1[0]*s0[1]))/det;
    // Overlap triangle clips slightly to avoid antialiasing seams on the display.
    const center=[dst.reduce((s,p)=>s+p[0],0)/3,dst.reduce((s,p)=>s+p[1],0)/3];
    const expanded=dst.map(p=>{const distance=Math.hypot(p[0]-center[0],p[1]-center[1]);return [p[0]+(p[0]-center[0])/distance*.7,p[1]+(p[1]-center[1])/distance*.7];});
    ctx.save();ctx.beginPath();expanded.forEach((v,i)=>i?ctx.lineTo(...v):ctx.moveTo(...v));ctx.closePath();ctx.clip();ctx.transform(a,b,c,d,e,f);ctx.drawImage(img,0,0);ctx.restore();
  }
  function texture(img,quad) {
    const cols=8,rows=6;
    const point=(u,v)=>project(quad[0].map((n,i)=>(n*(1-u)+quad[1][i]*u)*(1-v)+(quad[3][i]*(1-u)+quad[2][i]*u)*v));
    for(let y=0;y<rows;y++)for(let x=0;x<cols;x++){
      const u=x/cols,v=y/rows,uu=(x+1)/cols,vv=(y+1)/rows;
      const dst=[point(u,v),point(uu,v),point(uu,vv),point(u,vv)];
      const src=[[u*img.width,v*img.height],[uu*img.width,v*img.height],[uu*img.width,vv*img.height],[u*img.width,vv*img.height]];
      textureTriangle(img,[src[0],src[1],src[2]],[dst[0],dst[1],dst[2]]);textureTriangle(img,[src[0],src[2],src[3]],[dst[0],dst[2],dst[3]]);
    }
  }
  function render() {
    ctx.clearRect(0,0,width,height);
    drawScreen();
    const departure=window.codeScene?.departure||0;
    const easedFade=departure*departure*(3-2*departure); const casingOpacity=.38*(1-easedFade);
    const rx=-.23,ry=.07,rz=0;
    const size=Math.min(width*(width<400?.15:.127),height*.155);
    const bob=0;
    const transform=p=>rotate([p[0],p[1]+bob,p[2]],rx,ry,rz);
    project=p=>{const v=transform(p),f=12/(12-v[2]);return [width*.5+v[0]*size*f,height*.56+v[1]*size*f];};
    const lidAngle=.11;
    const lid=(x,y,depth)=>[x,.7+(y-.7)*Math.cos(lidAngle),-.4+(y-.7)*Math.sin(lidAngle)+depth];
    const surfaces=[];
    const addFace=(points,fill,stroke,draw)=>surfaces.push({points,fill,stroke,draw,z:points.reduce((s,p)=>s+transform(p)[2],0)/points.length});
    const shell=(front,back,frontFill,backFill,edge)=>{
      addFace(back,backFill,edge);addFace(front,frontFill,edge);
      front.forEach((p,i)=>addFace([p,front[(i+1)%front.length],back[(i+1)%front.length],back[i]],edge));
    };
    const lidFront=lidOutline.map(([x,y])=>lid(x,y,.055)),lidBack=lidOutline.map(([x,y])=>lid(x,y,-.09));
    shell(lidFront,lidBack,'#20271f','#d45530','#bfc4b7');
    const baseTop=deckOutline.map(([x,z])=>[x,.73,z]),baseBottom=deckOutline.map(([x,z])=>[x,.89,z]);
    const metal=ctx.createLinearGradient(width*.15,height*.5,width*.8,height*.9);metal.addColorStop(0,'#f1f1e9');metal.addColorStop(.6,'#c7ccbf');metal.addColorStop(1,'#9fa994');
    shell(baseTop,baseBottom,metal,'#7f8978','#b1baa7');
    const displayQuad=[lid(-2.5,-2.6,.061),lid(2.5,-2.6,.061),lid(2.5,.5,.061),lid(-2.5,.5,.061)];
    const screenPoint=(u,v)=>project(displayQuad[0].map((n,i)=>(n*(1-u)+displayQuad[1][i]*u)*(1-v)+(displayQuad[3][i]*(1-u)+displayQuad[2][i]*u)*v));
    window.laptopCodeGeometry={width,height,points:sourceLines.map((_,i)=>screenPoint(105/1280,(150+i*58)/800)),fontSize:30/1280*(screenPoint(1,.5)[0]-screenPoint(0,.5)[0])};
    addFace(displayQuad,null,null,()=>texture(screen,displayQuad));
    const keysQuad=[[-2.7,.716,-.21],[2.7,.716,-.21],[2.7,.716,2.34],[-2.7,.716,2.34]];
    addFace(keysQuad,null,null,()=>texture(keyboard,keysQuad));
    const hinge=[[-2.23,.66,-.39],[2.23,.66,-.39],[2.23,.78,-.29],[-2.23,.78,-.29]];addFace(hinge,'#59624e');
    // Camera lens and the thin display bezel remain attached to the moving lid.
    const camera=[lid(-.025,-2.735,.063),lid(.025,-2.735,.063),lid(.025,-2.685,.063),lid(-.025,-2.685,.063)];addFace(camera,'#596450');
    surfaces.sort((a,b)=>a.z-b.z).forEach(face=>{ctx.globalAlpha=casingOpacity;if(face.draw){ctx.globalAlpha=face.points===displayQuad ? .58*(1-easedFade) : casingOpacity;face.draw();}else polygon(face.points,face.fill,face.stroke);});
    ctx.globalAlpha=1;
  }
  new ResizeObserver(entries=>{const r=entries[0].contentRect;width=r.width;height=r.height;const dpr=Math.min(devicePixelRatio||1,2);canvas.width=width*dpr;canvas.height=height*dpr;ctx.setTransform(dpr,0,0,dpr,0,0);render();}).observe(canvas);
  canvas.addEventListener('pointermove',event=>{const r=canvas.getBoundingClientRect();pointerX=(event.clientX-r.left)/r.width-.5;pointerY=(event.clientY-r.top)/r.height-.5;if(dragging){viewYaw=clamp(viewYaw+(event.clientX-lastX)*.004,-.35,.35);lastX=event.clientX;}if(reducedMotion)render();});
  canvas.addEventListener('pointerdown',event=>{if(event.pointerType==='touch')return;dragging=true;lastX=event.clientX;canvas.setPointerCapture(event.pointerId);});
  canvas.addEventListener('pointerup',()=>dragging=false);canvas.addEventListener('pointercancel',()=>dragging=false);
  canvas.addEventListener('pointerleave',()=>{if(!dragging){pointerX=0;pointerY=0;}});
  new IntersectionObserver(entries=>visible=entries[0].isIntersecting).observe(canvas);
  document.fonts.ready.then(()=>{drawScreen();render();});
  function animate(time){requestAnimationFrame(animate);if(visible&&window.portfolioMotion?.active!==false&&!document.hidden&&time-frame>15){frame=time;motionTime=time/1000;render();}}
  if(!reducedMotion)requestAnimationFrame(animate);
})();


