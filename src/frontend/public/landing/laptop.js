// A small 3D laptop, drawn locally. The screen represents learning through projects.
(() => {
  const canvas = document.querySelector('#sculpture');
  const ctx = canvas.getContext('2d');
  let width = 600, height = 560, pointerX = 0, pointerY = 0, viewYaw = 0;
  let dragging = false, lastX = 0, visible = true, frame = 0, motionTime = 0;
  const LID_OPEN = .11, LID_CLOSED = -Math.PI / 2;
  const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
  let lidAngle = reduceMotion ? LID_OPEN : LID_CLOSED;
  const screen = document.createElement('canvas'); screen.width = 1280; screen.height = 876;
  const keyboard = document.createElement('canvas'); keyboard.width = 1280; keyboard.height = 894;
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
    const c=screen.getContext('2d');c.clearRect(0,0,1280,876);
    rect(c,0,0,1280,876,0,'#fbfbfd');
    rect(c,0,0,1280,34,0,'#f2f2f5');label(c,'',22,24,17,'#1d1d1f');label(c,'TorqueCode',48,23,14,'#1d1d1f',600);
    rect(c,0,34,1280,58,0,'#e8e8ed');rect(c,0,91,1280,1,0,'#d2d2d7');
    // Camera notch (M2 MacBook Pro): flush with the top bezel, rounded at the bottom.
    rect(c,560,0,160,20,0,'#0b0b0c');rect(c,560,6,160,26,10,'#0b0b0c');
    ['#ff5f57','#febc2e','#28c840'].forEach((color,i)=>{c.beginPath();c.fillStyle=color;c.arc(30+i*25,63,6,0,Math.PI*2);c.fill();});
    label(c,'torquecode — terminal',530,70,19,'#6e6e73');
    const travel=(window.codeScene?.y||0)/(window.codeScene?.viewport||innerHeight);
    const timing=window.fallingCodeTiming;
    sourceLines.forEach((text,i)=>{
      const release=timing.releaseProgress(travel,i,sourceLines.length);
      c.globalAlpha=1-release;
      c.font='30px Consolas,monospace';
      c.fillStyle=i%4===0?'#8e8e93':i%4===1?'#5e8fd0':i%4===2?'#a1a1a6':'#a77fd1';
      c.fillText(text,105,170+i*58);
    });
    c.globalAlpha=1;
    rect(c,0,842,1280,34,0,'#e8e8ed');label(c,'>_ JAVASCRIPT     /     CLAIMS INTO EVIDENCE',25,865,13,'#86868b');
  }
  function drawKeyboard() {
    const c=keyboard.getContext('2d'),W=1280,H=894;
    const finish=c.createLinearGradient(0,0,W,H);finish.addColorStop(0,'#eeeff1');finish.addColorStop(.5,'#d8dadd');finish.addColorStop(1,'#c2c5c9');c.fillStyle=finish;c.fillRect(0,0,W,H);
    c.globalAlpha=.06;for(let y=0;y<H;y+=2){c.fillStyle=y%4?'#ffffff':'#7d8086';c.fillRect(0,y,W,1);}c.globalAlpha=1;
    c.fillStyle='#6f727899';
    for(const x0 of [40,1166])for(let y=44;y<470;y+=9)for(let x=x0;x<x0+74;x+=9){c.beginPath();c.arc(x,y,1.7,0,Math.PI*2);c.fill();}
    const wellX=148,wellY=34,wellW=984,wellH=444,pad=10,gap=7;
    rect(c,wellX,wellY,wellW,wellH,16,'#141416');
    const rows=[
      [['esc',1.5],...'F1 F2 F3 F4 F5 F6 F7 F8 F9 F10 F11 F12'.split(' ').map(k=>[k,1]),['touchid',1]],
      [...'`1234567890-='.split('').map(k=>[k,1]),['delete',1.5]],
      [['tab',1.5],...'QWERTYUIOP[]\\'.split('').map(k=>[k,1])],
      [['caps lock',1.8],...'ASDFGHJKL;\''.split('').map(k=>[k,1]),['return',1.7]],
      [['shift',2.3],...'ZXCVBNM,./'.split('').map(k=>[k,1]),['shift',2.2]],
      [['fn',1],['control',1],['option',1],['command',1.25],['',5],['command',1.25],['option',1],['arrows',3]],
    ];
    const heights=[46,66,66,66,66,66],inner=wellW-pad*2;let y=wellY+pad;
    rows.forEach((row,r)=>{
      const units=row.reduce((sum,k)=>sum+k[1],0),unit=(inner-(row.length-1)*gap)/units,h=heights[r];let x=wellX+pad;
      row.forEach(([text,u])=>{
        const w=unit*u+(u>1?gap*(u-1)*0:0);
        if(text==='arrows'){
          const a=(w-2*gap)/3,half=(h-4)/2;
          rect(c,x,y+half+4,a,half,6,'#1d1d1f');label(c,'◀',x+a/2-6,y+h-8,11,'#d2d2d7');
          rect(c,x+a+gap,y,a,half,6,'#1d1d1f');label(c,'▲',x+a+gap+a/2-6,y+half-6,11,'#d2d2d7');
          rect(c,x+a+gap,y+half+4,a,half,6,'#1d1d1f');label(c,'▼',x+a+gap+a/2-6,y+h-8,11,'#d2d2d7');
          rect(c,x+2*(a+gap),y+half+4,a,half,6,'#1d1d1f');label(c,'▶',x+2*(a+gap)+a/2-6,y+h-8,11,'#d2d2d7');
        } else {
          rect(c,x,y,w,h,7,'#1d1d1f');
          if(text==='touchid'){c.strokeStyle='#3a3a3c';c.lineWidth=2;c.beginPath();c.roundRect(x+5,y+5,w-10,h-10,8);c.stroke();}
          else if(text)label(c,text,x+(text.length>1?9:w/2-5),y+(r===0?28:text.length>1?h-12:26),text.length>1?11:15,'#d2d2d7');
        }
        x+=w+gap;
      });
      y+=h+gap;
    });
    const pad2=c.createLinearGradient(0,512,0,850);pad2.addColorStop(0,'#e2e4e7');pad2.addColorStop(1,'#d2d4d8');
    rect(c,318,510,644,344,24,'#b4b7bc');c.fillStyle=pad2;c.beginPath();c.roundRect(321,513,638,338,22);c.fill();
    rect(c,560,878,160,8,4,'#b0b3b8');
  }
  drawScreen();drawKeyboard();

  function roundedPoints(x,y,w,h,r) {
    const points=[];
    [[x+w-r,y+r,-Math.PI/2],[x+w-r,y+h-r,0],[x+r,y+h-r,Math.PI/2],[x+r,y+r,Math.PI]].forEach(([cx,cy,start])=>{
      for(let i=0;i<=5;i++){const a=start+i/5*Math.PI/2;points.push([cx+Math.cos(a)*r,cy+Math.sin(a)*r]);}
    });return points;
  }
  const lidOutline=roundedPoints(-2.68,-3.04,5.36,3.79,.16);
  const deckOutline=roundedPoints(-2.68,-.46,5.36,3.79,.16);
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
    const easedFade=departure*departure*(3-2*departure); const casingOpacity=1-easedFade;
    const rx=-.23,ry=.07,rz=0;
    const size=Math.min(width*(width<400?.12:.1),height*.12);
    const bob=0;
    const transform=p=>rotate([p[0],p[1]+bob,p[2]],rx,ry,rz);
    project=p=>{const v=transform(p),f=12/(12-v[2]);return [width*.5+v[0]*size*f,height*.6+v[1]*size*f];};
    const lid=(x,y,depth)=>[x,.7+(y-.7)*Math.cos(lidAngle)-depth*Math.sin(lidAngle),-.4+(y-.7)*Math.sin(lidAngle)+depth*Math.cos(lidAngle)];
    const surfaces=[];
    const addFace=(points,fill,stroke,draw)=>surfaces.push({points,fill,stroke,draw,z:points.reduce((s,p)=>s+transform(p)[2],0)/points.length});
    const shell=(front,back,frontFill,backFill,edge)=>{
      addFace(back,backFill,edge);addFace(front,frontFill,edge);
      front.forEach((p,i)=>addFace([p,front[(i+1)%front.length],back[(i+1)%front.length],back[i]],edge));
    };
    const lidFront=lidOutline.map(([x,y])=>lid(x,y,.055)),lidBack=lidOutline.map(([x,y])=>lid(x,y,-.09));
    const lidMetal=ctx.createLinearGradient(width*.2,height*.05,width*.8,height*.6);lidMetal.addColorStop(0,'#e4e6e9');lidMetal.addColorStop(.45,'#f6f7f9');lidMetal.addColorStop(.55,'#d9dce0');lidMetal.addColorStop(1,'#b3b7bc');
    shell(lidFront,lidBack,'#0b0b0c',lidMetal,'#cfd1d4');
    const baseTop=deckOutline.map(([x,z])=>[x,.73,z]),baseBottom=deckOutline.map(([x,z])=>[x,.89,z]);
    const metal=ctx.createLinearGradient(width*.15,height*.5,width*.8,height*.9);metal.addColorStop(0,'#f7f8fa');metal.addColorStop(.3,'#dfe1e4');metal.addColorStop(.48,'#f3f4f6');metal.addColorStop(.75,'#c8cbcf');metal.addColorStop(1,'#a7abb0');
    shell(baseTop,baseBottom,metal,'#9ea1a6','#d6d8db');
    const displayQuad=[lid(-2.6,-2.98,.061),lid(2.6,-2.98,.061),lid(2.6,.6,.061),lid(-2.6,.6,.061)];
    const screenPoint=(u,v)=>project(displayQuad[0].map((n,i)=>(n*(1-u)+displayQuad[1][i]*u)*(1-v)+(displayQuad[3][i]*(1-u)+displayQuad[2][i]*u)*v));
    window.laptopCodeGeometry={width,height,points:sourceLines.map((_,i)=>screenPoint(105/1280,(170+i*58)/876)),fontSize:30/1280*(screenPoint(1,.5)[0]-screenPoint(0,.5)[0])};
    addFace(displayQuad,null,null,()=>texture(screen,displayQuad));
    const keysQuad=[[-2.6,.716,-.38],[2.6,.716,-.38],[2.6,.716,3.25],[-2.6,.716,3.25]];
    addFace(keysQuad,null,null,()=>texture(keyboard,keysQuad));
    const hinge=[[-2.23,.66,-.39],[2.23,.66,-.39],[2.23,.78,-.29],[-2.23,.78,-.29]];addFace(hinge,'#2c2c2e');
    // Camera lens and the thin display bezel remain attached to the moving lid.
    const camera=[lid(-.03,-2.995,.063),lid(.03,-2.995,.063),lid(.03,-2.955,.063),lid(-.03,-2.955,.063)];addFace(camera,'#1c1c1e');
    // The display wakes up as the lid turns towards the viewer (hidden while face-down).
    const screenOn=clamp((lidAngle+1.1)/.75,0,1);
    surfaces.sort((a,b)=>a.z-b.z).forEach(face=>{if(face.points===displayQuad&&screenOn<=0)return;ctx.globalAlpha=casingOpacity;if(face.draw){ctx.globalAlpha=face.points===displayQuad ? (1-easedFade)*screenOn : casingOpacity;face.draw();}else polygon(face.points,face.fill,face.stroke);});
    ctx.globalAlpha=1;
  }
  new ResizeObserver(entries=>{const r=entries[0].contentRect;width=r.width;height=r.height;const dpr=Math.min(devicePixelRatio||1,2);canvas.width=width*dpr;canvas.height=height*dpr;ctx.setTransform(dpr,0,0,dpr,0,0);render();}).observe(canvas);
  canvas.addEventListener('pointermove',event=>{const r=canvas.getBoundingClientRect();pointerX=(event.clientX-r.left)/r.width-.5;pointerY=(event.clientY-r.top)/r.height-.5;if(dragging){viewYaw=clamp(viewYaw+(event.clientX-lastX)*.004,-.35,.35);lastX=event.clientX;}if(reducedMotion)render();});
  canvas.addEventListener('pointerdown',event=>{if(event.pointerType==='touch')return;dragging=true;lastX=event.clientX;canvas.setPointerCapture(event.pointerId);});
  canvas.addEventListener('pointerup',()=>dragging=false);canvas.addEventListener('pointercancel',()=>dragging=false);
  canvas.addEventListener('pointerleave',()=>{if(!dragging){pointerX=0;pointerY=0;}});
  new IntersectionObserver(entries=>visible=entries[0].isIntersecting).observe(canvas);
  document.fonts.ready.then(()=>{drawScreen();render();});
  const title=document.querySelector('#hero-title');
  // Same duration and curve as the headline's fade-in (code-spiral.css), so they cross-fade in sync.
  const settle=()=>{canvas.style.transition='opacity .55s cubic-bezier(.22,1,.36,1)';canvas.style.opacity='.32';};
  if(reduceMotion){title?.classList.add('lid-intro-done');settle();}
  else{
    title?.classList.add('lid-intro');
    const start=performance.now()+80,duration=900;let shown=false;
    const open=now=>{const t=clamp((now-start)/duration,0,1),eased=1-Math.pow(1-t,3);lidAngle=LID_CLOSED+(LID_OPEN-LID_CLOSED)*eased;render();
      if(t>=.7&&!shown){shown=true;title?.classList.add('lid-intro-done');settle();}
      if(t<1)requestAnimationFrame(open);};
    requestAnimationFrame(open);
  }
  function animate(time){requestAnimationFrame(animate);if(visible&&window.portfolioMotion?.active!==false&&!document.hidden&&time-frame>15){frame=time;motionTime=time/1000;render();}}
  if(!reducedMotion)requestAnimationFrame(animate);
})();


