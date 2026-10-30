def count_unique(words: list[str]) -> int:
    # Bug: case-sensitive.
    return len(set(words))
