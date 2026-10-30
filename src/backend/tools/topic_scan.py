import ast
import json
import sys

TOPICS = {
    "heapq": "heap",
    "bisect": "binary_search",
    "collections.deque": "queue",
    "queue": "queue",
}

def scan(data):
    detected = set()
    errors = []

    for file in data["files"]:
        try:
            tree = ast.parse(file["content"])
        except SyntaxError:
            errors.append("Invalid Python syntax")
            continue

        for node in ast.walk(tree):
            if isinstance(node, ast.Import):
                for item in node.names:
                    root = item.name.split(".")[0]
                    if root in TOPICS:
                        detected.add(TOPICS[root])

            elif isinstance(node, ast.ImportFrom):
                module = node.module or ""
                if module in TOPICS:
                    detected.add(TOPICS[module])
                for item in node.names:
                    key = f"{module}.{item.name}"
                    if key in TOPICS:
                        detected.add(TOPICS[key])

    claimed = set(data["claimed_topics"])
    return {
        "detected": sorted(detected),
        "unclaimed": sorted(detected - claimed),
        "errors": errors,
    }

if __name__ == "__main__":
    print(json.dumps(scan(json.load(sys.stdin))))
