"""
Validator Agent
=================
Uses Gemini multimodal API to validate the generated PDF confirmation
against the original email. The model reads the PDF visually and compares
every detail against the source email.
"""

import os
from .gemini_helper import call_gemini
from .groq_helper import call_groq
from .state import DocForgeState

VALIDATION_PROMPT = """You are an expert trade documentation validator for derivatives markets, with deep knowledge of ISDA and EMTA confirmation standards.

You have been given:
1. The ORIGINAL EMAIL/MESSAGE containing trade details
2. The GENERATED PDF CONFIRMATION document (attached)

Your job is to produce a VALIDATION REPORT comparing the ORIGINAL EMAIL against the PDF confirmation.

CRITICAL — WHAT TO VALIDATE vs WHAT TO IGNORE:

The PDF is an ISDA/EMTA-compliant trade confirmation. It should contain ONLY the fields that belong in a formal bilateral confirmation document. The email contains extra metadata that is intentionally excluded from the PDF per industry standards.

IGNORE (do NOT flag as missing if they are omitted from the PDF, but if they ARE present in the PDF, validate them and mark them as ✅ if they match the email):
- Trade Reference / Deal Reference / Transaction Reference numbers — internal tracking IDs, do not flag as missing.
- LEI codes (Legal Entity Identifiers) — if present in the PDF, check if they match the email. If they match, mark as ✅. If they are missing from the PDF, ignore them (do not flag as missing).
- Attention lines (e.g. "Attention: FX Derivatives Desk") / Contact details / Notice details — if present in the PDF, check if they match. If they match, mark as ✅. If they are missing from the PDF, ignore them.
- Email addresses, phone numbers, CC fields — email routing metadata only, ignore.
- "Inapplicable" / "Not Applicable" / "None" / "N/A" values: If the email states a term is "Inapplicable", "Not Applicable", "None", or "N/A" (e.g., "Compounding: Inapplicable") and it is omitted or left out in the PDF, it MUST NOT be flagged as missing or as an issue. Treat it as a semantic match (✅) or a warning (⚠️) at most, because omitting a non-applicable clause is standard practice in trade confirmations.
- Spacing, Concatenation, and Word-Merging artifacts: PDF text extraction (via pypdf) often merges bold text with adjacent words (e.g. "as of15", "betweenGoldman", "3rddayofMarch", "ModifiedFollowing"). Do NOT flag these as warnings or rendering issues. Treat them as perfect matches (✅) if the letters/values are correct.

ONLY validate these categories of fields:
- **Trade Economics**: dates (trade date, effective date, termination date, settlement date, valuation date), notional amounts, rates (fixed rate, floating rate, forward rate, spread), currencies, payment amounts
- **Party Identification**: party legal names, offices (if in PDF), addresses (if in PDF)
- **Transaction Classification**: transaction type, settlement type, exhibit type, governing law
- **Calculation Provisions**: calculation agent, day count fractions, business day conventions, disruption fallbacks, compounding methods
- **Dates & Rates**: all dates, all rates, all rate options (e.g. SOFR, EURIBOR, settlement rate option)

Check for:
- **Missing Fields**: Critical ISDA/EMTA confirmation data mentioned in the email but not present in the PDF (excluding email-only metadata and "Inapplicable" fields listed above)
- **Mismatched Values**: Values in the PDF that don't match the email (dates, amounts, rates, names, etc.)
- **Formatting Issues**: Dates, amounts, or rates that appear incorrectly formatted in the PDF
- **Rendering Problems**: Any actual visual layout issues (overlapping text blocks, vertical line cutoffs). Do NOT count simple word-concatenation from PDF text extraction as a rendering problem.
- **Logical Inconsistencies**: e.g. settlement date before trade date, notional amounts that don't match forward rate × reference amount
- **Completeness**: Are all critical trade economics from the email reflected correctly in the PDF?

ORIGINAL EMAIL:
{email_text}

TEXT EXTRACTED FROM PDF CONFIRMATION:
{pdf_text}

Read both the original email and the PDF text carefully and compare every detail.

Produce a clear, structured validation report in Markdown format with these sections:

## Validation Summary
A one-line overall status. Choose exactly one of:
- ✅ PASS: Choose this if there are NO economic mismatches, NO legal name mismatches, and no critical missing fields. Minor phrasing/synonym differences (e.g., "Incorporated" vs "Applicable in full", or "CUSIP/ISIN" label vs "CUSIP") or omission of "Inapplicable" / "Not Applicable" fields must be marked as ✅ and summarized as a PASS.
- ⚠️ WARNINGS: Choose this if there are minor rendering issues, hyphenation splits (like "possi-ble"), or optional / "Inapplicable" fields present in the email that are left blank in the PDF. Do NOT use ❌ ISSUES FOUND for these minor issues.
- ❌ ISSUES FOUND: Choose this ONLY if there are critical, clear mismatches in trade economics (dates, notionals, rates, currencies), wrong/swapped legal entity names, or missing mandatory fields that invalidate the trade document.

## Field-by-Field Check
A table with columns: Field | Email Value | PDF Value | Status (✅/⚠️/❌)

## Issues Found
List any problems with details. If none, write "None".

## Recommendations
Suggestions for fixing any issues. If none, write "None".

Return the Markdown report now:"""


def validate_document(state: DocForgeState) -> DocForgeState:
    """LangGraph node: validate generated PDF against original email using fast text comparison."""
    email_text = state.get("email_text", "")
    pdf_path = state.get("pdf_path", "")

    if not pdf_path or not os.path.exists(pdf_path):
        return {**state, "error": "No PDF file found to validate — please generate the PDF first"}

    if not email_text.strip():
        return {**state, "error": "No email text to validate against"}

    try:
        from pypdf import PdfReader
        print(f"  ⏳ Extracting text from PDF: {os.path.basename(pdf_path)}...")
        reader = PdfReader(pdf_path)
        pdf_text = "\n".join(page.extract_text() for page in reader.pages)

        prompt = VALIDATION_PROMPT.format(email_text=email_text, pdf_text=pdf_text)

        try:
            print(f"  ⏳ Validating PDF text against email using Groq Llama...")
            report = call_groq(prompt, max_tokens=2048)
        except Exception as groq_err:
            print(f"  ⚠️ Groq call failed: {groq_err} — falling back to Gemini Vertex AI...")
            report = call_gemini(prompt, model_name=state.get("model"))

        print(f"  ✅ Validation complete ({len(report)} chars)")

        return {
            **state,
            "validation_report": report,
            "error": ""
        }

    except Exception as e:
        print(f"  ❌ Validation failed: {e}")
        return {**state, "error": f"Validation failed: {str(e)}"}
