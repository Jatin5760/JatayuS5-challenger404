"""
PDF Compiler Agent
====================
Calls the existing LaTeX pipeline to generate a PDF from trade JSON.
Supports FX NDF, IRS, CDS, and Equity TRS document types.
"""

import os
import sys
from .state import DocForgeState

# Add generator paths
_ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..")
sys.path.insert(0, os.path.join(_ROOT, "templates", "FX_Trade_Confirmation"))
sys.path.insert(0, os.path.join(_ROOT, "templates", "IRS_Confirmation"))
sys.path.insert(0, os.path.join(_ROOT, "templates", "CDS_Confirmation"))
sys.path.insert(0, os.path.join(_ROOT, "templates", "Equity_TRS"))

# Lazy imports with fallbacks — prevents entire server from crashing
# if a single template module is missing from the deployment image.
_generate_fx_pdf = None
_generate_irs_pdf = None
_generate_cds_pdf = None
_generate_equity_trs_pdf = None

try:
    from generate_fx_ndf import generate_pdf as _generate_fx_pdf
except ModuleNotFoundError:
    print("  ⚠️  generate_fx_ndf module not found — FX NDF PDF generation disabled")

try:
    from generate_irs import generate_pdf as _generate_irs_pdf
except ModuleNotFoundError:
    print("  ⚠️  generate_irs module not found — IRS PDF generation disabled")

try:
    from generate_cds import generate_pdf as _generate_cds_pdf
except ModuleNotFoundError:
    print("  ⚠️  generate_cds module not found — CDS PDF generation disabled")

try:
    from generate_equity_trs import generate_pdf as _generate_equity_trs_pdf
except ModuleNotFoundError:
    print("  ⚠️  generate_equity_trs module not found — Equity TRS PDF generation disabled")

OUTPUT_DIR = os.path.join(_ROOT, "output_confirmations", "temp")
os.makedirs(OUTPUT_DIR, exist_ok=True)


def compile_pdf(state: DocForgeState) -> DocForgeState:
    """LangGraph node: compile trade JSON to PDF via LaTeX."""
    trade_json = state.get("trade_json") or state.get("extracted_json")
    doc_type = state.get("doc_type", "fx_ndf")

    if not trade_json:
        return {**state, "error": "No trade JSON to compile"}

    if state.get("error"):
        return state

    try:
        print(f"  ⏳ Compiling {doc_type.upper()} PDF...")

        if doc_type == "fx_ndf":
            if _generate_fx_pdf is None:
                return {**state, "error": "FX NDF PDF generator not available — module missing from deployment"}
            pdf_path = _generate_fx_pdf(trade_json, OUTPUT_DIR)
        elif doc_type == "cds":
            if _generate_cds_pdf is None:
                return {**state, "error": "CDS PDF generator not available — module missing from deployment"}
            pdf_path = _generate_cds_pdf(trade_json, OUTPUT_DIR)
        elif doc_type == "equity_trs":
            if _generate_equity_trs_pdf is None:
                return {**state, "error": "Equity TRS PDF generator not available — module missing from deployment"}
            pdf_path = _generate_equity_trs_pdf(trade_json, OUTPUT_DIR)
        else:
            if _generate_irs_pdf is None:
                return {**state, "error": "IRS PDF generator not available — module missing from deployment"}
            pdf_path = _generate_irs_pdf(trade_json, OUTPUT_DIR)

        if pdf_path and os.path.exists(pdf_path):
            filename = os.path.basename(pdf_path)
            print(f"  ✅ PDF compiled: {filename}")
            return {
                **state,
                "pdf_path": pdf_path,
                "pdf_filename": filename,
                "error": ""
            }
        else:
            return {**state, "error": "PDF compilation failed — pdflatex error"}

    except Exception as e:
        print(f"  ❌ PDF compilation error: {e}")
        return {**state, "error": f"PDF compilation failed: {str(e)}"}
