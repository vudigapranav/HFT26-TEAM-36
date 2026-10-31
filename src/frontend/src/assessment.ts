// Assessment lifecycle helpers shared by the start screen and the workspace (context §5; K10/K11 status shape).
import type {AssessmentState,Generation} from './types';

export const POLL_MS=2000;
export const RESYNC_MS=15000;
const BUSY:Generation['status'][]=['queued','generating','validating'];
export const generating=(state:AssessmentState)=>!!state.generation&&BUSY.includes(state.generation.status);
export const failed=(state:AssessmentState)=>state.generation?.status==='failed';
// Questions may be fetched only once validation has released them (or for assessments without a generation job).
export const releasable=(state:AssessmentState)=>!state.generation||state.generation.status==='ready';
// The assessment UI never names a level; backend receipt text could, so it is neutralised before display.
export const neutral=(text:string)=>text.replace(/\b(novice|adept|master)\b/gi,'question set');
export const STAGES:Record<Generation['status'],string>={
 queued:'Waiting for a generation slot',generating:'Preparing your questions',validating:'Checking every question against independent tests',
 ready:'Ready',failed:'Could not verify a question set',
};
export const SOURCES:Record<NonNullable<Generation['source']>,string>={
 generated:'Generated for your portfolio from reviewed task families',seed_bank:'From the reviewed question bank',
};
