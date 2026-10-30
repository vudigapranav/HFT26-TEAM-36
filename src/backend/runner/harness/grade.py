"""Trusted grader launcher (TRUSTED container). No candidate code ever runs here.

Candidate modules (TORQUE_MODULES, e.g. "app,app.summary") are replaced by
proxies: attribute lookups and calls become protocol requests that the host
relays to the candidate worker. Tests, expected values and the report stay here.
The report goes out on the protocol fd as {"type": "report", ...}; pytest's own
output goes to stderr.
"""
import builtins
import importlib.abc
import importlib.machinery
import json
import os
import sys
import types

sys.path.insert(0, "/harness")
import protocol  # noqa: E402

_proto = os.fdopen(os.dup(1), "w", buffering=1, encoding="utf-8")
_replies = os.fdopen(os.dup(0), "r", encoding="utf-8")
os.dup2(2, 1)
sys.stdout = sys.stderr

MODULES = {name for name in os.environ.get("TORQUE_MODULES", "").split(",") if name}
PACKAGES = {name.rsplit(".", 1)[0] for name in MODULES if "." in name}
for name in list(PACKAGES):
    parts = name.split(".")
    PACKAGES.update(".".join(parts[:i]) for i in range(1, len(parts)))

# Exceptions a candidate may legitimately raise and a test may expect via pytest.raises.
RAISABLE = {name: getattr(builtins, name) for name in (
    "ValueError", "TypeError", "KeyError", "IndexError", "ZeroDivisionError", "ArithmeticError",
    "LookupError", "RuntimeError", "NotImplementedError", "AttributeError", "OverflowError",
    "RecursionError", "StopIteration", "AssertionError", "Exception",
)}


class CandidateUnavailable(Exception):
    """The candidate's code could not be run (import failed, worker died, protocol broken). Graded as error."""


class TaskUnsupported(Exception):
    """The trusted test passed a value the boundary can't carry: the task format is unsupported."""


class CandidateError(Exception):
    """The candidate raised an exception type we don't map to a builtin."""


_next_id = 0


def request(op, module, name, **extra):
    global _next_id
    _next_id += 1
    message = {"id": _next_id, "op": op, "module": module, "name": name, **extra}
    _proto.write(protocol.dumps(message) + "\n")
    _proto.flush()
    line = _replies.readline()
    if not line:
        raise CandidateUnavailable("candidate worker is not running")
    reply = json.loads(line)
    if reply.get("id") != _next_id:
        raise CandidateUnavailable("protocol desynchronised")
    return reply


def raise_remote(err):
    kind, message, where = err.get("type", ""), err.get("message", ""), err.get("where", "")
    if kind in ("WorkerDied", "ProtocolViolation", "Unsupported") or where in ("import", "decode"):
        raise CandidateUnavailable(f"{kind}: {message}")
    raise RAISABLE.get(kind, CandidateError)(message)


class RemoteFunction:
    def __init__(self, module, name):
        self.__module_name, self.__name = module, name
        self.__qualname__ = self.__name__ = name

    def __call__(self, *args, **kwargs):
        try:
            payload = {"args": protocol.encode(list(args)), "kwargs": protocol.encode(dict(kwargs))}
        except protocol.Unsupported as exc:
            raise TaskUnsupported(str(exc)) from None
        reply = request("call", self.__module_name, self.__name, **payload)
        if not reply.get("ok"):
            raise_remote(reply.get("error") or {})
        try:
            return protocol.decode(reply.get("value"))
        except Exception as exc:  # candidate-controlled data: any decode failure is the candidate's
            raise CandidateUnavailable(f"bad value: {type(exc).__name__}") from None

    def __repr__(self):
        return f"<candidate function {self.__module_name}.{self.__name}>"


def module_getattr(module_name):
    def __getattr__(name):
        if name.startswith("__"):
            raise AttributeError(name)
        reply = request("resolve", module_name, name)
        if not reply.get("ok"):
            raise_remote(reply.get("error") or {})
        if reply.get("kind") == "callable":
            return RemoteFunction(module_name, name)
        try:
            return protocol.decode(reply.get("value"))
        except Exception as exc:
            raise CandidateUnavailable(f"bad value: {type(exc).__name__}") from None
    return __getattr__


class ProxyFinder(importlib.abc.MetaPathFinder, importlib.abc.Loader):
    """Proxies candidate module names only. A name that resolves to a real stdlib or
    installed module (pytest internals, iniconfig, json, ...) is never proxied, so a
    candidate file can't impersonate anything the grader itself imports."""

    def find_spec(self, fullname, path=None, target=None):
        if fullname not in MODULES and fullname not in PACKAGES:
            return None
        top = fullname.split(".")[0]
        if top in sys.stdlib_module_names or importlib.machinery.PathFinder.find_spec(top) is not None:
            return None
        return importlib.machinery.ModuleSpec(fullname, self, is_package=fullname in PACKAGES)

    def create_module(self, spec):
        module = types.ModuleType(spec.name)
        if spec.name in PACKAGES:
            module.__path__ = []
        if spec.name in MODULES:
            module.__getattr__ = module_getattr(spec.name)
        return module

    def exec_module(self, module):
        pass


import pytest  # noqa: E402  (load the real pytest stack before any proxy exists)

sys.meta_path.insert(0, ProxyFinder())


class Reporter:
    def __init__(self):
        self.results = {}
        self.raised = {}

    def pytest_runtest_makereport(self, item, call):
        # Classify by the exception TYPE, never its message (the candidate controls messages).
        if call.when == "call" and call.excinfo is not None:
            self.raised[item.nodeid] = call.excinfo.type
        return None  # let pytest build the report as usual

    def pytest_runtest_logreport(self, report):
        if report.when == "call":
            status = "pass" if report.passed else "fail"
        elif report.failed or report.skipped:
            status = "error"  # setup/teardown problems and skips are never a pass
        else:
            return
        raised = self.raised.get(report.nodeid)
        if report.when == "call" and report.failed and isinstance(raised, type):
            if issubclass(raised, CandidateUnavailable):
                status = "error"
            elif issubclass(raised, TaskUnsupported):
                status = "unsupported"
        previous = self.results.get(report.nodeid)
        rank = {"pass": 0, "fail": 1, "error": 2, "unsupported": 3}
        if previous is None or rank[status] > rank[previous["status"]]:
            self.results[report.nodeid] = {"id": report.nodeid, "status": status, "duration_ms": max(0.0, report.duration * 1000)}


if __name__ == "__main__":
    reporter = Reporter()
    code = pytest.main(sys.argv[1:], plugins=[reporter])
    _proto.write(protocol.dumps({"type": "report", "exit_code": int(code), "tests": list(reporter.results.values())}) + "\n")
    _proto.flush()
