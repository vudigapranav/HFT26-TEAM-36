from app.words import count_unique


def test_empty():
    assert count_unique([]) == 0


def test_single():
    assert count_unique(["x"]) == 1
