import {useEffect,useState} from 'react';
import {Link} from 'react-router-dom';
import type {ReportHistory} from '../types';
import {api,Button,ErrorNotice,Icon,PageTitle,Skeleton} from '../lib';

type Row=ReportHistory['reports'][number];
// G5: GET /reports pages the caller's completed reports, newest first; next_cursor is passed back as ?before=.
export default function Reports(){
 const [rows,setRows]=useState<Row[]>([]),[cursor,setCursor]=useState<string|undefined>(),[loading,setLoading]=useState(true),[more,setMore]=useState(false),[error,setError]=useState<unknown>(null);
 async function load(before?:string){setError(null);try{const page=await api<ReportHistory>('GET',before?`/reports?before=${encodeURIComponent(before)}`:'/reports');setRows(old=>before?[...old,...page.reports]:page.reports);setCursor(page.next_cursor);}catch(e){setError(e);}}
 useEffect(()=>{void load().finally(()=>setLoading(false));},[]);
 if(loading)return <Skeleton/>;
 return <section className="page reports-page"><PageTitle eyebrow="YOUR EVIDENCE OVER TIME" description="Completed assessments, newest first.">Past <em>reports.</em></PageTitle>
  <ErrorNotice error={error}/>
  {rows.length?<ol className="report-history">{rows.map(r=><li key={r.id}><Link to={`/report?id=${encodeURIComponent(r.id)}`}><strong>{Math.round(r.final_score)}<small> / 100</small></strong><span>{r.outcome}</span><time dateTime={r.created_at}>{new Date(r.created_at).toLocaleString()}</time></Link></li>)}</ol>:!error&&<p className="lede">No completed reports yet. A report appears here when an assessment’s timer ends.</p>}
  <div className="button-row">{cursor&&<Button className="outline" busy={more} onClick={()=>{setMore(true);void load(cursor).finally(()=>setMore(false));}}>Load older reports <Icon name="arrow"/></Button>}<Link className="pill" to="/portfolio">Back to portfolio <Icon name="arrow"/></Link></div>
 </section>;
}
