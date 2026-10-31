// Maps backend error codes (src/backend/api) to candidate-facing text. The backend's own message is a generic
// "Request rejected", so every code the UI can meet needs its own sentence. Unknown codes fall back by status.
export interface Problem extends Error {code?:string;status?:number;fields?:{path:string;message:string}[];retry_after?:number|null}

const MESSAGES:Record<string,string>={
 // Auth (K2)
 INVALID_CREDENTIALS:'That email and password don’t match. Check them and try again.',
 UNAUTHENTICATED:'Your session has ended. Sign in again to continue.',
 ACCOUNT_EXISTS:'An account with this email already exists. Sign in instead.',
 ORIGIN_REJECTED:'This page isn’t allowed to talk to the backend. The backend’s AUTH_ORIGIN must match this site’s address.',
 // Intake + quiz
 INVALID_PORTFOLIO:'Please fix the highlighted portfolio fields.',
 PORTFOLIO_REQUIRED:'Upload and validate your portfolio first.',
 INVALID_QUIZ_ANSWER:'Choose one of the offered answers for each question.',
 SEED_TOPIC_UNAVAILABLE:'Your portfolio doesn’t claim arrays, so no question can be served yet. Add "arrays" to dsa_topics_solved (only if you’ve practised it) and validate again.',
 // Assessment lifecycle (K3/K10/K11)
 ASSESSMENT_ACTIVE:'You already have an active assessment.',
 ASSESSMENT_GENERATING:'Your questions are still being prepared and checked.',
 ASSESSMENT_FINISHED:'This assessment has finished. Open your report.',
 TASK_VALIDATION_FAILED:'We couldn’t verify a question set for you, so no questions were released and nothing was graded. Please try again later.',
 TASK_LOCKED:'That question isn’t available yet.',
 UNLOCK_NOT_AVAILABLE:'Submit every question in this set before unlocking the next one.',
 INVALID_FILES:'Only this question’s editable files can be saved.',
 INVALID_TASK:'That activity belongs to a question that isn’t open.',
 NOT_FOUND:'We couldn’t find that. It may belong to another account or no longer exist.',
 // Running code (R2/R3)
 SANDBOX_UNAVAILABLE:'The code runner is temporarily unavailable. Your work is saved and no grade was recorded.',
 EXECUTION_IN_PROGRESS:'Your previous run is still in progress. Wait for it to finish.',
 RUNNER_BUSY:'The code runner is busy right now.',
 RUN_RATE_LIMIT:'You’re running code faster than allowed.',
 RUN_LIMIT:'You’ve reached the run limit for this assessment.',
 // Assistance (R5/K10)
 ASSISTANCE_DISABLED:'Hints and the assistant aren’t available for this question.',
 LLM_UNAVAILABLE:'The assistant is unavailable right now. You can keep coding.',
 HINTS_EXHAUSTED:'You’ve used every hint for this question.',
 HINT_IN_PROGRESS:'Your previous hint is still on its way.',
 ASSISTANT_IN_PROGRESS:'The assistant is still answering your last message.',
 ASSISTANT_LIMIT:'You’ve reached the assistant limit for this question.',
 EVENT_LIMIT:'Activity logging is paused for this assessment.',
 // Storage + transport
 PERSISTENCE_UNAVAILABLE:'Saving is temporarily unavailable on the server. Please try again shortly.',
 STORE_CAPACITY:'The service is at capacity. Please try again shortly.',
 RATE_LIMITED:'Too many attempts.',
 AUTH_BUSY:'The sign-in service is busy.',
 NETWORK_ERROR:'The backend could not be reached. Check your connection, then try again.',
 INVALID_RESPONSE:'The backend returned an unexpected response. Please try again.',
};

export function message(error:unknown):string{
 const e=(error||{}) as Problem;
 let text=MESSAGES[e.code||'']??(e.code?statusText(e.status):e.message)??statusText(e.status);
 if(e.status===429){
  const wait=e.retry_after&&e.retry_after>0?`Try again in ${e.retry_after} second${e.retry_after===1?'':'s'}.`:'Please wait a moment and try again.';
  text=`${text} ${wait}`;
 }
 return text||'Something went wrong. Please try again.';
}
function statusText(status?:number){
 if(status===401)return MESSAGES.UNAUTHENTICATED;
 if(status===429)return 'Too many requests.';
 if(status&&status>=500)return 'The service had a problem. Please try again.';
 return 'Something went wrong. Please try again.';
}
