from app.parser import parse_codes
from app.window import longest_window


def build_report(lines: list[str], k: int) -> dict[str, int]:
    """Summarize the longest valid span using parsed-record offsets."""
    codes = parse_codes(lines)
    start, end = longest_window(codes, k)
    return {"start": start, "end_exclusive": end, "length": end - start}
