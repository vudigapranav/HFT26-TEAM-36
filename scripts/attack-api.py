#!/usr/bin/env python3
# Adversarial API regression suite. Run against a LIVE backend in APP_MODE=auth:
#   python3 scripts/attack-api.py        (from the repo root; server at http://127.0.0.1:3001)
# Creates throwaway users. Never point it at a shared or production database.
import json, http.cookiejar, urllib.request, urllib.error, pathlib, threading, uuid
B="http://127.0.0.1:3001"; root=pathlib.Path("src/backend")
R=[]
def mk():
    jar=http.cookiejar.CookieJar(); return urllib.request.build_opener(urllib.request.HTTPCookieProcessor(jar))
def call(op,m,p,body=None,origin=B,raw=None,ct="application/json"):
    data=raw if raw is not None else (None if body is None else json.dumps(body).encode())
    h={"Content-Type":ct}
    if origin: h["Origin"]=origin
    r=urllib.request.Request(B+p,data=data,method=m,headers=h)
    try:
        with op.open(r,timeout=30) as res: t=res.read().decode(); return res.status,(json.loads(t) if t.strip().startswith(("{","[")) else t)
    except urllib.error.HTTPError as e:
        t=e.read().decode(); 
        try: return e.code,json.loads(t)
        except Exception: return e.code,t
def check(name,cond,detail=""): R.append((("PASS" if cond else "FAIL"),name,str(detail)[:160]))
def user():
    op=mk(); cred={"email":f"u{uuid.uuid4().hex[:8]}@example.org","password":"attack-test-password-1"}
    call(op,"POST","/auth/register",cred); c,_=call(op,"POST","/auth/login",cred); assert c==200,c; return op
A=user(); Bu=user(); anon=mk()
fx=lambda n: json.loads((root/f"tests/fixtures/portfolios/{n}.json").read_text())

# --- auth / CSRF ---
c,_=call(anon,"POST","/portfolio",fx("normal-web")); check("unauthenticated portfolio rejected",c==401,c)
c,_=call(A,"POST","/portfolio",fx("normal-web"),origin=None); check("POST without Origin rejected (CSRF)",c==403,c)
c,_=call(A,"POST","/portfolio",fx("normal-web"),origin="http://evil.example"); check("POST with foreign Origin rejected",c==403,c)
c,_=call(A,"POST","/portfolio",raw=b"a=1",ct="application/x-www-form-urlencoded"); check("form-encoded body rejected",c in (400,403,415),c)

# --- portfolio intake through the API ---
for n in ["normal-web","empty-topics","typo-topics","injection","unknown-stack"]:
    c,b=call(A,"POST","/portfolio",fx(n)); check(f"portfolio {n} accepted",c==200,(c, b if c!=200 else ""))
hb=json.dumps(fx("huge")).encode(); c,b=call(A,"POST","/portfolio",raw=hb)
check(f"huge.json ({len(hb)//1024} KB) capped, not rejected (EXPECTED.md)",c==200,(c,b if c!=200 else ""))
c,b=call(A,"POST","/portfolio",{"__proto__":{"admin":True},**fx("normal-web")}); check("__proto__ key handled (no 500)",c in (200,400),c)
c,b=call(A,"POST","/portfolio",raw=b"{bad json"); check("malformed JSON → 400",c==400,c)
c,b=call(A,"POST","/portfolio",[]); check("array body → 4xx with fields",c in (400,422),c)
bad={**fx("normal-web"),"dsa_topics_solved":["x"*61]}; c,b=call(A,"POST","/portfolio",bad); check("over-long topic string → capped or 4xx, no 500",c in (200,400,422),c)
deep={"candidate":{"name":"a","email":"a@b.co"},"projects":[{"name":"p","description":"d","tech_stack":[{"x":1}],"role":"r","highlights":[]}],"tech_stack":[],"skills":[],"dsa_topics_solved":[]}
c,b=call(A,"POST","/portfolio",deep); check("wrong nested types → field errors",c in (400,422),c)

# --- quiz ---
c,_=call(Bu,"GET","/onboarding-quiz"); check("quiz before portfolio → 4xx (not 500)",400<=c<500,c)
call(A,"POST","/portfolio",fx("normal-web"))
c,q=call(A,"GET","/onboarding-quiz"); qs=q["questions"]
c,b=call(A,"POST","/onboarding-quiz",{"answers":[{"question_id":"q01","option_id":"zz"}]}); check("unknown option → 4xx",400<=c<500,c)
c,b=call(A,"POST","/onboarding-quiz",{"answers":[{"question_id":qs[0]["id"],"option_id":qs[0]["options"][0]["id"]}]*10}); check("duplicate answers to same question handled",c in (200,400,422),(c,b))
# option that exists in bank but was NOT offered (filtered) to this profile
offered={(q2["id"],o["id"]) for q2 in qs for o in q2["options"]}
bank=json.loads((root/"intake/quizBank.json").read_text())["questions"]
hidden=[(qq["id"],o["id"]) for qq in bank for o in qq["options"] if (qq["id"],o["id"]) not in offered]
if hidden:
    c,b=call(A,"POST","/onboarding-quiz",{"answers":[{"question_id":hidden[0][0],"option_id":hidden[0][1]}]}); check("answer to a NOT-offered option rejected",400<=c<500,(c,b))

# --- assessments ---
c,a=call(A,"POST","/assessments",{}); aid,tid,rid=a["assessment_id"],a["task_id"],a["report_id"]
c,_=call(Bu,"GET",f"/assessments/{aid}/status"); check("other user can't read status",c in (403,404),c)
c,_=call(Bu,"GET",f"/assessments/{aid}/tasks/{tid}"); check("other user can't read task",c in (403,404),c)
c,_=call(Bu,"POST",f"/assessments/{aid}/tasks/{tid}/run",{}); check("other user can't run",c in (403,404),c)
c,_=call(Bu,"GET",f"/reports/{rid}"); check("other user can't read report",c in (403,404),c)
c,_=call(A,"GET",f"/assessments/{aid}/tasks/../../health"); check("path tricks don't bypass",c in (200,400,404),c)
for p,label in [("tests/test_visible.py","non-editable test file"),("../../etc/passwd","path traversal"),("app/../tests/x.py","dot-dot in path"),("conftest.py","conftest injection"),("app/summary.py\u0000x","NUL in path")]:
    c,b=call(A,"PUT",f"/assessments/{aid}/tasks/{tid}/files",{"files":[{"path":p,"content":"x","editable":True}]}); check(f"autosave rejects {label}",400<=c<500,(c,b))
c,b=call(A,"PUT",f"/assessments/{aid}/tasks/{tid}/files",{"files":[{"path":"app/summary.py","content":"x"*70000,"editable":True}]}); check("oversize file rejected",400<=c<500,c)
c,b=call(A,"PUT",f"/assessments/{aid}/tasks/{tid}/files",{"files":[{"path":"app/summary.py","content":"x","editable":False}]}); check("editable flag can't be flipped by client",c in (200,400,422),(c,b))
# hints race: 6 parallel
res=[]
def h(): res.append(call(A,"POST",f"/assessments/{aid}/hint",{})[0])
ts=[threading.Thread(target=h) for _ in range(6)]; [t.start() for t in ts]; [t.join() for t in ts]
check("parallel hint spam: ≤3 served, rest 409",res.count(200)<=3 and all(x in (200,409) for x in res),res)
c,b=call(A,"POST",f"/assessments/{aid}/events",{"events":[{"task_id":tid,"client_ts":"2026-10-31T00:00:00Z","type":"tab_hidden","payload":{}}]*101}); check(">100 events rejected",400<=c<500,c)
c,b=call(A,"POST",f"/assessments/{aid}/events",{"events":[{"task_id":"other-task","client_ts":"2026-10-31T00:00:00Z","type":"copy","payload":{}}]}); check("event for a foreign task_id rejected",400<=c<500,(c,b))
c,b=call(A,"POST",f"/assessments/{aid}/events",{"events":[{"task_id":tid,"client_ts":"2026-10-31T00:00:00Z","type":"submit","payload":{}}]}); check("client can't forge server event types",400<=c<500,c)
# parallel runs
rr=[]
def r(): rr.append(call(A,"POST",f"/assessments/{aid}/tasks/{tid}/run",{})[0])
ts=[threading.Thread(target=r) for _ in range(5)]; [t.start() for t in ts]; [t.join() for t in ts]
check("5 parallel runs: no 500s",all(x<500 or x==503 for x in rr),rr)
c,rep=call(A,"GET",f"/reports/{rid}"); check("report after attacks valid",c==200,(c,rep))
s=json.dumps(rep); check("report leaks no hidden/reference",("def " not in s) and ("reference" not in s),"")
# report before any submit (fresh assessment)
c,a2=call(Bu,"POST","/assessments",{}); 
c,rep2=call(Bu,"GET",f"/reports/{a2['report_id']}") if c==201 else (c,None); check("report before any submit → valid, not 500",c in (200,409),(c,rep2))
for st,n,d in R: print(f"{'✅' if st=='PASS' else '❌'} {n}" + (f"   [{d}]" if st=='FAIL' else ""))
print(f"\n{sum(1 for x in R if x[0]=='PASS')} pass / {sum(1 for x in R if x[0]=='FAIL')} fail")
