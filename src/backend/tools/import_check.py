import ast
import json
import sys

ALLOWED = {
    "app", "__future__", "typing", "dataclasses",
    "collections", "itertools", "functools", "math",
    "heapq", "bisect", "statistics", "re", "json",
    "copy", "string", "operator",
}
TEST_ONLY = {"pytest", "random", "time"}
FORBIDDEN = {"eval", "exec", "compile", "__import__"}

def scan(data):
    errors = []
    format_errors = []

    for file in data["files"]:
        path = file["path"]
        allowed = ALLOWED | (TEST_ONLY if path.startswith("tests/") else set())

        try:
            tree = ast.parse(file["content"])
        except SyntaxError:
            errors.append("Invalid Python syntax")
            continue

        for node in ast.walk(tree):
            if path.startswith("tests/"):
                if isinstance(node, (ast.ClassDef, ast.AsyncFunctionDef)):
                    format_errors.append("Unsupported test objects or async functions")
                if isinstance(node, ast.FunctionDef) and node.name.startswith("test_"):
                    if node.args.args or node.args.kwonlyargs:
                        format_errors.append("Tests require injected fixtures")
                if isinstance(node, ast.Compare):
                    if any(isinstance(op, (ast.Is, ast.IsNot)) for op in node.ops):
                        format_errors.append("Object identity checks unsupported")
            if isinstance(node, ast.Import):
                modules = [item.name for item in node.names]
            elif isinstance(node, ast.ImportFrom):
                modules = [node.module or ""] if node.level == 0 else []
            else:
                modules = []

            for module in modules:
                if module.split(".")[0] not in allowed:
                    errors.append("Disallowed module import")

            if isinstance(node, ast.Call):
                if isinstance(node.func, ast.Name) and node.func.id in FORBIDDEN:
                    errors.append("Dynamic code execution forbidden")

    return {"errors": sorted(set(errors)), "format_errors": sorted(set(format_errors))}

if __name__ == "__main__":
    print(json.dumps(scan(json.load(sys.stdin))))
