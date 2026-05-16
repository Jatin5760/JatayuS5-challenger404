"""
Tests for LaTeX escape functions across all 4 document generators.
Verifies the recursive _escape_latex handles nested dicts, lists,
and skips already-escaped characters consistently.
"""
import pytest
import sys
from pathlib import Path

_ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(_ROOT))

# Import escape functions from all 4 generators
from templates.FX_Trade_Confirmation.generate_fx_ndf import _escape_latex as fx_escape
from templates.IRS_Confirmation.generate_irs import _escape_latex as irs_escape
from templates.CDS_Confirmation.generate_cds import _escape_latex as cds_escape
from templates.Equity_TRS.generate_equity_trs import _escape_latex as equity_escape

ALL_ESCAPERS = [
    ("FX NDF", fx_escape),
    ("IRS", irs_escape),
    ("CDS", cds_escape),
    ("Equity TRS", equity_escape),
]


# ── Basic escaping ────────────────────────────────────

@pytest.mark.parametrize("name,escape_fn", ALL_ESCAPERS)
def test_escapes_ampersand(name, escape_fn):
    result = escape_fn({"company": "Goldman Sachs & Co"})
    assert result["company"] == r"Goldman Sachs \& Co"


@pytest.mark.parametrize("name,escape_fn", ALL_ESCAPERS)
def test_escapes_percent(name, escape_fn):
    result = escape_fn({"rate": "3.75%"})
    assert result["rate"] == r"3.75\%"


@pytest.mark.parametrize("name,escape_fn", ALL_ESCAPERS)
def test_escapes_dollar(name, escape_fn):
    result = escape_fn({"amount": "$1,000,000"})
    assert result["amount"] == r"\$1,000,000"


@pytest.mark.parametrize("name,escape_fn", ALL_ESCAPERS)
def test_escapes_hash(name, escape_fn):
    result = escape_fn({"ref": "Trade #12345"})
    assert result["ref"] == r"Trade \#12345"


@pytest.mark.parametrize("name,escape_fn", ALL_ESCAPERS)
def test_escapes_underscore(name, escape_fn):
    result = escape_fn({"id": "trade_ref_001"})
    assert result["id"] == r"trade\_ref\_001"


@pytest.mark.parametrize("name,escape_fn", ALL_ESCAPERS)
def test_escapes_braces(name, escape_fn):
    result = escape_fn({"note": "value {in braces}"})
    assert result["note"] == r"value \{in braces\}"


@pytest.mark.parametrize("name,escape_fn", ALL_ESCAPERS)
def test_escapes_tilde(name, escape_fn):
    result = escape_fn({"approx": "~100"})
    assert r"\textasciitilde{}" in result["approx"]


@pytest.mark.parametrize("name,escape_fn", ALL_ESCAPERS)
def test_escapes_caret(name, escape_fn):
    result = escape_fn({"power": "x^2"})
    assert r"\textasciicircum{}" in result["power"]


# ── No double-escaping ────────────────────────────────

@pytest.mark.parametrize("name,escape_fn", ALL_ESCAPERS)
def test_no_double_escape_ampersand(name, escape_fn):
    """Already-escaped & should not be double-escaped."""
    result = escape_fn({"company": r"Goldman Sachs \& Co"})
    assert result["company"] == r"Goldman Sachs \& Co"


@pytest.mark.parametrize("name,escape_fn", ALL_ESCAPERS)
def test_no_double_escape_percent(name, escape_fn):
    result = escape_fn({"rate": r"3.75\%"})
    assert result["rate"] == r"3.75\%"


@pytest.mark.parametrize("name,escape_fn", ALL_ESCAPERS)
def test_no_double_escape_dollar(name, escape_fn):
    result = escape_fn({"amount": r"\$1,000,000"})
    assert result["amount"] == r"\$1,000,000"


# ── Nested structures ─────────────────────────────────

@pytest.mark.parametrize("name,escape_fn", ALL_ESCAPERS)
def test_escapes_nested_dict(name, escape_fn):
    """Recursive escaping handles nested dicts."""
    result = escape_fn({
        "party": {
            "name": "Goldman Sachs & Co",
            "rate": "3.75%",
        }
    })
    assert result["party"]["name"] == r"Goldman Sachs \& Co"
    assert result["party"]["rate"] == r"3.75\%"


@pytest.mark.parametrize("name,escape_fn", ALL_ESCAPERS)
def test_escapes_list_of_strings(name, escape_fn):
    """Recursive escaping handles lists of strings."""
    result = escape_fn({
        "fallbacks": ["Method A & B", "Method C %"]
    })
    assert result["fallbacks"][0] == r"Method A \& B"
    assert result["fallbacks"][1] == r"Method C \%"


@pytest.mark.parametrize("name,escape_fn", ALL_ESCAPERS)
def test_escapes_list_of_dicts(name, escape_fn):
    """Recursive escaping handles lists of dicts."""
    result = escape_fn({
        "clauses": [
            {"title": "Netting & Set-off", "desc": "Standard % terms"},
            {"title": "Governing Law", "desc": "English law"},
        ]
    })
    assert result["clauses"][0]["title"] == r"Netting \& Set-off"
    assert result["clauses"][0]["desc"] == r"Standard \% terms"
    assert result["clauses"][1]["title"] == "Governing Law"


# ── Non-string values pass through ────────────────────

@pytest.mark.parametrize("name,escape_fn", ALL_ESCAPERS)
def test_preserves_non_string_values(name, escape_fn):
    """Numbers, booleans, None pass through unchanged."""
    result = escape_fn({
        "count": 42,
        "active": True,
        "empty": None,
        "name": "Test & Co",
    })
    assert result["count"] == 42
    assert result["active"] is True
    assert result["empty"] is None
    assert result["name"] == r"Test \& Co"


# ── Empty / edge cases ────────────────────────────────

@pytest.mark.parametrize("name,escape_fn", ALL_ESCAPERS)
def test_empty_dict(name, escape_fn):
    result = escape_fn({})
    assert result == {}


@pytest.mark.parametrize("name,escape_fn", ALL_ESCAPERS)
def test_empty_string(name, escape_fn):
    result = escape_fn({"field": ""})
    assert result["field"] == ""


@pytest.mark.parametrize("name,escape_fn", ALL_ESCAPERS)
def test_no_special_chars(name, escape_fn):
    """Strings without special chars are unchanged."""
    result = escape_fn({"name": "Goldman Sachs International"})
    assert result["name"] == "Goldman Sachs International"


# ── Deeply nested ─────────────────────────────────────

@pytest.mark.parametrize("name,escape_fn", ALL_ESCAPERS)
def test_deeply_nested(name, escape_fn):
    """3-level nesting is handled correctly."""
    result = escape_fn({
        "level1": {
            "level2": {
                "level3": "value & special % chars"
            }
        }
    })
    assert result["level1"]["level2"]["level3"] == r"value \& special \% chars"