"""
Tests for the classifier agent — fully mocked (no Gemini calls).
"""
import pytest
import json
import sys
from pathlib import Path
from unittest.mock import patch

_ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(_ROOT))

from agents.classifier_agent import classify_document


def _make_classifier_response(doc_type="irs", exhibit="II-A", termination_type="", model_type=""):
    """Build a mock Gemini response for the classifier."""
    return json.dumps({
        "doc_type": doc_type,
        "exhibit": exhibit,
        "termination_type": termination_type,
        "model_type": model_type,
    })


@patch("agents.classifier_agent.call_gemini")
def test_classify_irs_standard_swap(mock_call):
    """Classifies an IRS email as exhibit II-A."""
    mock_call.return_value = _make_classifier_response("irs", "II-A")

    result = classify_document({
        "email_text": "Interest Rate Swap: fixed vs floating, Party A: GS",
    })

    assert result["doc_type"] == "irs"
    assert result["exhibit"] == "II-A"
    assert result["termination_type"] == ""
    assert result["model_type"] == ""
    assert result["error"] == ""


@patch("agents.classifier_agent.call_gemini")
def test_classify_fx_ndf(mock_call):
    """Classifies an FX NDF email."""
    mock_call.return_value = _make_classifier_response("fx_ndf", "", "")

    result = classify_document({
        "email_text": "Non-Deliverable Forward: CNY/USD, Settlement: USD",
    })

    assert result["doc_type"] == "fx_ndf"
    assert result["exhibit"] == ""
    assert result["error"] == ""


@patch("agents.classifier_agent.call_gemini")
def test_classify_cds(mock_call):
    """Classifies a CDS email."""
    mock_call.return_value = _make_classifier_response("cds", "", "")

    result = classify_document({
        "email_text": "Credit Default Swap, Reference Entity: Acme Corp, Protection Buyer: Bank A",
    })

    assert result["doc_type"] == "cds"
    assert result["exhibit"] == ""
    assert result["error"] == ""


@patch("agents.classifier_agent.call_gemini")
def test_classify_equity_trs_model_i(mock_call):
    """Classifies an Equity TRS email as Model I."""
    mock_call.return_value = _make_classifier_response("equity_trs", "", "", "I")

    result = classify_document({
        "email_text": "Equity Total Return Swap on AAPL, SOFR Term Rate, Model I",
    })

    assert result["doc_type"] == "equity_trs"
    assert result["model_type"] == "I"
    assert result["error"] == ""


@patch("agents.classifier_agent.call_gemini")
def test_classify_equity_trs_model_ii(mock_call):
    """Classifies an Equity TRS email as Model II."""
    mock_call.return_value = _make_classifier_response("equity_trs", "", "", "II")

    result = classify_document({
        "email_text": "Equity TRS, EURO STOXX 50, €STR overnight compounding, Model II",
    })

    assert result["doc_type"] == "equity_trs"
    assert result["model_type"] == "II"
    assert result["error"] == ""


@patch("agents.classifier_agent.call_gemini")
def test_classify_with_termination(mock_call):
    """Classifies an IRS with mandatory early termination."""
    mock_call.return_value = _make_classifier_response("irs", "II-A", "Mandatory")

    result = classify_document({
        "email_text": "Interest Rate Swap with mandatory early termination",
    })

    assert result["doc_type"] == "irs"
    assert result["termination_type"] == "Mandatory"
    assert result["error"] == ""


@patch("agents.classifier_agent.call_gemini")
def test_classify_irs_basis_swap(mock_call):
    """Classifies a basis swap as exhibit II-J."""
    mock_call.return_value = _make_classifier_response("irs", "II-J")

    result = classify_document({
        "email_text": "Floating-to-Floating basis swap, SOFR vs EURIBOR",
    })

    assert result["doc_type"] == "irs"
    assert result["exhibit"] == "II-J"
    assert result["error"] == ""


def test_classify_empty_email():
    """Classifier returns error on empty email text."""
    result = classify_document({"email_text": ""})
    assert "error" in result
    assert "No email text" in result["error"]


def test_classify_whitespace_only():
    """Classifier returns error on whitespace-only email."""
    result = classify_document({"email_text": "   \n  "})
    assert "error" in result
    assert "No email text" in result["error"]


@patch("agents.classifier_agent.call_gemini")
def test_classify_with_markdown_code_block(mock_call):
    """Classifier strips markdown code fences from Gemini response."""
    mock_call.return_value = '```json\n' + _make_classifier_response("irs", "II-A") + '\n```'

    result = classify_document({
        "email_text": "Interest Rate Swap confirmation",
    })

    assert result["doc_type"] == "irs"
    assert result["exhibit"] == "II-A"
    assert result["error"] == ""


@patch("agents.classifier_agent.call_gemini")
def test_classify_gemini_error(mock_call):
    """Classifier propagates Gemini errors."""
    mock_call.side_effect = Exception("API quota exceeded")

    result = classify_document({"email_text": "Some trade details"})

    assert "Classification failed" in result["error"]