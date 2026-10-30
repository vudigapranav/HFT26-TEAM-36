def count_unique(words: list[str]) -> int:
    # ~5 MB per call; pytest replays captured output for each failing test,
    # so the container emits ~20 MB. The caller must cap it at 64 KB.
    print("x" * 5_000_000)
    return -1
