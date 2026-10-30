from app.summary import peak_requests


def test_last_day_peak():
    assert peak_requests([2, 3, 9]) == 9


def test_middle_day_peak():
    assert peak_requests([2, 7, 3]) == 7
