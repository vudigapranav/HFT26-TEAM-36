import {useEffect,useState} from 'react';
import {useNavigate} from 'react-router-dom';
import {api,Button,ErrorNotice,Icon,PageTitle,useApp} from '../lib';
import type {AssessmentState,AuthUser,FocusLane,PortfolioResponse} from '../types';
import {samplePortfolio} from '../demo-data.mjs';
export default function FinishPreview(){
 const model=useApp(),navigate=useNavigate(),[error,setError]=useState<unknown>(null),[stage,setStage]=useState('Opening the sample session…');
 useEffect(()=>{if(model.mode!=='demo')return;let active=true;
  async function prepare(){try{
   const auth=await api<{user:AuthUser}>('POST','/auth/login',{email:'alex@example.com',password:'PreviewOnly123!'});if(!active)return;model.setUser(auth.user);
   const existing=sessionStorage.getItem('torque-assessment-id');
   if(existing){try{const state=await api<AssessmentState>('GET',`/assessments/${existing}/status`);if(!active)return;if(state.status==='active'){model.setAssessment(state);navigate('/workspace?finish=1',{replace:true});return;}}catch{/* A missing sample session can be created below. */}}
   setStage('Preparing an example portfolio…');const portfolio=await api<PortfolioResponse>('POST','/portfolio',samplePortfolio);if(!active)return;model.setPortfolio(portfolio);
   const focus=await api<{focus_lane:FocusLane}>('POST','/onboarding-quiz',{answers:[]});if(!active)return;model.setFocus(focus.focus_lane);
   setStage('Opening the finish preview…');const state=await api<AssessmentState>('POST','/assessments',{});if(!active)return;model.setAssessment(state);navigate('/workspace?finish=1',{replace:true});
  }catch(e){if(active)setError(e);}}
  void prepare();return()=>{active=false};
 },[]);
 return <section className="page"><PageTitle eyebrow="INTERACTIVE FINISH PREVIEW" description="A sample-only walkthrough of finishing before the timer runs out. The confirmation opens directly so you can try it.">Finish early.<br/><em>See what happens.</em></PageTitle>{model.mode!=='demo'?<p className="lede">Switch to Interactive preview in the footer to try this demonstration. Live assessments remain unchanged.</p>:error?<><ErrorNotice error={error}/><Button onClick={()=>window.location.reload()}>Try again <Icon name="refresh"/></Button></>:<p className="lede" role="status"><span className="spinner" style={{marginRight:12}}/>{stage}</p>}</section>;
}
