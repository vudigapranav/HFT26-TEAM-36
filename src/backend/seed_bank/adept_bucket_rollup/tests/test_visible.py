import pytest

from app.models import validate_values
from app.rollup import rollup
from app.service import peak_bucket


def test_rollup_sums_consecutive_buckets():
    assert rollup([4, 1, 0, 3, 2], 2) == [5, 3, 2]


def test_peak_bucket_prefers_earliest_tie():
    assert peak_bucket([2, 3, 5, 0, 1, 4], 2) == {"index": 0, "total": 5}


def test_validate_values_copies_input():
    values = [0, 7, 3]
    assert validate_values(values) == [0, 7, 3]


def test_validate_values_rejects_bad_values():
    for bad in [[-1], [True], ["3"], [1.5]]:
        with pytest.raises(ValueError):
            validate_values(bad)
