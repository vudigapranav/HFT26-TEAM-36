# Aryan K7 — execution evidence

Python: 3.13.14 (tags/v3.13.14:fd17997, Jun 10 2026, 13:03:48) [MSC v.1944 64 bit (AMD64)]

Scope: local Windows Python 3.13 + pytest. Docker resource limits, backend loading and UI integration were not tested here.

Each variant ran in a fresh temporary directory with only its app/ and tests/. F2P/P2P classifications were checked per JUnit test ID.

## adept_event_dedupe

### reference — run 1

```text
..........                                                               [100%]
10 passed in 0.25s
```

### reference — run 2

```text
..........                                                               [100%]
10 passed in 0.15s
```

### reference — run 3

```text
..........                                                               [100%]
10 passed in 0.14s
```

### starter — run 1

```text
FFFFF.FF..                                                               [100%]
================================== FAILURES ===================================
______________________________ test_empty_batch _______________________________

    def test_empty_batch():
>       assert EventStore([]).deduplicated() == []
               ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^

tests\test_hidden.py:7: 
_ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _

self = <app.store.EventStore object at 0x000001714C4B0440>

    def deduplicated(self) -> list[Event]:
        """Return one earliest event per ID, in first-seen ID order."""
>       raise NotImplementedError("Implement event deduplication")
E       NotImplementedError: Implement event deduplication

app\store.py:16: NotImplementedError
_________________________ test_one_user_many_retries __________________________

    def test_one_user_many_retries():
        events = [Event("u", "x", 9), Event("u", "x", 3),
                  Event("u", "y", 0), Event("u", "y", 5)]
>       assert summarize_events(events) == [{"user_id": "u", "count": 2}]
               ^^^^^^^^^^^^^^^^^^^^^^^^

tests\test_hidden.py:14: 
_ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _

events = [Event(user_id='u', event_id='x', ts=9), Event(user_id='u', event_id='x', ts=3), Event(user_id='u', event_id='y', ts=0), Event(user_id='u', event_id='y', ts=5)]

    def summarize_events(events: list[Event]) -> list[dict[str, str | int]]:
        """Return unique-event counts per user, ordered by user ID."""
>       raise NotImplementedError("Implement per-user summary")
E       NotImplementedError: Implement per-user summary

app\service.py:7: NotImplementedError
________________ test_global_ids_and_first_wins_timestamp_ties ________________

    def test_global_ids_and_first_wins_timestamp_ties():
        events = [Event("z", "shared", 10), Event("a", "shared", 2),
                  Event("b", "shared", 2), Event("b", "other", 1)]
>       assert EventStore(events).deduplicated() == [events[1], events[3]]
               ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^

tests\test_hidden.py:20: 
_ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _

self = <app.store.EventStore object at 0x000001714C544190>

    def deduplicated(self) -> list[Event]:
        """Return one earliest event per ID, in first-seen ID order."""
>       raise NotImplementedError("Implement event deduplication")
E       NotImplementedError: Implement event deduplication

app\store.py:16: NotImplementedError
___________________ test_many_users_and_input_is_unchanged ____________________

    def test_many_users_and_input_is_unchanged():
        events = [Event(f"user-{i % 17:02}", f"event-{i}", i) for i in range(1000)]
        events += [Event("retry-owner", f"event-{i}", 2000 + i) for i in range(1000)]
        before = list(events)
        expected = [{"user_id": f"user-{i:02}", "count": 59 if i < 14 else 58}
                    for i in range(17)]
>       assert summarize_events(events) == expected
               ^^^^^^^^^^^^^^^^^^^^^^^^

tests\test_hidden.py:31: 
_ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _

events = [Event(user_id='user-00', event_id='event-0', ts=0), Event(user_id='user-01', event_id='event-1', ts=1), Event(user_id...3', ts=3), Event(user_id='user-04', event_id='event-4', ts=4), Event(user_id='user-05', event_id='event-5', ts=5), ...]

    def summarize_events(events: list[Event]) -> list[dict[str, str | int]]:
        """Return unique-event counts per user, ordered by user ID."""
>       raise NotImplementedError("Implement per-user summary")
E       NotImplementedError: Implement per-user summary

app\service.py:7: NotImplementedError
________________ test_case_sensitive_ids_and_first_seen_order _________________

    def test_case_sensitive_ids_and_first_seen_order():
        events = [Event("z", "ID", 8), Event("a", "id", 1), Event("b", "ID", 0)]
>       assert EventStore(events).deduplicated() == [events[2], events[1]]
               ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^

tests\test_hidden.py:37: 
_ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _

self = <app.store.EventStore object at 0x000001714C46B750>

    def deduplicated(self) -> list[Event]:
        """Return one earliest event per ID, in first-seen ID order."""
>       raise NotImplementedError("Implement event deduplication")
E       NotImplementedError: Implement event deduplication

app\store.py:16: NotImplementedError
___________________ test_counts_are_sorted_and_deduplicated ___________________

    def test_counts_are_sorted_and_deduplicated():
        events = [Event("bob", "b1", 5), Event("amy", "a1", 8),
                  Event("bob", "b1", 3), Event("amy", "a2", 9)]
>       assert summarize_events(events) == [
               ^^^^^^^^^^^^^^^^^^^^^^^^
            {"user_id": "amy", "count": 2}, {"user_id": "bob", "count": 1}]

tests\test_visible.py:9: 
_ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _

events = [Event(user_id='bob', event_id='b1', ts=5), Event(user_id='amy', event_id='a1', ts=8), Event(user_id='bob', event_id='b1', ts=3), Event(user_id='amy', event_id='a2', ts=9)]

    def summarize_events(events: list[Event]) -> list[dict[str, str | int]]:
        """Return unique-event counts per user, ordered by user ID."""
>       raise NotImplementedError("Implement per-user summary")
E       NotImplementedError: Implement per-user summary

app\service.py:7: NotImplementedError
_____________________ test_store_keeps_earliest_timestamp _____________________

    def test_store_keeps_earliest_timestamp():
        events = [Event("later", "shared", 20), Event("earlier", "shared", 4)]
>       assert EventStore(events).deduplicated() == [events[1]]
               ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^

tests\test_visible.py:15: 
_ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _

self = <app.store.EventStore object at 0x000001714C5409D0>

    def deduplicated(self) -> list[Event]:
        """Return one earliest event per ID, in first-seen ID order."""
>       raise NotImplementedError("Implement event deduplication")
E       NotImplementedError: Implement event deduplication

app\store.py:16: NotImplementedError
=========================== short test summary info ===========================
FAILED tests/test_hidden.py::test_empty_batch - NotImplementedError: Implemen...
FAILED tests/test_hidden.py::test_one_user_many_retries - NotImplementedError...
FAILED tests/test_hidden.py::test_global_ids_and_first_wins_timestamp_ties - ...
FAILED tests/test_hidden.py::test_many_users_and_input_is_unchanged - NotImpl...
FAILED tests/test_hidden.py::test_case_sensitive_ids_and_first_seen_order - N...
FAILED tests/test_visible.py::test_counts_are_sorted_and_deduplicated - NotIm...
FAILED tests/test_visible.py::test_store_keeps_earliest_timestamp - NotImplem...
7 failed, 3 passed in 0.26s
```

Statement examples matched the executed reference:

```json
[
  [
    {
      "user_id": "amy",
      "count": 2
    },
    {
      "user_id": "bob",
      "count": 1
    }
  ],
  [
    {
      "user_id": "a",
      "count": 1
    },
    {
      "user_id": "b",
      "count": 1
    }
  ]
]
```

## master_session_window

### reference — run 1

```text
..........                                                               [100%]
10 passed in 0.29s
```

### reference — run 2

```text
..........                                                               [100%]
10 passed in 0.28s
```

### reference — run 3

```text
..........                                                               [100%]
10 passed in 0.27s
```

### starter — run 1

```text
FF...FFF..                                                               [100%]
================================== FAILURES ===================================
__________________ test_report_with_shrinking_and_long_tail ___________________

    def test_report_with_shrinking_and_long_tail():
        codes = ["A", "B", "C", "C", "B", "B", "A"]
        lines = [f"r{i}|{code}" for i, code in enumerate(codes)]
>       assert build_report(lines, 2) == {"start": 1, "end_exclusive": 6, "length": 5}
E       AssertionError: assert {'start': 1, ..., 'length': 4} == {'start': 1, ..., 'length': 5}
E         
E         Omitting 2 identical items, use -vv to show
E         Differing items:
E         {'length': 4} != {'length': 5}
E         Use -v to get more diff

tests\test_hidden.py:17: AssertionError
_________________ test_reports_match_small_bruteforce_oracle __________________

    def test_reports_match_small_bruteforce_oracle():
        rng = random.Random(3607)
        cases = [(["A"], 1)]
        cases += [([rng.choice("ABCD") for _ in range(rng.randrange(21))],
                   rng.randrange(5)) for _ in range(100)]
        for codes, k in cases:
            best = (0, 0)
            for start in range(len(codes)):
                for end in range(start + 1, len(codes) + 1):
                    if len(set(codes[start:end])) <= k and end - start > best[1] - best[0]:
                        best = (start, end)
            lines = [f"r{i}|{code}" for i, code in enumerate(codes)]
            assert longest_window(codes, k) == best
>           assert build_report(lines, k) == {
                "start": best[0], "end_exclusive": best[1], "length": best[1] - best[0]}
E           AssertionError: assert {'start': 0, ..., 'length': 0} == {'start': 0, ..., 'length': 1}
E             
E             Omitting 2 identical items, use -vv to show
E             Differing items:
E             {'length': 0} != {'length': 1}
E             Use -v to get more diff

tests\test_hidden.py:33: AssertionError
________________________ test_large_window_performance ________________________
Command '['C:\\Users\\shash_slc8aua\\AppData\\Local\\Microsoft\\WindowsApps\\PythonSoftwareFoundation.Python.3.13_qbz5n2kfra8p0\\python.exe', '-c', "import json,time; from app.window import longest_window; codes=['TIMEOUT']*200000; started=time.perf_counter(); span=longest_window(codes,1); elapsed=time.perf_counter()-started; print(json.dumps({'span':span,'elapsed_sec':elapsed,'n':len(codes)}))"]' timed out after 4.0 seconds

During handling of the above exception, another exception occurred:
200000-input window exceeded the 4-second worker deadline
_______________________ test_report_for_mixed_requests ________________________

    def test_report_for_mixed_requests():
        lines = ["r1|A", "r2|B", "r3|A", "r4|C", "r5|C"]
>       assert build_report(lines, 2) == {"start": 0, "end_exclusive": 3, "length": 3}
E       AssertionError: assert {'start': 0, ..., 'length': 2} == {'start': 0, ..., 'length': 3}
E         
E         Omitting 2 identical items, use -vv to show
E         Differing items:
E         {'length': 2} != {'length': 3}
E         Use -v to get more diff

tests\test_visible.py:8: AssertionError
_________________________ test_single_request_report __________________________

    def test_single_request_report():
>       assert build_report(["r1|TIMEOUT"], 1) == {
            "start": 0, "end_exclusive": 1, "length": 1}
E       AssertionError: assert {'start': 0, ..., 'length': 0} == {'start': 0, ..., 'length': 1}
E         
E         Omitting 2 identical items, use -vv to show
E         Differing items:
E         {'length': 0} != {'length': 1}
E         Use -v to get more diff

tests\test_visible.py:12: AssertionError
=========================== short test summary info ===========================
FAILED tests/test_hidden.py::test_report_with_shrinking_and_long_tail - Asser...
FAILED tests/test_hidden.py::test_reports_match_small_bruteforce_oracle - Ass...
FAILED tests/test_hidden.py::test_large_window_performance - Failed: 200000-i...
FAILED tests/test_visible.py::test_report_for_mixed_requests - AssertionError...
FAILED tests/test_visible.py::test_single_request_report - AssertionError: as...
5 failed, 5 passed in 4.29s
```

Statement examples matched the executed reference:

```json
[
  {
    "start": 0,
    "end_exclusive": 3,
    "length": 3
  },
  {
    "start": 1,
    "end_exclusive": 6,
    "length": 5
  }
]
```

## Master 200000-input benchmark

```json
{
  "reference": {
    "n": 200000,
    "span": [
      0,
      200000
    ],
    "elapsed_sec": 0.035108099997160025,
    "status": "completed"
  },
  "starter": {
    "n": 200000,
    "status": "timed_out",
    "timeout_sec": 10.25,
    "observed_wall_sec": 10.287517800003116
  }
}
```

The hidden performance test has a 4-second child-process deadline and a <2-second algorithm threshold. The separate benchmark above gives the slow starter 10.25 seconds before terminating it.

No full completion time is claimed for the timed-out starter.

## Package checksums

- `adept_event_dedupe.zip` — SHA-256 `db3c5860f3201d4965d1eec0c52568f42391664d49dcadd211acdc2935c610cb`
- `master_session_window.zip` — SHA-256 `03a12d880256fef73aef78b76d1032b9a32ec8c252d2dcb108aa219cd2ff312b`
