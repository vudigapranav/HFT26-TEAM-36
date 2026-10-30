#!/usr/bin/env python3
# P15 — full product journey against any running backend (owner: Pranav). Stdlib only.
#   python3 scripts/e2e-journey.py                                   (local backend at http://127.0.0.1:3001)
#   BASE=https://<app>/api ORIGIN=https://<app> python3 scripts/e2e-journey.py   (cloud / proxied frontend)
# BASE is the API root; ORIGIN (default: BASE's scheme://host) must equal the backend's AUTH_ORIGIN.
# register → login → /auth/me → portfolio → quiz → assessment → set 1 → unlock → set 2 (hint + assistant) →
# unlock → set 3 → report → report list. Every question is submitted. Locally (BASE on localhost and the seed bank
# present) set 1 is fixed with the seed reference; elsewhere, and on later sets, the code is submitted as-is.
# Prints ✅/❌ per step with timings and exits 1 on the first failure. Never prints cookies, passwords or keys.
# Uses a fresh account every run. ⚠️ marks optional steps that couldn't run (no LLM key, no report list).
import http.cookiejar, json, os, pathlib, sys, time, urllib.error, urllib.parse, urllib.request, uuid

BASE = os.environ.get("BASE", "http://127.0.0.1:3001").rstrip("/")
_u = urllib.parse.urlsplit(BASE)
ORIGIN = os.environ.get("ORIGIN", f"{_u.scheme}://{_u.netloc}").rstrip("/")
REPO = pathlib.Path(__file__).resolve().parent.parent
SEEDS = REPO / "src/backend/seed_bank"
LOCAL = _u.hostname in ("127.0.0.1", "localhost", "::1") and SEEDS.is_dir()
READY_TIMEOUT_S = int(os.environ.get("READY_TIMEOUT_S", "180"))

op = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(http.cookiejar.CookieJar()))
T0 = time.monotonic()


class Fail(Exception):
    pass


def call(method, path, body=None, ok=(200,)):
    data = None if body is None else json.dumps(body).encode()
    req = urllib.request.Request(BASE + path, data=data, method=method,
                                 headers={"Content-Type": "application/json", "Origin": ORIGIN})
    try:
        with op.open(req, timeout=60) as res:
            code, text = res.status, res.read().decode()
    except urllib.error.HTTPError as e:
        code, text = e.code, e.read().decode()
    except urllib.error.URLError as e:
        raise Fail(f"{method} {path}: cannot reach {BASE} ({e.reason})")
    try:
        payload = json.loads(text) if text.strip() else None
    except ValueError:
        payload = text[:200]
    if ok is not None and code not in ok:
        err = payload.get("error", {}) if isinstance(payload, dict) else {}
        tip = ("\n   The backend needs the Docker runner (RUNNER=docker, Docker running, runner image built): see deploy/README.md."
               if err.get("code") == "SANDBOX_UNAVAILABLE" else "")
        raise Fail(f"{method} {path} → {code} {err.get('code', '')} {err.get('message', '')}".rstrip() + tip)
    return code, payload


def step(name, fn):
    t = time.monotonic()
    try:
        note = fn()
    except Fail as e:
        print(f"❌ {name}  ({(time.monotonic() - t) * 1000:.0f} ms)\n   {e}")
        print(f"\nJourney FAILED after {time.monotonic() - T0:.1f} s against {BASE}")
        sys.exit(1)
    warn = isinstance(note, str) and note.startswith("WARN ")
    mark, note = ("⚠️ ", note[5:]) if warn else ("✅", note)
    print(f"{mark} {name}  ({(time.monotonic() - t) * 1000:.0f} ms){'  — ' + note if note else ''}")


def need(cond, msg):
    if not cond:
        raise Fail(msg)


S = {}  # journey state


def register():
    S["cred"] = {"email": f"journey-{uuid.uuid4().hex[:10]}@example.org", "password": f"journey-{uuid.uuid4().hex}"}
    call("POST", "/auth/register", S["cred"], ok=(201,))
    return f"fresh account {S['cred']['email']}"


def login():
    call("POST", "/auth/login", S["cred"])


def me():
    _, b = call("GET", "/auth/me")
    need(isinstance(b, dict) and b.get("user", {}).get("email") == S["cred"]["email"], "/auth/me returned a different user")


def portfolio():
    demo = json.loads((REPO / "docs/demo/demo-portfolio.json").read_text())
    _, b = call("POST", "/portfolio", demo)
    prof = b.get("profile", {})
    need(prof.get("domain") == "backend", f"expected domain backend, got {prof.get('domain')}")
    return f"domain {prof.get('domain')}, topics {', '.join(prof.get('claimed_topics', []))}, {len(b.get('warnings', []))} warnings"


def quiz():
    _, q = call("GET", "/onboarding-quiz")
    qs = q.get("questions", [])
    need(qs, "quiz returned no questions")
    _, lane = call("POST", "/onboarding-quiz", {"answers": [{"question_id": x["id"], "option_id": x["options"][0]["id"]} for x in qs]})
    need("focus_lane" in lane, "no focus lane returned")
    return f"{len(qs)} questions answered"


def create():
    _, st = call("POST", "/assessments", {}, ok=(200, 201, 202))
    S["aid"], S["rid"] = st["assessment_id"], st["report_id"]
    S["st"] = st
    return f"assessment created, {len(st.get('available_task_ids', []))} question(s) in set 1"


def ready():
    deadline = time.monotonic() + READY_TIMEOUT_S
    while True:
        _, st = call("GET", f"/assessments/{S['aid']}/status")
        gen = st.get("generation") or st.get("progress")
        busy = st.get("status") in ("queued", "generating", "validating") or (isinstance(gen, dict) and gen.get("status") in ("queued", "generating", "validating"))
        if not busy:
            need(st.get("status") == "active", f"assessment status is {st.get('status')}")
            need(st.get("available_task_ids"), "no questions available")
            S["st"] = st
            return f"{st.get('remaining_sec')} s on the timer"
        need(time.monotonic() < deadline, f"not ready after {READY_TIMEOUT_S} s")
        time.sleep(2)


def seed_reference(task):
    """Reference editable files for a task served from the local seed bank, matched by title."""
    for d in SEEDS.iterdir():
        meta = d / "task.json"
        if meta.is_file() and json.loads(meta.read_text()).get("title") == task.get("title"):
            return [{"path": f["path"], "content": (d / "reference" / f["path"]).read_text(), "editable": True}
                    for f in task["files"] if f["editable"]]
    return None


def submit_set(n, fix):
    st = S["st"]
    done = S.setdefault("done", set())
    todo = [q for q in st["available_task_ids"] if q not in done]
    need(todo, f"set {n} has no new questions")
    results = []
    for q in todo:
        _, task = call("GET", f"/assessments/{S['aid']}/tasks/{q}")
        need("tier" not in task, f"{q}: task response exposes its level")
        body = {}
        if fix:
            files = seed_reference(task)
            if files:
                body = {"files": files}
        if n == 1 and not S.get("signal_sent"):  # one integrity signal, so the report has something to show
            call("POST", f"/assessments/{S['aid']}/events", {"events": [{"task_id": q, "client_ts": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()), "type": "paste", "payload": {"size": 42}}]})
            S["signal_sent"] = True
        call("POST", f"/assessments/{S['aid']}/tasks/{q}/run", body)
        _, r = call("POST", f"/assessments/{S['aid']}/tasks/{q}/submit", body)
        results.append(f"{q} {r.get('passed')}/{r.get('total')}{' (reference fix)' if body else ''}")
        done.add(q)
    S["last_set"] = todo
    return "; ".join(results)


def unlock():
    _, st = call("GET", f"/assessments/{S['aid']}/status")
    need(st.get("unlock_available") is True, "unlock_available is false after submitting every question")
    _, st = call("POST", f"/assessments/{S['aid']}/tier/upgrade", {})
    S["st"] = st
    return f"unlocks_used {st.get('unlocks_used')}"


def help_set2():
    q = [x for x in S["st"]["available_task_ids"] if x not in S.get("done", set())][0]
    _, h = call("POST", f"/assessments/{S['aid']}/hint", {"task_id": q})
    need(h.get("level") == 1 and h.get("text"), "hint level 1 not served")
    code, a = call("POST", f"/assessments/{S['aid']}/assistant",
                   {"task_id": q, "message": "My visible test still fails. What should I check first?"}, ok=(200, 503))
    if code == 503:
        need(isinstance(a, dict) and a.get("error", {}).get("code") == "LLM_UNAVAILABLE", f"assistant 503 with {a}")
        return "WARN hint served; assistant unavailable (no LLM key → 503 LLM_UNAVAILABLE)"
    return f"hint served; assistant {'blocked' if a.get('blocked') else 'replied'}"


def report():
    _, r = call("GET", f"/reports/{S['rid']}")
    need(isinstance(r.get("final_score"), (int, float)) and 0 <= r["final_score"] <= 100, "final_score missing or out of range")
    rows = r.get("tasks", [])
    need(len(rows) == len(S.get("done", ())), f"expected {len(S.get('done', ()))} task rows, got {len(rows)}")
    aie = [x for x in rows if x.get("aie")]
    need(aie, "no AI efficiency breakdown on any later-set row")
    need(all({"independence", "hint_yield", "test_discipline", "gate"} <= set(x["aie"]) for x in aie), "AIE breakdown incomplete")
    sig = {s["type"]: s["count"] for s in r.get("integrity_signals", [])}
    need(sig.get("paste", 0) >= 1, "integrity signals don't include the paste")
    return f"score {r['final_score']}, {len(rows)} rows, {len(aie)} with AIE, signals {sig}; outcome: {r.get('outcome', '')[:90]}"


def report_list():
    code, b = call("GET", "/reports", ok=None)
    if code in (404, 405):
        return "WARN no GET /reports list on this backend"
    need(code == 200, f"GET /reports → {code}")
    return "report list returned"


print(f"TorqueCode journey against {BASE} (Origin {ORIGIN}; {'local: set 1 uses the seed reference fix' if LOCAL else 'remote: submitting code as-is'})\n")
step("register (unique email)", register)
step("login", login)
step("GET /auth/me", me)
step("upload docs/demo/demo-portfolio.json", portfolio)
step("onboarding quiz (answer all)", quiz)
step("create assessment", create)
step("wait until ready", ready)
step("set 1: run + submit every question", lambda: submit_set(1, LOCAL))
step("unlock set 2", unlock)
step("set 2: one hint + one assistant question", help_set2)
step("set 2: run + submit every question", lambda: submit_set(2, False))
step("unlock set 3", unlock)
step("set 3: run + submit every question", lambda: submit_set(3, False))
step("report: score, rows, AIE breakdown, integrity signals", report)
step("report list (if the backend has one)", report_list)
print(f"\nJourney PASSED in {time.monotonic() - T0:.1f} s against {BASE}")
