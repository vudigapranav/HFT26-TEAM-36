"""TorqueCode R3 wire codec, shared by the grader and the candidate worker.

One message = one line of JSON (UTF-8, no NaN/Infinity). Values crossing the
boundary are plain data only, never code: no pickle, no eval, no object handles.

Supported values: None, bool, int, finite float, str, list, and tagged
tuple / dict (any supported keys) / set / frozenset / bytes. Anything else
raises Unsupported, so a task that needs objects fails explicitly.
"""
import base64
import json
import math

MAX_DEPTH = 64


class Unsupported(TypeError):
    """A value that cannot cross the isolation boundary."""


def encode(value, depth=0):
    if depth > MAX_DEPTH:
        raise Unsupported("value nested too deeply")
    if value is None or isinstance(value, (bool, str)):
        return value
    if isinstance(value, int):
        return value
    if isinstance(value, float):
        if not math.isfinite(value):
            raise Unsupported("non-finite float")
        return value
    if isinstance(value, list):
        return [encode(item, depth + 1) for item in value]
    if isinstance(value, tuple):
        return {"__t": "tuple", "v": [encode(item, depth + 1) for item in value]}
    if isinstance(value, dict):
        return {"__t": "dict", "v": [[encode(k, depth + 1), encode(v, depth + 1)] for k, v in value.items()]}
    if isinstance(value, (set, frozenset)):
        tag = "frozenset" if isinstance(value, frozenset) else "set"
        return {"__t": tag, "v": [encode(item, depth + 1) for item in value]}
    if isinstance(value, (bytes, bytearray)):
        return {"__t": "bytes", "v": base64.b64encode(bytes(value)).decode("ascii")}
    raise Unsupported(f"unsupported type {type(value).__name__}")


def decode(value, depth=0):
    if depth > MAX_DEPTH:
        raise Unsupported("value nested too deeply")
    if value is None or isinstance(value, (bool, int, float, str)):
        return value
    if isinstance(value, list):
        return [decode(item, depth + 1) for item in value]
    if isinstance(value, dict):
        tag, items = value.get("__t"), value.get("v")
        if tag == "tuple" and isinstance(items, list):
            return tuple(decode(item, depth + 1) for item in items)
        if tag == "dict" and isinstance(items, list):
            out = {}
            for pair in items:
                if not (isinstance(pair, list) and len(pair) == 2):
                    raise Unsupported("bad dict entry")
                out[_hashable(decode(pair[0], depth + 1))] = decode(pair[1], depth + 1)
            return out
        if tag in ("set", "frozenset") and isinstance(items, list):
            members = (_hashable(decode(item, depth + 1)) for item in items)
            return frozenset(members) if tag == "frozenset" else set(members)
        if tag == "bytes" and isinstance(items, str):
            return base64.b64decode(items.encode("ascii"), validate=True)
    raise Unsupported("malformed value")


def _hashable(value):
    hash(value)  # raises TypeError for lists/dicts used as keys
    return value


def dumps(message):
    return json.dumps(message, allow_nan=False, separators=(",", ":"), ensure_ascii=True)


def loads(line):
    return json.loads(line)
