import {useEffect,useState,type FormEvent} from 'react';
import {Link,useLocation,useNavigate} from 'react-router-dom';
import type {AuthUser} from '../types';
import {api,Button,ErrorNotice,Icon,useApp} from '../lib';

export default function Auth(){
 const register=useLocation().pathname==='/register',navigate=useNavigate();
 const {user,setUser,mode,toast}=useApp();
 // Preview credentials exist only in demo builds; production compiles them out.
 const preview=__DEMO_BUILD__&&(__DEMO_BUILD__&&mode==='demo'),PREVIEW=__DEMO_BUILD__?{email:'alex@example.com',password:'PreviewOnly123!'}:{email:'',password:''};
 const [email,setEmail]=useState(preview?PREVIEW.email:'');
 const [password,setPassword]=useState(preview?PREVIEW.password:'');
 const [confirm,setConfirm]=useState(''),[visible,setVisible]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState<unknown>(null);
 useEffect(()=>{if(user)navigate('/portfolio',{replace:true})},[user,navigate]);
 useEffect(()=>{if(user)return;let active=true;api<{user:AuthUser}>('GET','/auth/me').then(response=>{if(active)setUser(response.user)}).catch(()=>{});return()=>{active=false}},[]);
 useEffect(()=>{setError(null);setConfirm('')},[register]);
 async function submit(event?:FormEvent,quick=false){
  event?.preventDefault();if(busy)return;setError(null);
  if(register&&!quick&&password!==confirm){setError(new Error('The passwords don’t match yet.'));return}
  setBusy(true);
  try{const body=quick&&preview?PREVIEW:{email,password};
   if(register&&!quick){await api('POST','/auth/register',body);toast('Account created. Sign in to get started.');navigate('/login');}
   else{const response=await api<{user:AuthUser}>('POST','/auth/login',body);setUser(response.user);navigate('/portfolio');}
  }catch(e){setError(e)}finally{setBusy(false)}
 }
 return <div className="auth-shell"><section className="auth-story"><span className="eyebrow">PORTFOLIO-DRIVEN. EVIDENCE-LED.</span><div className="auth-sculpture" aria-hidden="true"><div className="code-sheet">{'{ }'}</div><div className="code-sheet">{'</>'}</div></div><h1>{register?<>Make your<br/><em>skills count</em></>:<>Back to your<br/><em>next challenge</em></>}<span className="orange">.</span></h1><p className="lede">{register?'Go beyond the claims. Show what you can build.':<>A portfolio says what you know.<br/>Your code shows how well.</>}</p><div className="story-flow"><span>PORTFOLIO</span><b>→</b><span>QUIZ</span><b>→</b><span>ASSESSMENT</span><b>→</b><span>REPORT</span></div></section><section className="auth-form-wrap"><form className="auth-form" onSubmit={submit}><span className="eyebrow muted">{register?'YOUR NEXT CHAPTER':'WELCOME BACK'}</span><h2>{register?'Create account':'Sign in'}</h2><div className="auth-tabs"><Link to="/login" className={!register?'active':''}>Sign in</Link><Link to="/register" className={register?'active':''}>Create account</Link></div><ErrorNotice error={error}/><label className="field"><span>Email</span><input className="input" type="email" value={email} onChange={e=>setEmail(e.target.value)} autoComplete="email" required maxLength={254} placeholder="you@example.com" disabled={busy}/></label><label className="field"><span>Password</span><span className="input-wrap"><input className="input" type={visible?'text':'password'} value={password} onChange={e=>setPassword(e.target.value)} autoComplete={register?'new-password':'current-password'} required minLength={12} maxLength={128} placeholder="At least 12 characters" disabled={busy}/><button className="password-toggle" type="button" aria-label={visible?'Hide password':'Show password'} aria-pressed={visible} onClick={()=>setVisible(v=>!v)}>{visible?'Hide':'Show'}</button></span>{register&&<small>12–128 characters.</small>}</label>{register&&<label className="field"><span>Confirm password</span><input className="input" type="password" value={confirm} onChange={e=>setConfirm(e.target.value)} autoComplete="new-password" minLength={12} maxLength={128} required disabled={busy}/></label>}<Button type="submit" busy={busy} className="full">{busy?'One moment':register?'Create account':'Sign in'}<Icon/></Button><p className="auth-note">{register?'You’ll sign in before adding your portfolio.':'Your assessment starts after onboarding.'}</p>{preview&&<div className="sample-link"><span>Just here to explore?</span><button type="button" disabled={busy} onClick={()=>void submit(undefined,true)}>Try the complete preview ↗</button></div>}</form></section></div>;
}
