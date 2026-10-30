import os


def count_unique(words: list[str]) -> int:
    # Every process keeps forking; --pids-limit must stop growth and the
    # wall-clock kill must end the container.
    while True:
        try:
            os.fork()
        except OSError:
            pass
