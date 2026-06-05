"""
Tests for signature customization endpoints and parameters (scale, x_offset, y_offset).
"""
import pytest
import json
import os
import sys
from pathlib import Path
from unittest.mock import patch, MagicMock
from bson import ObjectId

_ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(_ROOT))

from server import app, _auth_token_for

# ── Fixtures ──────────────────────────────────────────

@pytest.fixture
def client():
    """Flask test client with TESTING mode."""
    app.config["TESTING"] = True
    with app.test_client() as c:
        yield c

def _mock_db():
    """Create a mock MongoDB database with documents collection."""
    mock = MagicMock()
    mock.documents = MagicMock()
    mock.users = MagicMock()
    return mock

# ── Tests ─────────────────────────────────────────────

@patch("server.get_db")
@patch("server._stamp_signature_to_pdf")
@patch("server._append_or_update_audit_trail_page")
@patch("server._generate_cds_pdf_direct")
@patch("server._make_job_dir")
def test_api_sign_document_custom_parameters(mock_make_job, mock_generate_pdf, mock_audit, mock_stamp, mock_get_db, client):
    """Initiator signature endpoint extracts signatory inputs and custom stamp options correctly."""
    db = _mock_db()
    
    user_hex_id = "6a23064583f80b6fed9ff36f"
    
    # Mock document in MongoDB
    mock_doc = {
        "_id": ObjectId("6a23064583f80b6fed9ff36e"),
        "user_id": user_hex_id,
        "doc_type": "cds",
        "pdf_file_id": "job_id_123:doc.pdf",
        "released": False,
        "data": {
            "party_a_name": "Alpha Bank",
            "party_b_name": "Beta Bank"
        }
    }
    db.documents.find_one.return_value = mock_doc
    
    # Mock user details
    db.users.find_one.return_value = {
        "_id": ObjectId(user_hex_id),
        "name": "Operations User",
        "email": "ops@alpha.com"
    }
    
    mock_get_db.return_value = db
    
    # Mock PDF path returning from generator
    mock_generate_pdf.return_value = "/tmp/fake_cds.pdf"
    mock_make_job.return_value = ("fake_job_id", "/tmp")
    
    # We mock os.path.exists to make sure the flow continues
    with patch("os.path.exists", return_value=True), \
         patch("shutil.move") as mock_move:
         
        # Generate token for auth
        token = _auth_token_for(user_hex_id)
        headers = {"Authorization": f"Bearer {token}"}
        
        # Test signature post payload
        payload = {
            "signature_data": "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
            "signatory_name": "John Doe",
            "signatory_title": "Managing Director",
            "signatory_date": "20 March 2026",
            "scale": 1.25,
            "x_offset": 10.0,
            "y_offset": -5.0
        }
        
        resp = client.post("/api/documents/6a23064583f80b6fed9ff36e/sign", json=payload, headers=headers)
        
        # Verify response
        assert resp.status_code == 200
        data = resp.get_json()
        assert data["status"] == "success"
        
        # Verify PDF compile was called with updated trade_data
        mock_generate_pdf.assert_called_once()
        called_trade_data = mock_generate_pdf.call_args[0][0]
        assert called_trade_data["party_a_signatory_name"] == "John Doe"
        assert called_trade_data["party_a_signatory_title"] == "Managing Director"
        assert called_trade_data["party_a_signatory_date"] == "20 March 2026"
        
        # Verify stamp function called with the correct custom parameters
        mock_stamp.assert_called_once()
        _, kwargs = mock_stamp.call_args
        assert kwargs["scale"] == 1.25
        assert kwargs["x_offset"] == 10.0
        assert kwargs["y_offset"] == -5.0
        assert kwargs["is_party_b"] is False
        
        # Verify document was updated in database with the custom stamp parameters
        db.documents.update_one.assert_called_once()
        update_query = db.documents.update_one.call_args[0][1]["$set"]
        assert update_query["party_a_sig_scale"] == 1.25
        assert update_query["party_a_sig_x_offset"] == 10.0
        assert update_query["party_a_sig_y_offset"] == -5.0
        assert update_query["party_a_signed_name"] == "John Doe"


@patch("server.get_db")
@patch("server._stamp_signature_to_pdf")
@patch("server._append_or_update_audit_trail_page")
@patch("server._generate_cds_pdf_direct")
@patch("server._make_job_dir")
def test_api_client_sign_document_custom_parameters(mock_make_job, mock_generate_pdf, mock_audit, mock_stamp, mock_get_db, client):
    """Client countersigning endpoint extracts signatory inputs and custom stamp options correctly."""
    db = _mock_db()
    
    # Mock document in MongoDB with existing Party A signature details
    mock_doc = {
        "_id": ObjectId("6a23064583f80b6fed9ff36e"),
        "user_id": ObjectId("6a23064583f80b6fed9ff36f"),
        "doc_type": "cds",
        "pdf_file_id": "job_id_123:doc.pdf",
        "signing_token": "secure_token_123",
        "client_signed": False,
        "party_a_signature_image": "party_a_image_data",
        "party_a_signed_name": "John Doe",
        "party_a_sig_scale": 1.25,
        "party_a_sig_x_offset": 10.0,
        "party_a_sig_y_offset": -5.0,
        "data": {
            "party_a_name": "Alpha Bank",
            "party_b_name": "Beta Bank"
        }
    }
    db.documents.find_one.return_value = mock_doc
    mock_get_db.return_value = db
    
    # Mock PDF path returning from generator
    mock_generate_pdf.return_value = "/tmp/fake_cds.pdf"
    mock_make_job.return_value = ("fake_job_id", "/tmp")
    
    with patch("os.path.exists", return_value=True), \
         patch("shutil.move") as mock_move:
         
        # Test signature post payload for Party B
        payload = {
            "token": "secure_token_123",
            "signature_data": "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
            "signer_name": "Jane Smith",
            "signer_title": "Vice President",
            "signer_date": "21 March 2026",
            "scale": 0.9,
            "x_offset": -15.0,
            "y_offset": 8.0
        }
        
        resp = client.post("/api/public/documents/sign-by-token", json=payload)
        
        # Verify response
        assert resp.status_code == 200
        
        # Verify PDF compile was called with updated client signatory details
        mock_generate_pdf.assert_called_once()
        called_trade_data = mock_generate_pdf.call_args[0][0]
        assert called_trade_data["party_b_signatory_name"] == "Jane Smith"
        assert called_trade_data["party_b_signatory_title"] == "Vice President"
        assert called_trade_data["party_b_signatory_date"] == "21 March 2026"
        
        # Verify stamp calls: 
        # 1. Party A's signature should be stamped with stored scale/offsets
        # 2. Party B's signature should be stamped with new payload scale/offsets
        assert mock_stamp.call_count == 2
        
        # First call: Party A's signature
        first_call_args, first_call_kwargs = mock_stamp.call_args_list[0]
        assert first_call_kwargs["scale"] == 1.25
        assert first_call_kwargs["x_offset"] == 10.0
        assert first_call_kwargs["y_offset"] == -5.0
        assert first_call_kwargs["is_party_b"] is False
        
        # Second call: Party B's signature
        second_call_args, second_call_kwargs = mock_stamp.call_args_list[1]
        assert second_call_kwargs["scale"] == 0.9
        assert second_call_kwargs["x_offset"] == -15.0
        assert second_call_kwargs["y_offset"] == 8.0
        assert second_call_kwargs["is_party_b"] is True
        
        # Verify document was updated in database with Party B stamp parameters
        db.documents.update_one.assert_called_once()
        update_query = db.documents.update_one.call_args[0][1]["$set"]
        assert update_query["party_b_sig_scale"] == 0.9
        assert update_query["party_b_sig_x_offset"] == -15.0
        assert update_query["party_b_sig_y_offset"] == 8.0
        assert update_query["client_signed_name"] == "Jane Smith"
