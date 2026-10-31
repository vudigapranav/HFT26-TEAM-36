(() => {
  if (reducedMotion) return;
  const root=document.documentElement;
  root.classList.add('journey-enabled','continuous-journey','code-journey');
  const $=selector=>document.querySelector(selector);
  const hero=$('.hero-shell'),heroStage=$('.hero-stage'),story=$('.interlude'),storyTitle=$('#interlude-title');
  const work=$('#work'),workStage=$('.work-stage'),track=$('.project-grid'),about=$('#about'),contact=$('#contact');
  const nav=$('.journey-nav'),cursor=$('.project-cursor'),cards=[...document.querySelectorAll('.project-card')];
  const steps=[...document.querySelectorAll('[data-work-step]')],lines=[...document.querySelectorAll('.hero-line')];
  const object=$('.sculpture-wrap');
  const slot=document.createElement('div');slot.className='sculpture-wrap sculpture-slot';slot.setAttribute('aria-hidden','true');
  object.before(slot);object.classList.add('flow-object');
  const objectLayer=document.createElement('div');objectLayer.className='flow-layer';objectLayer.append(object);document.body.append(objectLayer);
  const clamp=(v,a=0,b=1)=>Math.max(a,Math.min(b,v));
  const range=(value,start,end)=>clamp((value-start)/Math.max(.0001,end-start));
  const mix=(a,b,p)=>a+(b-a)*p;
  const smooth=p=>p*p*(3-2*p);
  const topOf=element=>element.getBoundingClientRect().top+scrollY;
  const set=(element,name,value)=>element.style.setProperty(name,value);
  let mobile=false,vh=innerHeight,vw=innerWidth,travel=0,duration=0,geometry={},shown=cards;
  let currentY=scrollY,targetY=scrollY,previousY=scrollY,velocity=0,frameId=0,lastTime=0;
  let activeProject=-1,activeChapter='',resizeTimer;
  window.portfolioMotion={velocity:0,active:true};

  function splitWords(parent) {
    [...parent.childNodes].forEach(node=>{
      if(node.nodeType===Node.TEXT_NODE){
        const fragment=document.createDocumentFragment();
        node.textContent.split(/(\s+)/).forEach(word=>{
          if(!word.trim()){fragment.append(document.createTextNode(word));return;}
          const span=document.createElement('span');span.className='reveal-word';span.textContent=word;fragment.append(span);
        });node.replaceWith(fragment);
      }else if(node.nodeType===Node.ELEMENT_NODE)splitWords(node);
    });
  }
  splitWords(storyTitle);
  const storyWords=[...storyTitle.querySelectorAll('.reveal-word')];
  $('#about-title').innerHTML='<span class="about-line">Claim it.</span><span class="about-line">Code it.</span><span class="about-line serif">Prove it.</span>';
  const aboutLines=[...document.querySelectorAll('.about-line')];
  const aboutParagraphs=[...document.querySelectorAll('.about-copy>p')];
  aboutParagraphs.forEach(splitWords);
  const aboutWords=aboutParagraphs.flatMap(p=>[...p.querySelectorAll('.reveal-word')]);
  const skills=[...document.querySelectorAll('.capabilities>div>span')];
  cards.forEach((card,index)=>card.style.zIndex=index+1);

  function refresh(resetWork=false) {
    mobile=matchMedia('(max-width:750px)').matches;vh=innerHeight;vw=innerWidth;
    shown=cards.filter(card=>!card.hidden);
    const style=getComputedStyle(workStage);
    const available=workStage.clientWidth-parseFloat(style.paddingLeft)-parseFloat(style.paddingRight);
    travel=mobile?0:Math.max(0,track.scrollWidth-available);
    // More scroll distance gives every module enough time to be read.
    duration=mobile?0:Math.round(travel*1.65);
    set(work,'--work-height',`${vh+duration}px`);
    const anchor=slot.getBoundingClientRect(),stage=heroStage.getBoundingClientRect();
    geometry={
      heroTop:topOf(hero),heroHeight:hero.offsetHeight,
      storyTop:topOf(story),storyHeight:story.offsetHeight,
      workTop:topOf(work),workHeight:work.offsetHeight,
      aboutTop:topOf(about),aboutHeight:about.offsetHeight,
      contactTop:topOf(contact),contactHeight:contact.offsetHeight,
      height:document.documentElement.scrollHeight-vh,
      objectWidth:anchor.width,objectHeight:anchor.height,
      objectX:anchor.left,objectY:anchor.top-stage.top,
      cardOffsets:shown.map(card=>card.offsetLeft),cardWidths:shown.map(card=>card.offsetWidth),available
    };
    set(object,'--object-width',`${anchor.width}px`);set(object,'--object-height',`${anchor.height}px`);
    steps.forEach(button=>button.hidden=!shown.some(card=>card.dataset.project===button.dataset.workStep));
    if(resetWork&&!mobile)window.scrollTo({top:geometry.workTop,behavior:'instant'});
    currentY=targetY=previousY=scrollY;activeProject=-1;update(currentY);wake();
  }

  // Matching tangents carry the object through the scene boundaries.
  function path(values,p) {
    const position=clamp(p)*(values.length-1),index=Math.min(values.length-2,Math.floor(position)),t=position-index;
    const a=values[Math.max(0,index-1)],b=values[index],c=values[index+1],d=values[Math.min(values.length-1,index+2)];
    return .5*((2*b)+(-a+c)*t+(2*a-5*b+4*c-d)*t*t+(-a+3*b-3*c+d)*t*t*t);
  }

  function update(y) {
    if(!geometry.objectWidth)return;
    const heroP=range(y,geometry.heroTop,geometry.heroTop+geometry.heroHeight);
    const heroLeave=range(y,geometry.heroTop+vh*.12,geometry.heroTop+vh*.98);
    const darkIn=smooth(range(y,geometry.heroTop+vh*.28,geometry.heroTop+vh*.95));
    const darkOut=smooth(range(y,geometry.workTop-vh*.52,geometry.workTop+vh*.1));
    const dark=darkIn*(1-darkOut);
    const color=`rgb(${mix(241,32,dark)},${mix(240,33,dark)},${mix(233,29,dark)})`;
    set(root,'--flow-background',color);
    set(root,'--flow-foreground',dark>.45?'#f1f0e9':'#20211d');
    heroStage.style.color=darkIn>.55?'#f1f0e9':'#20211d';
    lines.forEach((line,index)=>{
      set(line,'--line-x',`${heroLeave*(index===1?72:-90-index*28)*(mobile?.45:1)}px`);
      set(line,'--line-y',`${-heroP*(mobile?35:64)}px`);
      set(line,'--line-rotation',`${(index-1)*heroLeave*2.2}deg`);
      set(line,'--line-opacity',String(clamp(1-heroLeave*1.14)));
    });
    set(hero,'--hero-bottom-opacity',String(1-range(y,0,vh*.5)));
    set(hero,'--hero-bottom-y',`${-heroP*45}px`);
    set(hero,'--hero-meta-opacity',String(1-heroLeave));
    set(hero,'--hero-shift',String(heroLeave));

    // The laptop stays centered. Only code leaves its screen.
    const objectP=range(y,0,vh*1.5);
    const objectWidth=Math.min(vw*(mobile?1.28:.86),1100);
    const objectHeight=Math.min(vh*.95,820);
    set(object,'--object-width',`${objectWidth}px`);
    set(object,'--object-height',`${objectHeight}px`);
    set(object,'--object-x',`${(vw-objectWidth)/2}px`);
    set(object,'--object-y',`${vh*.5-objectHeight*.5}px`);
    set(object,'--object-scale','1');set(object,'--object-rotation','0deg');
    set(object,'--object-opacity','1');set(object,'--object-caption','0');
    object.style.pointerEvents='none';
    sculptureScroll=0;
    window.codeScene={y,departure:objectP,dark,velocity,viewport:vh,total:geometry.height};
    window.portfolioMotion.active=objectP<1;
    window.portfolioMotion.velocity=velocity;
    set(root,'--flow-skew',`${clamp(-velocity*.027,-1.1,1.1)}deg`);

    // Let the falling lines fade before the next headline comes into focus.
    const handoffPoint=geometry.storyTop-vh*.36;
    const codeClear=1-smooth(range(y,geometry.storyTop-vh*.66,handoffPoint));
    const storyReveal=smooth(range(y,handoffPoint-vh*.06,geometry.storyTop-vh*.12));
    set(root,'--code-handoff-opacity',String(codeClear));
    set(story,'--story-handoff-opacity',String(storyReveal));
    set(story,'--story-handoff-rise',`${(1-storyReveal)*40}px`);
    set(story,'--story-handoff-blur',`${(1-storyReveal)*5}px`);

    const storyP=range(y,geometry.storyTop-vh,geometry.storyTop+geometry.storyHeight*.78);
    set(story,'--story-x',`${mix(32,-32,storyP)}px`);
    set(story,'--story-y',`${mix(95,-115,storyP)}px`);
    set(story,'--story-scale',String(mix(.9,1.09,storyP)));
    set(story,'--story-footer-x',`${mix(18,-30,storyP)}px`);
    set(story,'--interlude-rotation',`${storyP*220-45}deg`);
    set(story,'--interlude-scale',String(.7+storyP*.8));
    storyWords.forEach((word,index)=>{
      const p=range(storyP,.03+index*.022,.3+index*.022);
      set(word,'--word-opacity',String(.6+p*.4));set(word,'--word-y',`${(1-p)*20}px`);
    });

    const workEntry=range(y,geometry.workTop-vh,geometry.workTop);
    const workExit=range(y,geometry.workTop+duration-vh*.25,geometry.workTop+duration+vh*.85);
    const workP=range(y,geometry.workTop-vh*.2,geometry.workTop+duration);
    const trackX=-travel*workP;
    set(work,'--work-x',`${trackX}px`);
    set(work,'--work-inset',`${(1-workEntry)*vw*.055}px`);
    set(work,'--work-radius',`${(1-workEntry)*70+workExit*25}px`);
    set(work,'--work-stage-y',`${(1-workEntry)*55-workExit*35}px`);
    set(work,'--work-title-x',`${workP*-32}px`);
    set(work,'--work-arrow',`${-45+workP*95}deg`);
    if(mobile){
      const tops=shown.map(card=>card.getBoundingClientRect().top);
      shown.forEach((card,index)=>{
        const covered=index<shown.length-1?clamp((vh*.7-tops[index+1])/(vh*.7-30)):0;
        const passing=range(tops[index],-vh*.2,vh);
        set(card,'--card-scale',String(1-covered*.065));set(card,'--card-y',`${-covered*10}px`);
        set(card,'--card-angle','0deg');set(card,'--image-y',`${mix(-12,12,passing)}px`);set(card,'--image-scale','1.08');set(card,'--caption-x',`${covered*-7}px`);
      });
    }else{
      shown.forEach((card,index)=>{
        const center=geometry.cardOffsets[index]+geometry.cardWidths[index]/2+trackX;
        const distance=(center-geometry.available*.5)/vw;
        set(card,'--card-y',`${Math.sin(distance)*23}px`);set(card,'--card-angle',`${clamp(-distance*10,-14,14)}deg`);
        set(card,'--card-scale',String(1-Math.min(Math.abs(distance),1)*.05));
        set(card,'--image-x',`${clamp(-distance*22,-35,35)}px`);set(card,'--image-scale',String(1.025+Math.min(Math.abs(distance),1)*.035));
        set(card,'--image-radius',`${3+Math.min(Math.abs(distance),1)*14}px`);set(card,'--caption-x',`${clamp(distance*-12,-20,20)}px`);
      });
    }
    const projectIndex=mobile?0:Math.min(shown.length-1,Math.round(workP*(shown.length-1)));
    if(projectIndex!==activeProject){
      activeProject=projectIndex;
      $('.work-counter').textContent=`${String(projectIndex+1).padStart(2,'0')} / ${String(shown.length).padStart(2,'0')}`;
      steps.forEach(button=>{const active=button.dataset.workStep===shown[projectIndex]?.dataset.project;button.classList.toggle('active',active);if(active)button.setAttribute('aria-current','step');else button.removeAttribute('aria-current');});
    }

    const aboutP=range(y,geometry.aboutTop-vh,geometry.aboutTop+geometry.aboutHeight*.9);
    set(about,'--about-radius',`${(1-range(y,geometry.aboutTop-vh,geometry.aboutTop))*65}px`);
    set(about,'--about-content-y',`${mix(55,-55,aboutP)}px`);
    set(about,'--about-art-y',`${mix(110,-100,aboutP)}px`);
    set(about,'--about-art-rotation',`${mix(-9,12,aboutP)}deg`);set(about,'--about-art-scale',String(mix(.94,1.06,aboutP)));
    set(about,'--about-star-rotation',`${aboutP*380}deg`);
    aboutLines.forEach((line,index)=>{const p=range(aboutP,.02+index*.065,.3+index*.065);set(line,'--about-line-y',`${(1-p)*70}px`);set(line,'--about-line-opacity',String(.25+p*.75));});
    aboutWords.forEach((word,index)=>{const p=range(aboutP,.13+index*.005,.37+index*.005);set(word,'--word-opacity',String(.35+p*.65));});
    skills.forEach((skill,index)=>{
      const p=range(aboutP,.3+index*.03,.75+index*.03);
      set(skill,'--skill-opacity',String(.35+p*.65));set(skill,'--skill-y',`${mix(30,-12,p)}px`);
      set(skill,'--skill-x',`${mix(index%2?30:-30,0,p)}px`);set(skill,'--skill-rotation',`${mix(index%2?5:-5,0,p)}deg`);
    });

    const contactP=range(y,geometry.contactTop-vh,geometry.contactTop+geometry.contactHeight*.7);
    const opening=smooth(range(contactP,0,.7));
    set(contact,'--contact-circle',`${opening*160}%`);set(contact,'--contact-inset',`${(1-opening)*35}px`);set(contact,'--contact-radius',`${(1-opening)*65}px`);
    set(contact,'--contact-title-y',`${mix(75,-40,contactP)}px`);set(contact,'--contact-title-x',`${mix(-20,15,contactP)}px`);
    set(contact,'--contact-opacity',String(.25+opening*.75));set(contact,'--contact-spacing',`${mix(-.09,-.055,contactP)}em`);
    set(contact,'--contact-arrow-rotation',`${mix(-65,18,contactP)}deg`);set(contact,'--contact-arrow-y',`${mix(40,-25,contactP)}px`);set(contact,'--contact-bottom-y',`${mix(25,-12,contactP)}px`);
    set(nav,'--nav-y',y>130?'0px':'85px');set(nav,'--page-progress',`${clamp(y/Math.max(1,geometry.height))*100}%`);
    const chapter=y>=geometry.contactTop-vh*.35?'contact':y>=geometry.aboutTop-vh*.3?'about':y>=geometry.workTop-vh*.3?'work':'home';
    if(chapter!==activeChapter){activeChapter=chapter;nav.querySelectorAll('a').forEach(link=>{const active=link.hash===`#${chapter}`;link.classList.toggle('active',active);if(active)link.setAttribute('aria-current','location');else link.removeAttribute('aria-current');});}
  }

  function tick(time){
    frameId=0;const dt=Math.min(40,lastTime?time-lastTime:16.7);lastTime=time;
    targetY=scrollY;previousY=currentY;
    const inCodeScene=currentY<geometry.storyTop&&targetY<geometry.storyTop;
    const inWorkScene=!mobile&&currentY>=geometry.workTop-vh&&targetY>=geometry.workTop-vh&&targetY<=geometry.workTop+duration;
    const response=inCodeScene?175:inWorkScene?160:75;
    const delta=(targetY-currentY)*(1-Math.exp(-dt/response));
    // Let a quick wheel flick unfold visibly instead of launching the lines.
    const maxStep=inCodeScene?vh*dt/650:Infinity;
    currentY+=Math.sign(delta)*Math.min(Math.abs(delta),maxStep);
    velocity=mix(velocity,(currentY-previousY)*16.7/dt,.25);update(currentY);
    if(Math.abs(targetY-currentY)>.12||Math.abs(velocity)>.05)frameId=requestAnimationFrame(tick);else{currentY=targetY;velocity=0;update(currentY);lastTime=0;}
  }
  function wake(){if(!frameId)frameId=requestAnimationFrame(tick);}
  addEventListener('scroll',wake,{passive:true});
  addEventListener('resize',()=>{clearTimeout(resizeTimer);resizeTimer=setTimeout(()=>refresh(),120);},{passive:true});
  document.fonts.ready.then(()=>refresh());addEventListener('load',()=>refresh(),{once:true});
  document.querySelectorAll('[data-filter]').forEach(button=>button.addEventListener('click',()=>requestAnimationFrame(()=>refresh(true))));
  function goToCard(card,behavior='smooth'){
    if(!card)return;
    const progress=clamp((card.offsetLeft-shown[0].offsetLeft)/Math.max(1,travel));
    const top=geometry.workTop-vh*.2+progress*(duration+vh*.2);
    window.scrollTo({top:Math.max(geometry.workTop,top),behavior});
  }
  steps.forEach(button=>button.addEventListener('click',()=>goToCard(shown.find(card=>card.dataset.project===button.dataset.workStep))));
  function hideCursor(){set(cursor,'--cursor-scale','0');set(cursor,'--cursor-opacity','0');}
  cards.forEach(card=>{
    card.addEventListener('focusin',()=>{if(mobile||dialog.open)return;const r=card.getBoundingClientRect();if(r.left<0||r.right>vw)goToCard(card,'instant');});
    card.addEventListener('pointerenter',event=>{if(event.pointerType==='mouse'&&!mobile&&!dialog.open){set(cursor,'--cursor-scale','1');set(cursor,'--cursor-opacity','1');}});
    card.addEventListener('pointermove',event=>{if(event.pointerType==='mouse'){set(cursor,'--cursor-x',`${event.clientX}px`);set(cursor,'--cursor-y',`${event.clientY}px`);}});
    card.addEventListener('pointerleave',hideCursor);card.addEventListener('click',hideCursor);
  });
  addEventListener('blur',hideCursor);refresh();
})();


