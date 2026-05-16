import json

def build_assistant_prompt(message: str, doc_type: str, schema: dict, current_data: dict, history: list) -> str:
    """
    Constructs the prompt with context (schema, filled data, history) for the form-aware assistant.
    """
    doc_name_map = {
        "fx_ndf":     "FX Non-Deliverable Forward (NDF)",
        "irs":        "Interest Rate Swap (IRS) Confirmation",
        "cds":        "Credit Default Swap (CDS) Confirmation",
        "equity_trs": "Equity Total Return Swap (TRS) Confirmation",
    }
    doc_display = doc_name_map.get(doc_type, doc_type.upper())

    # Build schema summary — field labels + keys for context
    def summarise_schema(s):
        lines = []
        sections = s.get("sections", {})
        if isinstance(sections, dict):
            for sec_key, sec in sections.items():
                lines.append(f"\nSection: {sec.get('title', sec_key)}")
                for sub in sec.get("subsections", []):
                    lines.append(f"  Subsection: {sub.get('title','')}")
                    for f in sub.get("fields", []):
                        req = "[required]" if f.get("required") else ""
                        lines.append(f"    - {f.get('label','')} ({f.get('key','')}): {f.get('type','')} {req}")
                for f in sec.get("fields", []):
                    req = "[required]" if f.get("required") else ""
                    lines.append(f"  - {f.get('label','')} ({f.get('key','')}): {f.get('type','')} {req}")
        elif isinstance(sections, list):
            for sec in sections:
                lines.append(f"\nSection: {sec.get('title', sec.get('id', ''))}")
                for sub in sec.get("subsections", []):
                    lines.append(f"  Subsection: {sub.get('title','')}")
                    for f in sub.get("fields", []):
                        req = "[required]" if f.get("required") else ""
                        lines.append(f"    - {f.get('label','')} ({f.get('key','')}): {f.get('type','')} {req}")
                for f in sec.get("fields", []):
                    req = "[required]" if f.get("required") else ""
                    lines.append(f"  - {f.get('label','')} ({f.get('key','')}): {f.get('type','')} {req}")
        return "\n".join(lines) if lines else json.dumps(s, indent=2)[:3000]

    schema_summary = summarise_schema(schema) if isinstance(schema, dict) else ""

    # Only show filled fields in context
    current_data = current_data or {}
    filled = {k: v for k, v in current_data.items() if v not in (None, "", [], {})}
    filled_str = json.dumps(filled, indent=2) if filled else "No fields filled in yet."

    # Conversation history (last 8 turns)
    history_str = ""
    for turn in history[-8:]:
        role = turn.get("role", "user")
        content = turn.get("content", turn.get("text", ""))
        role_label = "User" if role == "user" else "Assistant"
        history_str += f"{role_label}: {content}\n"

    prompt = f"""You are TradeDoc AI Assistant — a friendly expert assistant built into the TradeDoc AI platform.
You help users understand and fill in trade confirmation documents for financial derivatives.

DOCUMENT TYPE: {doc_display}

DOCUMENT SCHEMA (fields the user needs to fill):
{schema_summary}

CURRENT FORM DATA (filled so far):
{filled_str}

CONVERSATION HISTORY:
{history_str}
User: {message}

INSTRUCTIONS:
- Answer helpfully and concisely. Keep responses under 150 words unless detail is explicitly requested.
- Focus on the specific document and fields listed above.
- If the user asks what they have filled so far, or if there is any mistake, review the 'CURRENT FORM DATA' and 'DOCUMENT SCHEMA' to guide them.
- If asked about a field, explain what it means in context of {doc_display} and give a realistic example.
- If the user asks why a field is needed, explain its legal/financial purpose briefly.
- You can also navigate the user. If the user wants to go to a different page, append the token [NAVIGATE:page-name] at the end of your response (e.g. [NAVIGATE:ai] or [NAVIGATE:dashboard]).
- Do NOT fabricate data. If unsure, say so honestly.
- Respond in plain conversational text (minimal markdown, no headers)."""

    return prompt
