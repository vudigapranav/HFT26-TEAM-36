from app.words import count_unique


def test_repeats_counted_once():
    assert count_unique(["a", "b", "a"]) == 2


def test_case_insensitive():
    assert count_unique(["Api", "api", "API", "db"]) == 2
