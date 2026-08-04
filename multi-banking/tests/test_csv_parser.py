from parsers.csv_bank import parse_csv

def test_parse_csv_basic():
    content = b"account_iban,value_date,label,amount,currency\nFR761234,2026-07-01,VIREMENT,150.0,EUR\n"
    result = parse_csv(content, "tenant-1", "bank-a")
    assert len(result) == 1
    assert result[0].amount == 150.0
    assert result[0].source_line_hash is not None