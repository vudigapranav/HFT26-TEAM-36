// Light/dark theme: an explicit choice is remembered per browser; otherwise the system preference is used.
export type Theme='light'|'dark';
const KEY='torque-theme';
export function initialTheme():Theme{
 try{const saved=localStorage.getItem(KEY);if(saved==='light'||saved==='dark')return saved;}catch{/* storage may be disabled */}
 return typeof matchMedia==='function'&&matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light';
}
export function applyTheme(theme:Theme,remember=false){
 document.documentElement.dataset.theme=theme;
 if(remember)try{localStorage.setItem(KEY,theme);}catch{/* storage may be disabled */}
}
