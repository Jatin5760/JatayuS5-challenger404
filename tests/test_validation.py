import pytest
import os
import sys
from pathlib import Path

# Add project root to sys.path
_ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(_ROOT))

from agents.graph import validation_graph

def test_validation_missing_pdf():
    """Test validation fails gracefully if PDF is missing."""
    state = {
        "email_text": "Some text",
        "pdf_path": "/non/existent/path.pdf",
        "model": "gemini-flash-latest"
    }
    
    result = validation_graph.invoke(state)
    assert "error" in result
    assert "No PDF file found" in result["error"]

def test_validation_empty_email():
    """Test validation handles empty email."""
    state = {
        "email_text": "",
        "pdf_path": str(_ROOT / "README.md"), # just any existing file
        "model": "gemini-flash-latest"
    }
    
    result = validation_graph.invoke(state)
    assert "error" in result
    assert "No email text to validate" in result["error"]
