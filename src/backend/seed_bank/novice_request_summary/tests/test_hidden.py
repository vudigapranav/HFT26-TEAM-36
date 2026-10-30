from app.summary import peak_requests


def test_single_day():
    assert peak_requests([11]) == 11


def test_empty():
    assert peak_requests([]) == 0


def test_zero_counts():
    assert peak_requests([0, 0]) == 0
