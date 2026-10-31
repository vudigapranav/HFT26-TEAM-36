// One shared easing curve keeps the screen and detached code synchronized.
window.fallingCodeTiming=Object.freeze({
 lineDelay:.075,releaseDuration:.38,growthDuration:1.55,fallSpeed:.56,
 maxFontDesktop:34,maxFontMobile:23,lineHeight:1.65,
 releaseProgress(travel,index,count){
  const p=Math.max(0,Math.min(1,(travel-.06-(count-1-index)*this.lineDelay)/this.releaseDuration));
  return p*p*p*(p*(p*6-15)+10);
 }
});
