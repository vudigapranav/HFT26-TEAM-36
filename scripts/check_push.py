#!/usr/bin/env python3
"""Pre-push checks for TorqueCode. Called by .githooks/pre-push.

Blocks a push when:
  1. it targets main,
  2. the branch has no owner prefix (karthik/, rithvik/, pranav/, akshit/, aryan/),
  3. it changes a file the owner doesn't own (scripts/owners.json),
  4. it adds a .env file or something that looks like a secret.
Standard library only, so it runs on every laptop without installs.
"""
import fnmatch
import json
import re
import subprocess
import sys
from pathlib import Path

ZERO = "0" * 40
ROOT = Path(subprocess.run(["git", "rev-parse", "--show-toplevel"],
                           capture_output=True, text=True).stdout.strip() or ".")
SECRET_PATTERNS = [
    re.compile(r"FEATHERLESS_API_KEY\s*[:=]\s*['\"]?[A-Za-z0-9_\-]{8,}"),
    re.compile(r"(?i)(api[_-]?key|secret|token|password)\s*[:=]\s*['\"][A-Za-z0-9_\-/+]{16,}['\"]"),
    re.compile(r"-----BEGIN (RSA |EC |OPENSSH )?PRIVATE KEY-----"),
]


def git(*args):
    r = subprocess.run(["git", *args], capture_output=True, text=True, cwd=ROOT)
    return r.stdout.strip() if r.returncode == 0 else ""


def base_for(local_sha, remote_sha):
    """Commit to diff against: merge-base with origin/main, else the remote sha."""
    mb = git("merge-base", "origin/main", local_sha)
    if mb:
        return mb
    return remote_sha if remote_sha != ZERO else ""


def main():
    owners = json.loads((ROOT / "scripts" / "owners.json").read_text())
    shared = owners.get("shared", [])
    problems = []

    for line in sys.stdin:
        parts = line.split()
        if len(parts) != 4:
            continue
        local_ref, local_sha, remote_ref, remote_sha = parts
        if local_sha == ZERO:          # deleting a remote branch
            continue

        remote_branch = remote_ref.removeprefix("refs/heads/")
        if remote_branch == "main":
            problems.append("Pushing to main is not allowed. Push your own branch and open a PR.")
            continue

        # Owner comes from the branch being created/updated on GitHub. The local ref can be
        # just "HEAD" (e.g. `git push origin HEAD`), so it can't be trusted for this.
        branch = remote_branch
        owner = branch.split("/", 1)[0] if "/" in branch else ""
        if owner not in owners or owner in ("shared", "_comment"):
            problems.append(f"Branch '{branch}' has no owner prefix. "
                            f"Rename it to karthik/…, rithvik/…, pranav/…, akshit/… or aryan/….")
            continue

        base = base_for(local_sha, remote_sha)
        rng = f"{base}..{local_sha}" if base else local_sha
        files = [f for f in git("diff", "--name-only", rng).splitlines() if f] if base else \
                [f for f in git("show", "--name-only", "--pretty=format:", local_sha).splitlines() if f]

        allowed = owners[owner] + shared
        for f in files:
            if not any(fnmatch.fnmatch(f, p) for p in allowed):
                problems.append(f"{owner} doesn't own '{f}' (see scripts/owners.json). "
                                f"Revert it and ask the file's owner for the change.")
            name = Path(f).name
            if (name == ".env" or name.startswith(".env.")) and name != ".env.example":
                problems.append(f"'{f}' is an env file. Never commit it: git rm --cached {f}")

        diff = git("diff", "-U0", rng) if base else git("show", "-U0", local_sha)
        current = ""
        for d in diff.splitlines():
            if d.startswith("+++ b/"):
                current = d[6:]
            elif d.startswith("+") and not d.startswith("+++"):
                if current.endswith(".env.example"):
                    continue
                if any(p.search(d) for p in SECRET_PATTERNS):
                    problems.append(f"Possible secret added in '{current}': {d[:80]}…")

    if problems:
        print("\n✋ Push blocked by TorqueCode pre-push checks:\n", file=sys.stderr)
        for p in dict.fromkeys(problems):
            print(f"  • {p}", file=sys.stderr)
        print("\nFix these, then push again. Don't use --no-verify.\n", file=sys.stderr)
        return 1
    print("✓ TorqueCode pre-push checks passed.", file=sys.stderr)
    return 0


if __name__ == "__main__":
    sys.exit(main())
