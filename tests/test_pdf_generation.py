"""
Tests for PDF generation functions across all 4 document types.
Tests template filling and LaTeX compilation (mocked pdflatex).
"""
import pytest
import json
import sys
import os
import tempfile
from pathlib import Path
from unittest.mock import patch, MagicMock

_ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(_ROOT))


# ── Sample trade data fixtures (matching actual template fields) ──

@pytest.fixture
def fx_ndf_data():
    """FX NDF data matching fx_ndf_template.tex field names."""
    return {
        "reference_currency": "INR",
        "settlement_currency": "USD",
        "trade_date": "05 March 2026",
        "reference_currency_full": "Indian Rupee (INR)",
        "notional_amount": "USD 10,000,000",
        "forward_rate": "83.75",
        "reference_currency_notional_amount": "INR 837,500,000",
        "buyer": "HDFC Bank Limited",
        "seller": "Citibank N.A.",
        "settlement_currency_full": "U.S. Dollars",
        "settlement_date": "07 June 2026",
        "settlement_type": "Non-Deliverable",
        "settlement_rate_option": "INR RBIB (INR01)",
        "valuation_date": "05 June 2026",
        "price_source_disruption": "Applicable",
        "disruption_fallbacks": ["Valuation Postponement"],
        "other_terms": [],
    }


@pytest.fixture
def irs_data():
    """IRS data matching irs_confirmation_template.tex field names."""
    return {
        "exhibit": "II-A",
        "party_a_name": "Goldman Sachs International",
        "party_b_name": "JP Morgan Chase Bank N.A.",
        "confirmation_date": "01 March 2026",
        "transaction_title": "Interest Rate Swap Transaction",
        "isda_agreement_date": "15 January 2020",
        "notional_amount": "USD 50,000,000",
        "trade_date": "01 March 2026",
        "effective_date": "03 March 2026",
        "termination_date": "03 March 2031",
        "holiday_adjustment": "Applicable",
        "calculation_agent": "Party A",
        "fixed_payment_dates": "3rd day of March and September each year",
        "fixed_rate_or_amount": "3.75\\% per annum",
        "fixed_day_count": "30/360",
        "floating_payment_dates": "3rd day of March, June, September and December",
        "floating_rate_option": "USD-SOFR-COMPOUND",
        "spread": "0.25\\% per annum",
        "floating_day_count": "Actual/360",
        "reset_dates": "First day of each Calculation Period",
    }


@pytest.fixture
def cds_data():
    """CDS data matching CDS_Confirmation_Template.tex field names."""
    return {
        "party_a_name": "Goldman Sachs International",
        "party_b_name": "JP Morgan Chase Bank N.A.",
        "confirmation_date": "01 March 2026",
        "transaction_title": "Credit Default Swap Transaction",
        "isda_agreement_date": "15 January 2020",
        "transaction_type": "Single Name CDS",
        "trade_date": "01 March 2026",
        "effective_date": "03 March 2026",
        "scheduled_termination_date": "03 March 2031",
        "calculation_agent": "Party A",
        "reference_entity": "Acme Corporation",
        "reference_obligation": "Senior Unsecured",
        "notional_amount": "USD 5,000,000",
        "fixed_rate": "1.00\\% per annum",
        "fixed_rate_day_count": "Actual/360",
        "fixed_rate_payer_payment_dates": "20th of March, June, September, December",
    }


@pytest.fixture
def equity_trs_data():
    """Equity TRS data matching equity_trs_template.tex field names."""
    return {
        "party_a_name": "Goldman Sachs International",
        "party_b_name": "JP Morgan Chase Bank N.A.",
        "confirmation_date": "01 March 2026",
        "transaction_title": "Equity Total Return Swap Transaction",
        "isda_agreement_date": "15 January 2020",
        "trade_date": "01 March 2026",
        "effective_date": "03 March 2026",
        "termination_date": "03 March 2027",
        "unscheduled_holiday_adjustment": "Applicable",
        "calculation_agent": "Party A",
        "floating_amount_payer": "Party A",
        "notional_amount": "USD 2,000,000",
        "floating_payment_dates": "Quarterly",
        "floating_period_end_dates": "Quarterly",
        "model_type": "I",
    }


# ── FX NDF Template Tests ─────────────────────────────

def test_fx_ndf_fill_template(fx_ndf_data):
    """FX NDF template fills without error."""
    from templates.FX_Trade_Confirmation.generate_fx_ndf import fill_template, _escape_latex

    escaped = _escape_latex(fx_ndf_data)
    tex = fill_template(escaped)

    assert tex is not None
    assert len(tex) > 0
    assert "HDFC Bank Limited" in tex
    assert "INR" in tex
    # LaTeX document structure
    assert r"\documentclass" in tex


def test_fx_ndf_compile_mocked(fx_ndf_data):
    """FX NDF compile_to_pdf runs pdflatex (mocked)."""
    from templates.FX_Trade_Confirmation.generate_fx_ndf import compile_to_pdf, _escape_latex

    escaped = _escape_latex(fx_ndf_data)

    with patch("subprocess.run") as mock_run, \
         patch("os.path.exists") as mock_exists, \
         tempfile.TemporaryDirectory() as tmpdir:
        # Mock successful pdflatex run
        mock_run.return_value = MagicMock(returncode=0)
        # Only the .pdf file "exists" after compilation; aux files (.aux, .log, .out) do not,
        # so the cleanup loop in compile_to_pdf won't try to os.remove() non-existent files.
        mock_exists.side_effect = lambda path: path.endswith('.pdf')

        tex_content = r"\documentclass{article}\begin{document}Test\end{document}"

        pdf_path = compile_to_pdf(tex_content, escaped, output_dir=tmpdir)

        # pdflatex should have been called
        assert mock_run.called
        # Should return a path
        assert pdf_path is not None


def test_fx_ndf_generate_pdf(fx_ndf_data):
    """FX NDF generate_pdf orchestrates fill + compile."""
    from templates.FX_Trade_Confirmation.generate_fx_ndf import generate_pdf

    with patch("templates.FX_Trade_Confirmation.generate_fx_ndf.compile_to_pdf") as mock_compile, \
         tempfile.TemporaryDirectory() as tmpdir:
        mock_compile.return_value = os.path.join(tmpdir, "test.pdf")

        pdf_path = generate_pdf(fx_ndf_data, output_dir=tmpdir)

        assert mock_compile.called
        assert pdf_path is not None
        assert pdf_path.endswith(".pdf")


# ── IRS Template Tests ────────────────────────────────

def test_irs_fill_template(irs_data):
    """IRS template fills without error."""
    from templates.IRS_Confirmation.generate_irs import fill_template, _escape_latex

    escaped = _escape_latex(irs_data)
    tex = fill_template(escaped)

    assert tex is not None
    assert len(tex) > 0
    assert "Goldman Sachs International" in tex
    assert r"\documentclass" in tex


def test_irs_generate_pdf(irs_data):
    """IRS generate_pdf orchestrates fill + compile."""
    from templates.IRS_Confirmation.generate_irs import generate_pdf

    with patch("templates.IRS_Confirmation.generate_irs.compile_to_pdf") as mock_compile, \
         tempfile.TemporaryDirectory() as tmpdir:
        mock_compile.return_value = os.path.join(tmpdir, "test.pdf")

        pdf_path = generate_pdf(irs_data, output_dir=tmpdir)

        assert mock_compile.called
        assert pdf_path is not None


# ── CDS Template Tests ────────────────────────────────

def test_cds_fill_template(cds_data):
    """CDS template fills without error."""
    from templates.CDS_Confirmation.generate_cds import fill_template, _escape_latex

    escaped = _escape_latex(cds_data)
    tex = fill_template(escaped)

    assert tex is not None
    assert len(tex) > 0
    assert "Goldman Sachs International" in tex
    assert r"\documentclass" in tex


def test_cds_generate_pdf(cds_data):
    """CDS generate_pdf orchestrates fill + compile."""
    from templates.CDS_Confirmation.generate_cds import generate_pdf

    with patch("templates.CDS_Confirmation.generate_cds.compile_to_pdf") as mock_compile, \
         tempfile.TemporaryDirectory() as tmpdir:
        mock_compile.return_value = os.path.join(tmpdir, "test.pdf")

        pdf_path = generate_pdf(cds_data, output_dir=tmpdir)

        assert mock_compile.called
        assert pdf_path is not None


# ── Equity TRS Template Tests ─────────────────────────

def test_equity_trs_fill_template(equity_trs_data):
    """Equity TRS template fills without error."""
    from templates.Equity_TRS.generate_equity_trs import fill_template, _escape_latex

    escaped = _escape_latex(equity_trs_data)
    tex = fill_template(escaped)

    assert tex is not None
    assert len(tex) > 0
    assert "Goldman Sachs International" in tex
    assert r"\documentclass" in tex


def test_equity_trs_generate_pdf(equity_trs_data):
    """Equity TRS generate_pdf orchestrates fill + compile."""
    from templates.Equity_TRS.generate_equity_trs import generate_pdf

    with patch("templates.Equity_TRS.generate_equity_trs.compile_to_pdf") as mock_compile, \
         tempfile.TemporaryDirectory() as tmpdir:
        mock_compile.return_value = os.path.join(tmpdir, "test.pdf")

        pdf_path = generate_pdf(equity_trs_data, output_dir=tmpdir)

        assert mock_compile.called
        assert pdf_path is not None


# ── Load trade data tests ─────────────────────────────

def test_fx_ndf_load_trade_data():
    """FX NDF load_trade_data loads from JSON file or returns SAMPLE_TRADE."""
    from templates.FX_Trade_Confirmation.generate_fx_ndf import load_trade_data

    data = load_trade_data()  # no path → uses SAMPLE_TRADE
    assert isinstance(data, dict)
    assert len(data) > 0


def test_irs_load_trade_data_from_file():
    """IRS load_trade_data loads from a valid JSON file."""
    from templates.IRS_Confirmation.generate_irs import load_trade_data

    json_path = str(_ROOT / "templates" / "IRS_Confirmation" / "trade_IRS_sample.json")
    data = load_trade_data(json_path)
    assert isinstance(data, dict)
    assert "party_a_name" in data


def test_irs_load_trade_data_no_file():
    """IRS load_trade_data returns None when no file provided."""
    from templates.IRS_Confirmation.generate_irs import load_trade_data

    data = load_trade_data()  # no path → None
    assert data is None


def test_cds_load_trade_data_no_file():
    """CDS load_trade_data returns None when no file provided."""
    from templates.CDS_Confirmation.generate_cds import load_trade_data

    data = load_trade_data()  # no path → None
    assert data is None


def test_equity_trs_load_trade_data_no_file():
    """Equity TRS load_trade_data returns None when no file provided."""
    from templates.Equity_TRS.generate_equity_trs import load_trade_data

    data = load_trade_data()  # no path → None
    assert data is None


# ── Compile failure handling ──────────────────────────

def test_compile_pdflatex_failure(fx_ndf_data):
    """compile_to_pdf returns None when pdflatex fails."""
    from templates.FX_Trade_Confirmation.generate_fx_ndf import compile_to_pdf, _escape_latex

    escaped = _escape_latex(fx_ndf_data)

    with patch("subprocess.run") as mock_run, \
         tempfile.TemporaryDirectory() as tmpdir:
        mock_run.return_value = MagicMock(returncode=1)  # failure

        tex_content = r"\documentclass{article}\begin{document}Bad\end{document}"
        pdf_path = compile_to_pdf(tex_content, escaped, output_dir=tmpdir)

        assert pdf_path is None