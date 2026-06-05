import sys
import os
import json

# Ensure we can import from the project root
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from agents.graph import ai_create_graph, pdf_compile_graph, validation_graph

def main():
    print("======================================================")
    print("  AI Extract Pipeline Test Script")
    print("======================================================")
    print("Please paste your email test case below.")
    print("Press Ctrl+D (or Ctrl+Z on Windows) followed by Enter when you are done.")
    print("------------------------------------------------------")
    
    email_text = sys.stdin.read().strip()
    if not email_text:
        print("❌ No email text provided. Exiting.")
        return

    print("\n------------------------------------------------------")
    print("1. Running AI Classification and Extraction...")
    print("------------------------------------------------------")
    
    # Run classify -> extract graph
    initial_state = {"email_text": email_text}
    extracted_state = ai_create_graph.invoke(initial_state)
    
    if extracted_state.get("error"):
        print(f"❌ Extraction Error: {extracted_state['error']}")
        return
        
    doc_type = extracted_state.get("doc_type", "Unknown")
    extracted_json = extracted_state.get("extracted_json", {})
    
    print(f"✅ Document Type Classified As: {doc_type.upper()}")
    print("\nExtracted JSON:")
    print(json.dumps(extracted_json, indent=2))
    
    print("\n------------------------------------------------------")
    print("2. Generating PDF Confirmation...")
    print("------------------------------------------------------")
    
    # Run compile_pdf graph
    pdf_state = pdf_compile_graph.invoke(extracted_state)
    if pdf_state.get("error"):
        print(f"❌ PDF Generation Error: {pdf_state['error']}")
        return
        
    pdf_path = pdf_state.get("pdf_path")
    print(f"✅ PDF successfully generated at: {pdf_path}")
    
    print("\n------------------------------------------------------")
    print("3. Running AI Validation (PDF vs Original Email)...")
    print("------------------------------------------------------")
    
    # Run validate graph
    val_state = validation_graph.invoke(pdf_state)
    if val_state.get("error"):
        print(f"❌ Validation Error: {val_state['error']}")
        return
        
    report = val_state.get("validation_report")
    print("\nValidation Report:")
    print("==================")
    print(report)
    print("==================")

if __name__ == "__main__":
    main()
