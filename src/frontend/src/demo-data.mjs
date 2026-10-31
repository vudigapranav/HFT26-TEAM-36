// Public task fixtures for an explicitly simulated design preview.
// Source: HFT26-TEAM-36 @ e04f5d0d0a012ef9261fa5db8eff9401030acabc. No hidden test metadata or code.
export const samplePortfolio = {
  "candidate": {
    "name": "Alex Patel",
    "email": "alex@example.com"
  },
  "projects": [
    {
      "name": "TaskFlow API",
      "description": "A task-management API with request validation, activity summaries, and event ingestion.",
      "tech_stack": [
        "Python",
        "FastAPI",
        "PostgreSQL"
      ],
      "role": "Backend developer",
      "highlights": [
        "Built validated REST endpoints",
        "Added event deduplication and activity reports"
      ]
    }
  ],
  "tech_stack": [
    "Python",
    "FastAPI",
    "PostgreSQL"
  ],
  "skills": [
    "REST APIs",
    "Backend development"
  ],
  "dsa_topics_solved": [
    "arrays",
    "hashing",
    "sliding_window"
  ]
};

export const demoTasks = [
  {
    "task_id": "question-1",
    "domain": "backend",
    "language": "python",
    "task_type": "bug_fix",
    "title": "Fix the request-volume summary",
    "statement_md": "An operations dashboard reports the largest request count across a list of daily counts. Fix peak_requests in app/summary.py: it currently misses some days. Counts are non-negative integers; an empty list returns 0. Examples: [2, 7, 3] returns 7; [2, 3, 9] returns 9. Preserve existing behavior. Only app/summary.py is editable.",
    "dsa_topics": [
      "arrays"
    ],
    "source": "seed_bank",
    "assistant_enabled": false,
    "files": [
      {
        "path": "app/summary.py",
        "content": "def peak_requests(counts: list[int]) -> int:\n    \"\"\"Return the largest daily request count, or zero for no days.\"\"\"\n    peak = 0\n    for index in range(len(counts) - 1):\n        peak = max(peak, counts[index])\n    return peak\n",
        "editable": true
      },
      {
        "path": "tests/test_visible.py",
        "content": "# Read-only visible checks from the public task.\nfrom app.summary import peak_requests\n\ndef test_last_day_peak():\n    assert peak_requests([2, 3, 9]) == 9\n\ndef test_middle_day_peak():\n    assert peak_requests([2, 7, 3]) == 7\n",
        "editable": false
      }
    ],
    "visible_tests": [
      {
        "id": "tests/test_visible.py::test_last_day_peak",
        "path": "tests/test_visible.py",
        "content": ""
      },
      {
        "id": "tests/test_visible.py::test_middle_day_peak",
        "path": "tests/test_visible.py",
        "content": ""
      }
    ]
  },
  {
    "task_id": "question-2",
    "domain": "backend",
    "language": "python",
    "task_type": "feature",
    "title": "Deduplicate event deliveries and summarize owners",
    "statement_md": "# Event ingestion: count unique deliveries\n\nAn ingestion service receives retries and out-of-order deliveries. Implement the missing\ndeduplication-and-summary feature across `app/store.py` and `app/service.py`.\nOnly these two files are editable. `app/models.py` (the immutable `Event` record and the\nworking row validation in `parse_rows` / `normalize_batch`) must remain unchanged.\n\nA batch is a list of `(user_id, event_id, ts)` rows: user_id/event_id are nonempty\ncase-sensitive strings and ts is a nonnegative integer; invalid rows raise ValueError.\nIDs are GLOBAL across users. For each event_id, retain the delivery with the smallest ts.\nOn equal timestamps, retain the first occurrence in the input; its user owns that event.\n\n1. `EventStore.deduplicated()` in `app/store.py`: return the retained Event records in\n   first-seen event-ID order (replacing a winner must not move its ID). `deduplicate(rows)`\n   already wraps it and returns `(user_id, event_id, ts)` tuples.\n2. `summarize_events(rows)` in `app/service.py`: return a list of\n   `{\"user_id\": str, \"count\": int}` dictionaries for retained-event owners, ordered\n   lexicographically by user_id. Omit users with no retained events. Empty input returns [].\n\nUse arrays/lists and hashing (dicts/sets); only sorted() on dictionary keys is needed.\n\nExample 1 (summarize_events):\nInput: [(\"bob\", \"b1\", 5), (\"amy\", \"a1\", 8), (\"bob\", \"b1\", 3), (\"amy\", \"a2\", 9)]\nOutput: [{\"user_id\": \"amy\", \"count\": 2}, {\"user_id\": \"bob\", \"count\": 1}]\n\nExample 2 (deduplicate):\nInput: [(\"z\", \"shared\", 10), (\"a\", \"shared\", 2), (\"b\", \"shared\", 2), (\"b\", \"other\", 1)]\nOutput: [(\"a\", \"shared\", 2), (\"b\", \"other\", 1)]\n",
    "dsa_topics": [
      "arrays",
      "hashing"
    ],
    "source": "seed_bank",
    "assistant_enabled": true,
    "files": [
      {
        "path": "app/store.py",
        "content": "from app.models import Event, parse_rows, to_rows\n\n\nclass EventStore:\n    \"\"\"An in-memory snapshot of an ingestion batch.\"\"\"\n\n    def __init__(self, events: list[Event]) -> None:\n        self._events = list(events)\n\n    def snapshot(self) -> list[Event]:\n        \"\"\"Return a copy so callers cannot mutate the stored batch.\"\"\"\n        return list(self._events)\n\n    def deduplicated(self) -> list[Event]:\n        \"\"\"Return one earliest event per ID, in first-seen ID order.\"\"\"\n        raise NotImplementedError(\"Implement event deduplication\")\n\n\ndef deduplicate(rows: list) -> list[tuple[str, str, int]]:\n    \"\"\"Validate rows, then return one earliest delivery per event_id as tuples.\"\"\"\n    return to_rows(EventStore(parse_rows(rows)).deduplicated())\n",
        "editable": true
      },
      {
        "path": "app/service.py",
        "content": "from app.models import parse_rows\nfrom app.store import EventStore\n\n\ndef summarize_events(rows: list) -> list[dict[str, str | int]]:\n    \"\"\"Return unique-event counts per user, ordered by user ID.\"\"\"\n    raise NotImplementedError(\"Implement per-user summary\")\n",
        "editable": true
      },
      {
        "path": "app/models.py",
        "content": "from dataclasses import dataclass\n\n\n@dataclass(frozen=True)\nclass Event:\n    user_id: str\n    event_id: str\n    ts: int\n\n\ndef parse_rows(rows: list) -> list[Event]:\n    \"\"\"Validate raw (user_id, event_id, ts) rows and build Event records.\"\"\"\n    events: list[Event] = []\n    for row in rows:\n        if len(row) != 3:\n            raise ValueError(\"Expected (user_id, event_id, ts)\")\n        user_id, event_id, ts = row\n        if not isinstance(user_id, str) or not user_id or not isinstance(event_id, str) or not event_id:\n            raise ValueError(\"user_id and event_id must be nonempty strings\")\n        if not isinstance(ts, int) or isinstance(ts, bool) or ts < 0:\n            raise ValueError(\"ts must be a nonnegative integer\")\n        events.append(Event(user_id, event_id, ts))\n    return events\n\n\ndef to_rows(events: list[Event]) -> list[tuple[str, str, int]]:\n    \"\"\"Convert Event records back to (user_id, event_id, ts) tuples.\"\"\"\n    return [(event.user_id, event.event_id, event.ts) for event in events]\n\n\ndef normalize_batch(rows: list) -> list[tuple[str, str, int]]:\n    \"\"\"Validate a raw batch and return it as tuples, in input order.\"\"\"\n    return to_rows(parse_rows(rows))\n",
        "editable": false
      }
    ],
    "visible_tests": [
      {
        "id": "tests/test_visible.py::test_counts_are_sorted_and_deduplicated",
        "path": "tests/test_visible.py",
        "content": ""
      },
      {
        "id": "tests/test_visible.py::test_store_keeps_earliest_timestamp",
        "path": "tests/test_visible.py",
        "content": ""
      },
      {
        "id": "tests/test_visible.py::test_normalize_preserves_rows",
        "path": "tests/test_visible.py",
        "content": ""
      },
      {
        "id": "tests/test_visible.py::test_normalize_rejects_bad_rows",
        "path": "tests/test_visible.py",
        "content": ""
      }
    ]
  },
  {
    "task_id": "question-3",
    "domain": "backend",
    "language": "python",
    "task_type": "bug_fix",
    "title": "Repair request-session window correctness and throughput",
    "statement_md": "# Request-session window report\n\nAn operations service looks for the longest consecutive stretch of requests containing\nat most K distinct error codes. Two regressions were introduced: the report length\nis incorrect, and large batches are much too slow. Repair both without changing APIs.\nOnly `app/window.py` and `app/report.py` are editable. `app/parser.py` is trusted,\nworking support code and must remain unchanged.\n\nEach nonblank input line is `request_id|error_code`. Whitespace is stripped, blank\nlines are ignored, and malformed records raise ValueError. Error codes are nonempty,\ncase-sensitive strings; repeated request IDs do not deduplicate records. K is an\ninteger >= 0. Negative K raises ValueError. Up to 30000 parsed records are assessed.\n\n`longest_window(codes, k)` returns (start, end_exclusive) in the PARSED record array.\nChoose the longest contiguous span with at most k distinct codes; if lengths tie,\nchoose the earliest start. No eligible span (including k=0) returns (0, 0).\n`build_report(lines, k)` returns {\"start\": start, \"end_exclusive\": end, \"length\": end-start}.\nPreserve parsing, tie-breaking and empty-input behavior. Do not mutate input.\nUse an O(n) sliding window with hashing for code frequencies; do not repeatedly scan\nor copy a growing window. An assessed 30000-record window call must finish in under 0.3 s;\nthe whole task has a 10-second wall-clock limit. Only standard-library code is allowed.\n\nExample 1:\nInput: lines=[\"r1|A\", \"r2|B\", \"r3|A\", \"r4|C\", \"r5|C\"], k=2\nOutput: {\"start\": 0, \"end_exclusive\": 3, \"length\": 3}\nThe later span [A,C,C] ties in length, so the earlier span [A,B,A] wins.\n\nExample 2:\nInput: lines=[\"r1|A\", \"r2|B\", \"r3|C\", \"r4|C\", \"r5|B\", \"r6|B\", \"r7|A\"], k=2\nOutput: {\"start\": 1, \"end_exclusive\": 6, \"length\": 5}\n",
    "dsa_topics": [
      "arrays",
      "sliding_window"
    ],
    "source": "seed_bank",
    "assistant_enabled": true,
    "files": [
      {
        "path": "app/window.py",
        "content": "def longest_window(codes: list[str], k: int) -> tuple[int, int]:\n    \"\"\"Return the earliest longest half-open span with at most k codes.\"\"\"\n    if k < 0:\n        raise ValueError(\"k must be nonnegative\")\n    if k == 0 or not codes:\n        return (0, 0)\n    left = best_start = best_end = 0\n    for right, code in enumerate(codes):\n        while len(set(codes[left:right + 1])) > k:\n            left += 1\n        if right + 1 - left > best_end - best_start:\n            best_start, best_end = left, right + 1\n    return (best_start, best_end)\n",
        "editable": true
      },
      {
        "path": "app/report.py",
        "content": "from app.parser import parse_codes\nfrom app.window import longest_window\n\n\ndef build_report(lines: list[str], k: int) -> dict[str, int]:\n    \"\"\"Summarize the longest valid span using parsed-record offsets.\"\"\"\n    codes = parse_codes(lines)\n    start, end = longest_window(codes, k)\n    return {\"start\": start, \"end_exclusive\": end, \"length\": max(0, end - start - 1)}\n",
        "editable": true
      },
      {
        "path": "app/parser.py",
        "content": "def parse_codes(lines: list[str]) -> list[str]:\n    \"\"\"Read request_id|error_code records, ignoring blank lines.\"\"\"\n    codes: list[str] = []\n    for line in lines:\n        line = line.strip()\n        if not line:\n            continue\n        parts = line.split(\"|\")\n        if len(parts) != 2 or not parts[0].strip() or not parts[1].strip():\n            raise ValueError(\"Expected request_id|error_code\")\n        codes.append(parts[1].strip())\n    return codes\n",
        "editable": false
      }
    ],
    "visible_tests": [
      {
        "id": "tests/test_visible.py::test_report_for_mixed_requests",
        "path": "tests/test_visible.py",
        "content": ""
      },
      {
        "id": "tests/test_visible.py::test_single_request_report",
        "path": "tests/test_visible.py",
        "content": ""
      },
      {
        "id": "tests/test_visible.py::test_window_returns_earliest_tie",
        "path": "tests/test_visible.py",
        "content": ""
      },
      {
        "id": "tests/test_visible.py::test_parser_preserves_records",
        "path": "tests/test_visible.py",
        "content": ""
      }
    ]
  }
];

export const quizBank = [
  {
    "id": "q01",
    "text": "Which kind of work would you most like to be tested on?",
    "options": [
      {
        "id": "a",
        "text": "Building user-facing pages and UI logic",
        "points_to": {
          "domains": [
            "web"
          ]
        }
      },
      {
        "id": "b",
        "text": "APIs, databases and server logic",
        "points_to": {
          "domains": [
            "backend"
          ]
        }
      },
      {
        "id": "c",
        "text": "Working with data and models",
        "points_to": {
          "domains": [
            "ml"
          ]
        }
      },
      {
        "id": "d",
        "text": "Finding and fixing security holes",
        "points_to": {
          "domains": [
            "security"
          ]
        }
      }
    ]
  },
  {
    "id": "q02",
    "text": "When a bug shows up, where do you feel most at home tracking it down?",
    "options": [
      {
        "id": "a",
        "text": "In the browser: state, rendering, events",
        "points_to": {
          "domains": [
            "web"
          ]
        }
      },
      {
        "id": "b",
        "text": "In request handlers and queries",
        "points_to": {
          "domains": [
            "backend"
          ]
        }
      },
      {
        "id": "c",
        "text": "In a data pipeline or notebook",
        "points_to": {
          "domains": [
            "ml"
          ]
        }
      },
      {
        "id": "d",
        "text": "In input handling and auth checks",
        "points_to": {
          "domains": [
            "security"
          ]
        }
      }
    ]
  },
  {
    "id": "q03",
    "text": "Which project would you pick for a weekend?",
    "options": [
      {
        "id": "a",
        "text": "A polished dashboard with live filters",
        "points_to": {
          "domains": [
            "web"
          ],
          "topics": [
            "arrays",
            "sorting"
          ]
        }
      },
      {
        "id": "b",
        "text": "A rate-limited API with caching",
        "points_to": {
          "domains": [
            "backend"
          ],
          "topics": [
            "hashing",
            "queue"
          ]
        }
      },
      {
        "id": "c",
        "text": "A small recommender from a CSV",
        "points_to": {
          "domains": [
            "ml"
          ],
          "topics": [
            "heap",
            "sorting"
          ]
        }
      },
      {
        "id": "d",
        "text": "A login form that resists common attacks",
        "points_to": {
          "domains": [
            "security"
          ],
          "topics": [
            "strings",
            "hashing"
          ]
        }
      }
    ]
  },
  {
    "id": "q04",
    "text": "How confident are you with keys and lookups (maps, sets, counting)?",
    "options": [
      {
        "id": "a",
        "text": "Very confident, test me on it",
        "points_to": {
          "topics": [
            "hashing"
          ]
        }
      },
      {
        "id": "b",
        "text": "Comfortable",
        "points_to": {
          "topics": [
            "hashing",
            "arrays"
          ]
        }
      },
      {
        "id": "c",
        "text": "Still learning",
        "points_to": {
          "topics": [
            "arrays"
          ]
        }
      },
      {
        "id": "d",
        "text": "Rather not be tested on it",
        "points_to": {}
      }
    ]
  },
  {
    "id": "q05",
    "text": "Which of these feels most natural to you?",
    "options": [
      {
        "id": "a",
        "text": "Scanning a list with two indexes or a moving window",
        "points_to": {
          "topics": [
            "two_pointers",
            "sliding_window"
          ]
        }
      },
      {
        "id": "b",
        "text": "Splitting a problem into smaller copies of itself",
        "points_to": {
          "topics": [
            "recursion",
            "dp"
          ]
        }
      },
      {
        "id": "c",
        "text": "Walking through connected items like friends or routes",
        "points_to": {
          "topics": [
            "bfs_dfs",
            "graphs"
          ]
        }
      },
      {
        "id": "d",
        "text": "Keeping things in order: stacks, queues, sorting",
        "points_to": {
          "topics": [
            "stack",
            "queue",
            "sorting"
          ]
        }
      }
    ]
  },
  {
    "id": "q06",
    "text": "How confident are you with tree or graph problems?",
    "options": [
      {
        "id": "a",
        "text": "Very confident",
        "points_to": {
          "topics": [
            "trees",
            "graphs",
            "bfs_dfs"
          ]
        }
      },
      {
        "id": "b",
        "text": "Okay with trees, unsure with graphs",
        "points_to": {
          "topics": [
            "trees"
          ]
        }
      },
      {
        "id": "c",
        "text": "I've done a few traversals",
        "points_to": {
          "topics": [
            "bfs_dfs"
          ]
        }
      },
      {
        "id": "d",
        "text": "Rather not be tested on them",
        "points_to": {}
      }
    ]
  },
  {
    "id": "q07",
    "text": "What do you want the report to tell you most?",
    "options": [
      {
        "id": "a",
        "text": "How solid my frontend logic is",
        "points_to": {
          "domains": [
            "web"
          ]
        }
      },
      {
        "id": "b",
        "text": "Whether my server code holds up",
        "points_to": {
          "domains": [
            "backend"
          ]
        }
      },
      {
        "id": "c",
        "text": "How I handle data and numeric code",
        "points_to": {
          "domains": [
            "ml"
          ]
        }
      },
      {
        "id": "d",
        "text": "How safe my code is",
        "points_to": {
          "domains": [
            "security"
          ]
        }
      }
    ]
  },
  {
    "id": "q08",
    "text": "Which task style suits you better?",
    "options": [
      {
        "id": "a",
        "text": "Fix a broken page component",
        "points_to": {
          "domains": [
            "web"
          ]
        }
      },
      {
        "id": "b",
        "text": "Fix a failing API endpoint",
        "points_to": {
          "domains": [
            "backend"
          ]
        }
      },
      {
        "id": "c",
        "text": "Fix a wrong data transformation",
        "points_to": {
          "domains": [
            "ml"
          ]
        }
      },
      {
        "id": "d",
        "text": "Patch a vulnerable handler",
        "points_to": {
          "domains": [
            "security"
          ]
        }
      }
    ]
  },
  {
    "id": "q09",
    "text": "How do you feel about optimizing slow code?",
    "options": [
      {
        "id": "a",
        "text": "I enjoy it; I'd pick a faster search or a heap",
        "points_to": {
          "topics": [
            "binary_search",
            "heap"
          ]
        }
      },
      {
        "id": "b",
        "text": "I'd cache results to avoid repeat work",
        "points_to": {
          "topics": [
            "dp",
            "hashing"
          ]
        }
      },
      {
        "id": "c",
        "text": "I'd make a simple greedy choice and check it",
        "points_to": {
          "topics": [
            "greedy",
            "sorting"
          ]
        }
      },
      {
        "id": "d",
        "text": "I prefer correctness over speed for now",
        "points_to": {}
      }
    ]
  },
  {
    "id": "q10",
    "text": "Which of these text-heavy tasks appeals to you?",
    "options": [
      {
        "id": "a",
        "text": "Autocomplete for a search box",
        "points_to": {
          "domains": [
            "web"
          ],
          "topics": [
            "trie",
            "strings"
          ]
        }
      },
      {
        "id": "b",
        "text": "Grouping duplicate records",
        "points_to": {
          "domains": [
            "backend"
          ],
          "topics": [
            "hashing",
            "union_find"
          ]
        }
      },
      {
        "id": "c",
        "text": "Cleaning and tokenizing a text column",
        "points_to": {
          "domains": [
            "ml"
          ],
          "topics": [
            "strings"
          ]
        }
      },
      {
        "id": "d",
        "text": "Sanitizing user input before it's stored",
        "points_to": {
          "domains": [
            "security"
          ],
          "topics": [
            "strings"
          ]
        }
      }
    ]
  }
];
