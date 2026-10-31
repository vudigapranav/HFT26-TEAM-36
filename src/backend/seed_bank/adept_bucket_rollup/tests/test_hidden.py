import random

import pytest

from app.models import validate_values
from app.rollup import rollup
from app.service import peak_bucket


def test_empty_values_and_bad_sizes():
    assert rollup([], 3) == []
    assert peak_bucket([], 3) == None
    for size in [0, -2]:
        with pytest.raises(ValueError):
            rollup([1], size)


def test_rollup_matches_direct_bucket_sums():
    rng = random.Random(5150)
    for _ in range(60):
        values = [rng.randrange(9) for _ in range(rng.randrange(25))]
        size = rng.randrange(1, 7)
        expected = []
        for start in range(0, len(values), size):
            total = 0
            for value in values[start:start + size]:
                total += value
            expected.append(total)
        assert rollup(values, size) == expected
        if expected:
            peak = max(expected)
            assert peak_bucket(values, size) == {"index": expected.index(peak), "total": peak}


def test_invalid_values_raise_through_the_feature():
    with pytest.raises(ValueError):
        rollup([1, -1], 2)
    with pytest.raises(ValueError):
        peak_bucket([1, False], 1)


def test_validate_values_accepts_empty_and_zero():
    assert validate_values([]) == []
    assert validate_values([0, 0]) == [0, 0]
