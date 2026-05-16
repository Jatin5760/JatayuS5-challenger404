"""
Word Converter Agent
======================
Converts a generated PDF confirmation to Word (.docx) format
using the Adobe PDF Services API (pdfservices-sdk).

Credentials are read from environment variables:
    PDF_SERVICES_CLIENT_ID     — Adobe client ID (use the API key as client ID)
    PDF_SERVICES_CLIENT_SECRET — Adobe client secret

Reference:
    ExportPDFToDOCXWithOCROption (Java sample → Python equivalent)
"""

import os
from dotenv import load_dotenv
from .state import DocForgeState

load_dotenv()

# Lazy Adobe SDK imports — prevents crash if SDK not installed
_ADOBE_AVAILABLE = False
try:
    from adobe.pdfservices.operation.auth.service_principal_credentials import ServicePrincipalCredentials  # type: ignore[no-redef]
    from adobe.pdfservices.operation.pdf_services import PDFServices  # type: ignore[no-redef]
    from adobe.pdfservices.operation.pdf_services_media_type import PDFServicesMediaType  # type: ignore[no-redef]
    from adobe.pdfservices.operation.pdfjobs.jobs.export_pdf_job import ExportPDFJob  # type: ignore[no-redef]
    from adobe.pdfservices.operation.pdfjobs.params.export_pdf.export_pdf_params import ExportPDFParams  # type: ignore[no-redef]
    from adobe.pdfservices.operation.pdfjobs.params.export_pdf.export_pdf_target_format import ExportPDFTargetFormat  # type: ignore[no-redef]
    from adobe.pdfservices.operation.pdfjobs.params.export_pdf.export_ocr_locale import ExportOCRLocale  # type: ignore[no-redef]
    from adobe.pdfservices.operation.pdfjobs.result.export_pdf_result import ExportPDFResult  # type: ignore[no-redef]
    _ADOBE_AVAILABLE = True
except ImportError:
    print("  ⚠️  Adobe PDF Services SDK not installed — Word conversion disabled")


def convert_to_word(state: DocForgeState) -> DocForgeState:  # pyright: ignore[reportPossiblyUnboundVariable]
    """LangGraph node: convert a PDF to Word (.docx) using Adobe PDF Services API."""
    pdf_path = state.get("pdf_path", "")

    if not pdf_path or not os.path.exists(pdf_path):
        return {**state, "error": "No PDF file found to convert"}

    if not _ADOBE_AVAILABLE:
        return {**state, "error": "Adobe PDF Services SDK not installed — Word conversion unavailable"}

    # Re-import inside guarded block so Pylance sees them as bound
    from adobe.pdfservices.operation.auth.service_principal_credentials import ServicePrincipalCredentials as _SC
    from adobe.pdfservices.operation.pdf_services import PDFServices as _PS
    from adobe.pdfservices.operation.pdf_services_media_type import PDFServicesMediaType as _MT
    from adobe.pdfservices.operation.pdfjobs.jobs.export_pdf_job import ExportPDFJob as _EJ
    from adobe.pdfservices.operation.pdfjobs.params.export_pdf.export_pdf_params import ExportPDFParams as _EP
    from adobe.pdfservices.operation.pdfjobs.params.export_pdf.export_pdf_target_format import ExportPDFTargetFormat as _TF
    from adobe.pdfservices.operation.pdfjobs.params.export_pdf.export_ocr_locale import ExportOCRLocale as _OL
    from adobe.pdfservices.operation.pdfjobs.result.export_pdf_result import ExportPDFResult as _ER

    try:
        docx_path = os.path.splitext(pdf_path)[0] + ".docx"
        docx_filename = os.path.basename(docx_path)

        print(f"  ⏳ Converting PDF to Word via Adobe API: {os.path.basename(pdf_path)}...")

        # ── Credentials ───────────────────────────────────────────────────
        credentials = _SC(
            client_id=os.environ.get("PDF_SERVICES_CLIENT_ID"),
            client_secret=os.environ.get("PDF_SERVICES_CLIENT_SECRET"),
        )

        # ── Upload source PDF ─────────────────────────────────────────────
        pdf_services = _PS(credentials=credentials)
        with open(pdf_path, "rb") as f:
            input_stream = f.read()

        asset = pdf_services.upload(
            input_stream=input_stream,
            mime_type=_MT.PDF,
        )

        # ── Build export params (DOCX + EN-US OCR locale) ─────────────────
        export_params = _EP(
            target_format=_TF.DOCX,
            ocr_lang=_OL.EN_US,
        )

        # ── Submit job ────────────────────────────────────────────────────
        export_job = _EJ(input_asset=asset, export_pdf_params=export_params)
        location = pdf_services.submit(export_job)
        response = pdf_services.get_job_result(location, _ER)

        # ── Download result ───────────────────────────────────────────────
        result_asset = response.get_result().get_asset()
        stream_asset = pdf_services.get_content(result_asset)

        with open(docx_path, "wb") as out:
            out.write(stream_asset.get_input_stream())

        if os.path.exists(docx_path):
            print(f"  ✅ Word file created: {docx_filename}")
            return {
                **state,
                "docx_path": docx_path,
                "docx_filename": docx_filename,
                "error": "",
            }
        else:
            return {**state, "error": "Word conversion failed — output file not created"}

    except Exception as e:
        print(f"  ❌ Word conversion failed: {e}")
        return {**state, "error": f"Word conversion failed: {str(e)}"}
