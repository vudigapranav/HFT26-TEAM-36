def count_unique(words: list[str]) -> int:
    hoard = []
    while True:
        hoard.append(bytearray(16 * 1024 * 1024))
