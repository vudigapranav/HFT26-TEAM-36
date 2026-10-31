// One shared import of the Monaco chunk. The workspace renders it through React.lazy; the start screen calls it
// while questions are being prepared, so the ~950 kB (gzip) editor is already cached when the workspace opens.
let pending:ReturnType<typeof load>|null=null;
function load(){return import('./components/CodeEditor');}
export function loadEditor(){
 if(!pending)pending=load().catch(error=>{pending=null;throw error;});
 return pending;
}
// Fire-and-forget warm-up: a failed prefetch is retried by the workspace's own lazy import.
export function preloadEditor(){void loadEditor().catch(()=>{});}
