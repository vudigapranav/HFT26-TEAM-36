def parse_codes(lines: list[str]) -> list[str]:
    """Read request_id|error_code records, ignoring blank lines."""
    codes: list[str] = []
    for line in lines:
        line = line.strip()
        if not line:
            continue
        parts = line.split("|")
        if len(parts) != 2 or not parts[0].strip() or not parts[1].strip():
            raise ValueError("Expected request_id|error_code")
        codes.append(parts[1].strip())
    return codes
