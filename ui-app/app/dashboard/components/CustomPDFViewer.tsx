'use client';

import React, { useState, useRef, useEffect } from 'react';
import { Document, Page, pdfjs } from 'react-pdf';
import 'react-pdf/dist/Page/AnnotationLayer.css';
import 'react-pdf/dist/Page/TextLayer.css';
import { API_BASE, authHeaders } from '../../../lib/api';
import { Schema, SchemaSection, SchemaField } from '../types';
import { FieldRenderer } from './FormElements';

// Set worker for react-pdf
pdfjs.GlobalWorkerOptions.workerSrc = `//unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`;

interface CustomPDFViewerProps {
  docId?: string;
  pdfUrl: string;
  filename: string;
  onClose: () => void;
  onDownload: () => void;
  onPrint: () => void;
  // Phase 2: Enhanced context-aware toolbar props
  isAiCreated: boolean;
  hasExistingReport: boolean;
  validationStatus?: 'pending' | 'verified';
  onGenerateValidation: () => void;
  onViewCurrentReport: () => void;
  onConvertToWord: () => void;
  generatingValidation?: boolean;
  showValidateOnPdf?: boolean;
  onSigned?: () => void;
  initialIsSigned?: boolean;
  initialIsClientSigned?: boolean;
  initialIsReleased?: boolean;
  onPdfRegenerated?: (newBlobUrl: string, newFilename: string, newFileId: string, updatedData: Record<string, any>) => void;
}

export default function CustomPDFViewer({
  docId,
  pdfUrl,
  filename,
  onClose,
  onDownload,
  onPrint,
  isAiCreated,
  hasExistingReport,
  validationStatus,
  onGenerateValidation,
  onViewCurrentReport,
  onConvertToWord,
  generatingValidation,
  showValidateOnPdf,
  onSigned,
  initialIsSigned,
  initialIsClientSigned,
  initialIsReleased,
  onPdfRegenerated,
}: CustomPDFViewerProps) {
  const [numPages, setNumPages] = useState<number>(0);
  const [pageNumber, setPageNumber] = useState<number>(1);
  const [scale, setScale] = useState<number>(1.0);

  // Document and Schema editing states
  const [docData, setDocData] = useState<any>(null);
  const [schema, setSchema] = useState<Schema | null>(null);
  const [editData, setEditData] = useState<Record<string, any>>({});
  const [isEditPanelOpen, setIsEditPanelOpen] = useState(false);
  const [isRegenerating, setIsRegenerating] = useState(false);
  const [expandedSections, setExpandedSections] = useState<Record<string, boolean>>({});

  // Load document and schema details for inline editing
  useEffect(() => {
    if (!docId) return;

    const loadDocAndSchema = async () => {
      try {
        const docResp = await fetch(`${API_BASE}/api/documents/${docId}`, { headers: authHeaders() });
        if (!docResp.ok) return;
        const fullDoc = await docResp.json();
        setDocData(fullDoc);

        const docType = fullDoc.doc_type;
        const schemaFile = docType === 'fx_ndf' ? '/schemas/fx_schema.json'
                         : docType === 'irs' ? '/schemas/irs_schema.json'
                         : docType === 'cds' ? '/schemas/cds_schema.json'
                         : docType === 'equity_trs' ? '/schemas/equity_trs_schema.json'
                         : '';
        if (schemaFile) {
          const schemaResp = await fetch(schemaFile);
          if (schemaResp.ok) {
            const schemaObj = await schemaResp.json();
            setSchema(schemaObj);
            
            // Expand first section by default
            const secs = schemaObj.sections;
            if (secs) {
              const keys = Array.isArray(secs) ? secs.map((_, i) => String(i)) : Object.keys(secs);
              if (keys.length > 0) {
                setExpandedSections({ [keys[0]]: true });
              }
            }
          }
        }

        const rawData = fullDoc.data || {};
        const formatted: Record<string, any> = {};
        for (const [key, value] of Object.entries(rawData)) {
          if (Array.isArray(value)) {
            formatted['__rep_' + key] = value;
          } else {
            formatted[key] = value;
          }
        }
        setEditData(formatted);
      } catch (e) {
        console.error("Failed to load document/schema:", e);
      }
    };

    void loadDocAndSchema();
  }, [docId, pdfUrl]);

  // Zoom response: open edit side -> 60%, close -> 100%
  useEffect(() => {
    if (isEditPanelOpen) {
      setScale(0.6);
    } else {
      setScale(1.0);
    }
  }, [isEditPanelOpen]);

  // Signature States
  const [localPdfUrl, setLocalPdfUrl] = useState(pdfUrl);
  const [isSigned, setIsSigned] = useState(initialIsSigned || false);
  const [isClientSigned, setIsClientSigned] = useState(initialIsClientSigned || false);
  const [isReleased, setIsReleased] = useState(initialIsReleased || false);
  const [isSigningModalOpen, setIsSigningModalOpen] = useState(false);
  const [isConfirmSignOpen, setIsConfirmSignOpen] = useState(false);
  const [signatureType, setSignatureType] = useState<'draw' | 'type'>('draw');
  const [typedName, setTypedName] = useState('');
  const [activeFont, setActiveFont] = useState("'Great Vibes', cursive");
  const [isSigningApiLoading, setIsSigningApiLoading] = useState(false);
  const [isDrawing, setIsDrawing] = useState(false);
  const [toast, setToast] = useState('');
  const [toastVisible, setToastVisible] = useState(false);

  // New States for Unified Signature Dialog
  const [signatoryName, setSignatoryName] = useState('');
  const [signatoryTitle, setSignatoryTitle] = useState('');
  const [signatoryDate, setSignatoryDate] = useState('');
  const [sigScale, setSigScale] = useState<number>(1.0);
  const [sigXOffset, setSigXOffset] = useState<number>(0);
  const [sigYOffset, setSigYOffset] = useState<number>(0);
  const [tempSigUrl, setTempSigUrl] = useState('');

  // Client Email States
  const [isEmailModalOpen, setIsEmailModalOpen] = useState(false);
  const [clientEmail, setClientEmail] = useState('');
  const [emailSubject, setEmailSubject] = useState('');
  const [emailBody, setEmailBody] = useState('');
  const [isSendingEmail, setIsSendingEmail] = useState(false);

  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  // Sync prop changes
  useEffect(() => {
    setLocalPdfUrl(pdfUrl);
  }, [pdfUrl]);

  useEffect(() => {
    setIsSigned(initialIsSigned || false);
  }, [initialIsSigned]);

  useEffect(() => {
    setIsClientSigned(initialIsClientSigned || false);
    setIsReleased(initialIsReleased || false);
  }, [initialIsClientSigned, initialIsReleased]);

  // Load cursive fonts dynamically
  useEffect(() => {
    if (typeof document !== 'undefined') {
      const link = document.createElement('link');
      link.href = 'https://fonts.googleapis.com/css2?family=Great+Vibes&family=Playball&family=Caveat:wght@700&display=swap';
      link.rel = 'stylesheet';
      document.head.appendChild(link);
    }
  }, []);

  // Load default signatory details and adjustments from docData
  useEffect(() => {
    if (docData) {
      const pName = docData.data?.party_a_signatory_name || docData.party_a_signed_name || '';
      const pTitle = docData.data?.party_a_signatory_title || '';
      const pDate = docData.data?.party_a_signatory_date || new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
      setSignatoryName(pName);
      setSignatoryTitle(pTitle);
      setSignatoryDate(pDate);

      // Load saved stamp options if any
      setSigScale(docData.party_a_sig_scale ?? 1.0);
      setSigXOffset(docData.party_a_sig_x_offset ?? 0);
      setSigYOffset(docData.party_a_sig_y_offset ?? 0);
    }
  }, [docData]);

  // Update canvas for typed text in real time
  useEffect(() => {
    if (signatureType === 'type' && canvasRef.current) {
      const canvas = canvasRef.current;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        
        // Draw elegant faint signature guide line
        ctx.strokeStyle = '#e2e8f0';
        ctx.lineWidth = 1.5;
        ctx.setLineDash([5, 5]);
        ctx.beginPath();
        ctx.moveTo(30, canvas.height - 45);
        ctx.lineTo(canvas.width - 30, canvas.height - 45);
        ctx.stroke();
        ctx.setLineDash([]); // Reset line dash
        
        // Draw cursive text
        ctx.font = `italic 38px ${activeFont}`;
        ctx.fillStyle = '#1e3a8a'; // Dark blue ink color
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(typedName || 'Sign Here', canvas.width / 2, canvas.height / 2 - 10);
        
        setTempSigUrl(canvas.toDataURL('image/png'));
      }
    }
  }, [typedName, activeFont, signatureType, isSigningModalOpen]);

  const showToastMsg = (msg: string) => {
    setToast(msg);
    setToastVisible(true);
    setTimeout(() => setToastVisible(false), 3000);
  };

  // Canvas Drawing Handlers
  const startDrawing = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    if (signatureType !== 'draw') return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    
    ctx.lineWidth = 3.5;
    ctx.lineCap = 'round';
    ctx.strokeStyle = '#1e293b'; // Ink slate 800

    let clientX, clientY;
    if ('touches' in e) {
      clientX = e.touches[0].clientX;
      clientY = e.touches[0].clientY;
    } else {
      clientX = e.clientX;
      clientY = e.clientY;
    }
    
    const rect = canvas.getBoundingClientRect();
    ctx.beginPath();
    ctx.moveTo(clientX - rect.left, clientY - rect.top);
    setIsDrawing(true);
  };

  const draw = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    if (!isDrawing || signatureType !== 'draw') return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    
    let clientX, clientY;
    if ('touches' in e) {
      clientX = e.touches[0].clientX;
      clientY = e.touches[0].clientY;
    } else {
      clientX = e.clientX;
      clientY = e.clientY;
    }
    
    const rect = canvas.getBoundingClientRect();
    ctx.lineTo(clientX - rect.left, clientY - rect.top);
    ctx.stroke();
    
    // Prevent default scrolling on touch screens
    if (e.cancelable) e.preventDefault();
  };

  const stopDrawing = () => {
    setIsDrawing(false);
    const canvas = canvasRef.current;
    if (canvas) {
      setTempSigUrl(canvas.toDataURL('image/png'));
    }
  };

  const clearCanvas = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    setTypedName('');
    setTempSigUrl('');
  };

  const submitSignature = async () => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    // Check if empty in draw mode
    if (signatureType === 'draw') {
      const ctx = canvas.getContext('2d');
      const buffer = new Uint32Array(ctx!.getImageData(0, 0, canvas.width, canvas.height).data.buffer);
      const hasDrawn = buffer.some(color => color !== 0);
      if (!hasDrawn) {
        showToastMsg('❌ Please draw a signature first');
        return;
      }
    } else {
      if (!typedName.trim()) {
        showToastMsg('❌ Please type your name first');
        return;
      }
    }

    const signatureData = canvas.toDataURL('image/png');
    setIsSigningApiLoading(true);

    try {
      const response = await fetch(`${API_BASE}/api/documents/${docId}/sign`, {
        method: 'POST',
        headers: authHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({ 
          signature_data: signatureData,
          signatory_name: signatoryName,
          signatory_title: signatoryTitle,
          signatory_date: signatoryDate,
          scale: sigScale,
          x_offset: sigXOffset,
          y_offset: sigYOffset,
        }),
      });

      if (!response.ok) {
        throw new Error('Stamping failed');
      }

      const res = await response.json();
      
      // Fetch the signed PDF with authorization headers to prevent 401
      const pdfResponse = await fetch(`${API_BASE}${res.pdf_url}`, {
        headers: authHeaders(),
      });
      if (!pdfResponse.ok) {
        throw new Error('Failed to fetch signed PDF');
      }
      const blob = await pdfResponse.blob();
      const blobUrl = URL.createObjectURL(blob);

      setLocalPdfUrl(blobUrl);
      setIsSigned(true);
      showToastMsg('✅ Document Signed successfully!');
      setIsSigningModalOpen(false);
      if (onSigned) onSigned();

      // Fetch details and open Email Modal
      setIsEmailModalOpen(true);
      try {
        const docResp = await fetch(`${API_BASE}/api/documents/${docId}`, { headers: authHeaders() });
        if (docResp.ok) {
          const updatedDoc = await docResp.json();
          setDocData(updatedDoc);
          
          if (onPdfRegenerated && updatedDoc.pdf_file_id) {
            onPdfRegenerated(blobUrl, filename, updatedDoc.pdf_file_id, updatedDoc.data || {});
          }

          const clientEmailData = updatedDoc.client_email || updatedDoc.data?.party_b_email || '';
          setClientEmail(clientEmailData);
          setEmailSubject(`Action Required: Trade Confirmation Countersignature — ${updatedDoc.summary || ''}`);
          const clientName = updatedDoc.data?.party_b_name || updatedDoc.data?.counterparty || 'Partner';
          setEmailBody(`Dear ${clientName},\n\nWe have reviewed and signed the Trade Confirmation (attached).\n\nPlease review and countersign the document at your earliest convenience.\n\nBest regards,\nOperations Desk`);
        }
      } catch (e) {
        console.error("Failed to load doc details for email draft:", e);
      }
    } catch {
      showToastMsg('❌ Failed to sign document');
    } finally {
      setIsSigningApiLoading(false);
    }
  };

  const sendEmailToClient = async () => {
    if (!clientEmail.trim()) {
      showToastMsg('❌ Please enter client email');
      return;
    }
    setIsSendingEmail(true);
    try {
      const response = await fetch(`${API_BASE}/api/documents/${docId}/send-to-client`, {
        method: 'POST',
        headers: authHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({
          client_email: clientEmail,
          subject: emailSubject,
          email_body: emailBody
        }),
      });
      if (!response.ok) {
        let errorMsg = 'Failed to send email';
        try {
          const errData = await response.json();
          errorMsg = errData.error || errorMsg;
        } catch {}
        throw new Error(errorMsg);
      }
      showToastMsg('✉️ Email sent successfully to client!');
      setIsEmailModalOpen(false);
    } catch (e: any) {
      showToastMsg(e.message || '❌ Failed to send email');
    } finally {
      setIsSendingEmail(false);
    }
  };

  // Helper to determine if a section should be visible
  const shouldShowSection = (sec: SchemaSection, allData: Record<string, any>) => {
    if (sec.always_show) return true;
    
    if (sec.show_for_exhibits && !sec.show_for_exhibits.includes(allData.exhibit || '')) {
      return false;
    }
    
    if (sec.show_for_termination && sec.show_for_termination !== allData.termination_type) {
      return false;
    }
    
    if (sec.show_for_models && allData.model_type && !sec.show_for_models.includes(allData.model_type)) {
      return false;
    }
    
    if (sec.show_when) {
      const srcVal = allData[sec.show_when.field];
      const targetVal = sec.show_when.value;
      const operator = sec.show_when.operator || 'equal';
      if (operator === 'not_equal') {
        if (srcVal === targetVal) return false;
      } else {
        if (srcVal !== targetVal) return false;
      }
    }

    const hasRestrictor = sec.always_show || sec.show_for_exhibits || sec.show_for_termination || sec.show_for_models || sec.show_when;
    return !!hasRestrictor;
  };

  // Helper to toggle section expanded state
  const toggleSection = (sectionKey: string) => {
    setExpandedSections(prev => ({
      ...prev,
      [sectionKey]: !prev[sectionKey]
    }));
  };

  // Helper to assemble final payload
  const assembleEditData = (rawData: Record<string, any>, docType: string): Record<string, any> => {
    const data: Record<string, any> = {};
    
    // Extract standard fields (not starting with __rep_)
    for (const [k, v] of Object.entries(rawData)) {
      if (!k.startsWith('__rep_')) {
        data[k] = v;
      }
    }
    
    // Extract repeater fields (convert __rep_key to key)
    for (const [k, v] of Object.entries(rawData)) {
      if (!k.startsWith('__rep_')) continue;
      const realKey = k.replace('__rep_', '');
      if (Array.isArray(v) && v.length > 0) {
        if (typeof v[0] === 'string') {
          data[realKey] = (v as string[]).filter(s => s.trim());
        } else {
          data[realKey] = (v as Array<{ title: string; description: string }>)
            .filter(p => p.title.trim() || p.description.trim());
        }
      } else {
        data[realKey] = [];
      }
    }
    
    return data;
  };

  const handleSaveAndRegenerate = async () => {
    if (!docId || !docData) return;
    setIsRegenerating(true);
    try {
      const docType = docData.doc_type;
      const assembledPayload: Record<string, any> = {
        ...assembleEditData(editData, docType),
        doc_id: docId
      };
      
      const endpoint = docType === 'fx_ndf' ? '/generate/fx_ndf'
                     : docType === 'cds' ? '/generate/cds'
                     : docType === 'equity_trs' ? '/generate/equity_trs'
                     : '/generate/irs';
                     
      const response = await fetch(`${API_BASE}${endpoint}`, {
        method: 'POST',
        headers: authHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify(assembledPayload),
      });
      
      if (!response.ok) {
        let errMsg = 'Failed to regenerate PDF';
        try {
          const d = await response.json();
          errMsg = d.error || errMsg;
        } catch {}
        showToastMsg(`❌ ${errMsg}`);
        setIsRegenerating(false);
        return;
      }
      
      const pdfBlob = await response.blob();
      const contentDisp = response.headers.get('Content-Disposition') || '';
      let filename = 'confirmation.pdf';
      const match = contentDisp.match(/filename=([^;]+)/);
      if (match) filename = match[1].replace(/"/g, '').trim();
      const fileId = response.headers.get('X-TradeDoc-File-Id') || '';
      
      let newSummary = '';
      if (docType === 'fx_ndf') {
        newSummary = `${assembledPayload.reference_currency || '?'}/${assembledPayload.settlement_currency || '?'} — ${assembledPayload.notional_amount || ''}`;
      } else if (docType === 'cds') {
        newSummary = `${assembledPayload.reference_entity || '?'} — ${assembledPayload.notional_amount || ''} @ ${assembledPayload.fixed_rate || '?'}bps`;
      } else if (docType === 'equity_trs') {
        newSummary = `Model ${assembledPayload.model_type || '?'} — ${assembledPayload.party_a_name || ''} vs ${assembledPayload.party_b_name || ''}`;
      } else {
        newSummary = `Exhibit ${(assembledPayload.exhibit as string) || '?'} — ${assembledPayload.party_a_name || ''} vs ${assembledPayload.party_b_name || ''}`;
      }
      
      const savePayload: Record<string, any> = {
        doc_type: docType,
        name: docData.name,
        icon: docData.icon || '📄',
        summary: newSummary,
        ai_created: docData.ai_created || false,
        data: assembledPayload,
        is_draft: false,
        pdf_file_id: fileId
      };
      if (docData.source_email) {
        savePayload.source_email = docData.source_email;
      }
      
      const putResp = await fetch(`${API_BASE}/api/documents/${docId}`, {
        method: 'PUT',
        headers: authHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify(savePayload),
      });
      
      if (!putResp.ok) {
        showToastMsg('❌ PDF generated, but database update failed');
        setIsRegenerating(false);
        return;
      }
      
      if (localPdfUrl && localPdfUrl.startsWith('blob:')) {
        URL.revokeObjectURL(localPdfUrl);
      }
      const newBlobUrl = URL.createObjectURL(pdfBlob);
      setLocalPdfUrl(newBlobUrl);
      
      if (onPdfRegenerated) {
        onPdfRegenerated(newBlobUrl, filename, fileId, assembledPayload);
      }
      
      showToastMsg('✅ PDF regenerated successfully!');
      setIsEditPanelOpen(false);
    } catch (e) {
      console.error(e);
      showToastMsg('❌ An error occurred during PDF regeneration');
    } finally {
      setIsRegenerating(false);
    }
  };

  function onDocumentLoadSuccess({ numPages }: { numPages: number }) {
    setNumPages(numPages);
    setPageNumber(1);
  }

  const zoomIn = () => setScale(prev => Math.min(prev + 0.2, 3.0));
  const zoomOut = () => setScale(prev => Math.max(prev - 0.2, 0.5));

  return (
    <div className="flex flex-col h-full bg-[#f8fafc] animate-in fade-in duration-500">
      {/* Top Professional Toolbar */}
      <div className="min-h-16 px-4 sm:px-6 lg:px-8 py-3 bg-white border-b border-slate-200 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between shadow-sm z-20">
        <div className="flex items-center gap-4 min-w-0">
          <div className="min-w-0">
            <h3 className="text-[15px] font-bold text-slate-800 tracking-tight truncate">{filename}</h3>
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Digital Document Workspace</p>
          </div>
        </div>

        {/* Center: Zoom Controls */}
        <div className="flex items-center gap-2 bg-slate-50 p-1.5 rounded-2xl border border-slate-200 w-fit">
          <button onClick={zoomOut} className="p-2 hover:bg-white hover:shadow-sm rounded-lg transition-all text-slate-500"><svg width="18" height="18" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M20 12H4"/></svg></button>
          <span className="text-xs font-black text-slate-600 w-16 text-center">{Math.round(scale * 100)}%</span>
          <button onClick={zoomIn} className="p-2 hover:bg-white hover:shadow-sm rounded-lg transition-all text-slate-500"><svg width="18" height="18" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M12 4v16m8-8H4"/></svg></button>
        </div>

        {/* Right: Context-Aware Action Buttons */}
        <div className="flex items-center gap-1.5 sm:gap-2 flex-wrap justify-end">
          {/* Edit Details removed - unified in signature dialog */}

          {/* Convert to Word */}
          <button
            onClick={onConvertToWord}
            className="px-3 py-2 rounded-xl bg-white border border-slate-200 text-slate-600 text-xs sm:text-sm font-bold hover:bg-slate-50 hover:border-slate-300 transition-colors shadow-sm whitespace-nowrap"
            title="Convert to Word"
          >
            <span className="flex items-center gap-1.5">
              <svg width="14" height="14" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"/></svg>
              Convert to Word
            </span>
          </button>

          {/* Download PDF */}
          <button
            onClick={() => {
              const a = document.createElement('a');
              a.href = localPdfUrl;
              a.download = filename || 'confirmation.pdf';
              document.body.appendChild(a);
              a.click();
              document.body.removeChild(a);
            }}
            className="px-3 py-2 rounded-xl bg-emerald-50 text-emerald-600 text-xs sm:text-sm font-bold hover:bg-emerald-600 hover:text-white transition-all shadow-sm whitespace-nowrap"
            title="Download PDF"
          >
            <span className="flex items-center gap-1.5">
              <svg width="14" height="14" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"/></svg>
              Download PDF
            </span>
          </button>

          {/* Separator before utility buttons */}
          <span className="w-px h-6 bg-slate-200 mx-1" />

          {/* Print */}
          <button
            onClick={() => {
              const w = window.open(localPdfUrl, '_blank');
              w?.print();
            }}
            className="w-9 h-9 bg-slate-50 text-slate-500 rounded-xl flex items-center justify-center hover:bg-slate-200 transition-all shadow-sm shrink-0"
            title="Print"
          >
            <svg width="16" height="16" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z"/></svg>
          </button>

          {/* Close */}
          <button
            onClick={onClose}
            className="w-9 h-9 bg-slate-50 text-slate-500 rounded-xl flex items-center justify-center hover:bg-rose-50 hover:text-rose-500 transition-all shadow-sm shrink-0"
            title="Close"
          >
            <svg width="16" height="16" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M6 18L18 6M6 6l12 12"/></svg>
          </button>
        </div>
      </div>

      {/* Main Workspace */}
      <div className="flex-1 flex overflow-hidden relative">
        {/* Left: Page Thumbnails Sidebar */}
        <div className="w-[200px] bg-slate-50 border-r border-slate-200 p-4 overflow-y-auto hidden xl:flex flex-col gap-4 custom-scrollbar">
          <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-[0.15em] mb-2 px-2">Pages</h4>
          <div className="flex flex-col gap-6">
            {Array.from(new Array(numPages), (_, index) => (
              <div 
                key={`thumb_${index + 1}`}
                onClick={() => {
                  setPageNumber(index + 1);
                  const el = document.getElementById(`page_${index + 1}`);
                  el?.scrollIntoView({ behavior: 'smooth' });
                }}
                className={`group cursor-pointer flex flex-col items-center gap-2 transition-all ${pageNumber === index + 1 ? 'scale-105' : 'hover:scale-102'}`}
              >
                <div 
                  className={`bg-white shadow-sm border-2 rounded-lg overflow-hidden transition-all p-1 ${
                    pageNumber === index + 1 ? 'border-indigo-500 shadow-indigo-100 shadow-lg' : 'border-slate-100 group-hover:border-slate-300'
                  }`}
                >
                  <Document file={localPdfUrl} loading={<div className="w-24 h-32 bg-slate-100 animate-pulse" />}>
                    <Page pageNumber={index + 1} width={120} renderTextLayer={false} renderAnnotationLayer={false} />
                  </Document>
                </div>
                <span className={`text-[10px] font-black uppercase tracking-widest ${pageNumber === index + 1 ? 'text-indigo-600' : 'text-slate-400'}`}>
                  Page {index + 1}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Center: PDF Canvas (Continuous Scroll) */}
        <div className="flex-1 overflow-auto p-4 sm:p-8 lg:p-12 flex flex-col items-center gap-8 bg-[#f1f5f9] custom-scrollbar relative scroll-smooth">
          
          {/* Action buttons bar right above the PDF page */}
          <div className="flex items-center gap-3 z-20">
            {/* Button 1: Validation Report */}
            {isAiCreated && (
              hasExistingReport ? (
                <button
                  onClick={onViewCurrentReport}
                  className="px-4 py-2.5 rounded-xl bg-violet-600 hover:bg-violet-700 text-white text-xs sm:text-sm font-bold shadow-md transition-all duration-200 flex items-center gap-1.5 cursor-pointer"
                  title="View Validation Report"
                >
                  <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/>
                  </svg>
                  <span>Validation Report</span>
                </button>
              ) : showValidateOnPdf ? (
                <button
                  onClick={onGenerateValidation}
                  disabled={generatingValidation}
                  className="px-4 py-2.5 rounded-xl bg-amber-600 hover:bg-amber-700 text-white text-xs sm:text-sm font-bold shadow-md transition-all duration-200 flex items-center gap-1.5 disabled:opacity-50 cursor-pointer"
                  title="Generate Validation Report"
                >
                  {generatingValidation ? (
                    <>
                      <span className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                      <span>Validating...</span>
                    </>
                  ) : (
                    <>
                      <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"/>
                      </svg>
                      <span>Gen Validation</span>
                    </>
                  )}
                </button>
              ) : null
            )}

            {/* Button 2: Sign Document */}
            {docId && (
              isClientSigned ? (
                <button
                  disabled
                  className={`px-3 py-2 rounded-xl text-xs sm:text-sm font-bold flex items-center gap-1.5 cursor-not-allowed ${
                    isReleased
                      ? 'bg-emerald-50 border border-emerald-200 text-emerald-700'
                      : 'bg-amber-50 border border-amber-200 text-amber-700'
                  }`}
                  title={isReleased ? 'Document is fully executed' : 'Client signed – awaiting your verification'}
                >
                  <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7"/>
                  </svg>
                  <span>{isReleased ? 'Fully Executed' : 'Signed – Pending Verification'}</span>
                </button>
              ) : isSigned ? (
                <div className="flex items-center gap-2">
                  <button
                    disabled
                    className="px-3 py-2 rounded-xl bg-slate-100 border border-slate-200 text-slate-400 text-xs sm:text-sm font-bold flex items-center gap-1.5 cursor-not-allowed"
                    title="Document is signed"
                  >
                    <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7"/>
                    </svg>
                    <span>Signed</span>
                  </button>
                  <button
                    onClick={async () => {
                      setIsEmailModalOpen(true);
                      try {
                        const docResp = await fetch(`${API_BASE}/api/documents/${docId}`, { headers: authHeaders() });
                        if (docResp.ok) {
                          const docData = await docResp.json();
                          const clientEmailData = docData.client_email || docData.data?.party_b_email || '';
                          setClientEmail(clientEmailData);
                          setEmailSubject(`Action Required: Trade Confirmation Countersignature — ${docData.summary || ''}`);
                          const clientName = docData.data?.party_b_name || docData.data?.counterparty || 'Partner';
                          setEmailBody(`Dear ${clientName},\n\nWe have reviewed and signed the Trade Confirmation (attached).\n\nPlease review and countersign the document at your earliest convenience.\n\nBest regards,\nOperations Desk`);
                        }
                      } catch (e) {
                        console.error("Failed to load doc details for email draft:", e);
                      }
                    }}
                    className="px-3 py-2.5 rounded-xl bg-indigo-50 border border-indigo-200 text-indigo-600 text-xs sm:text-sm font-bold hover:bg-indigo-600 hover:text-white transition-all shadow-sm whitespace-nowrap cursor-pointer flex items-center gap-1.5"
                    title="Email signed document to client for countersignature"
                  >
                    <svg width="14" height="14" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"/></svg>
                    Email Client
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => {
                    setIsConfirmSignOpen(true);
                  }}
                  className="px-4 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs sm:text-sm font-bold shadow-md transition-all duration-200 flex items-center gap-1.5 cursor-pointer"
                  title="Sign Confirmation PDF"
                >
                  <svg width="14" height="14" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z"/>
                  </svg>
                  <span>Sign Document</span>
                </button>
              )
            )}
          </div>

          <Document
            file={localPdfUrl}
            onLoadSuccess={onDocumentLoadSuccess}
            className="flex flex-col items-center gap-12"
            loading={
              <div className="bg-white w-[90vw] max-w-[595px] h-[60vh] max-h-[842px] flex flex-col items-center justify-center gap-4 rounded-sm shadow-sm">
                <div className="w-12 h-12 border-4 border-slate-100 border-t-indigo-500 rounded-full animate-spin" />
                <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">Loading Document...</p>
              </div>
            }
          >
            {Array.from(new Array(numPages), (_, index) => (
              <div 
                key={`full_page_${index + 1}`} 
                id={`page_${index + 1}`}
                className="max-w-full shadow-[0_20px_50px_rgba(0,0,0,0.1)] transition-transform duration-300 origin-top"
                style={{ transform: `scale(${scale})` }}
              >
                <Page 
                  pageNumber={index + 1} 
                  renderTextLayer={true}
                  renderAnnotationLayer={true}
                  className="rounded-sm overflow-hidden"
                  width={Math.min(750, typeof window !== 'undefined' ? Math.min(window.innerWidth - 32, 750) : 750)}
                />
              </div>
            ))}
          </Document>
        </div>

        {/* Right: Edit Fields Sidebar */}
        {isEditPanelOpen && schema && (
          <div className="w-[420px] bg-white border-l border-slate-200 flex flex-col h-full shadow-lg z-10 animate-in slide-in-from-right duration-300">
            {/* Sidebar Header */}
            <div className="p-5 border-b border-slate-200 flex items-center justify-between bg-slate-50">
              <div>
                <h4 className="text-sm font-bold text-slate-800">Edit Document Fields</h4>
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-0.5">Modify trade details directly</p>
              </div>
              <button 
                onClick={() => setIsEditPanelOpen(false)}
                className="w-8 h-8 rounded-full bg-white hover:bg-slate-100 text-slate-400 hover:text-slate-600 flex items-center justify-center transition-colors border border-slate-100 shadow-sm"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M6 18L18 6M6 6l12 12"/></svg>
              </button>
            </div>

            {/* Sidebar Fields (Scrollable Accordion) */}
            <div className="flex-1 overflow-y-auto p-5 space-y-4 custom-scrollbar">
              {(() => {
                const sectionsList: SchemaSection[] = schema.sections
                  ? (Array.isArray(schema.sections)
                      ? schema.sections
                      : Object.entries(schema.sections).map(([id, sec]) => ({ ...sec, id })))
                  : [];

                const signatoryFieldKeys = [
                  'party_a_signatory_name',
                  'party_a_signatory_title',
                  'party_a_signatory_date'
                ];

                const filteredSectionsList = sectionsList
                  .map(section => {
                    const filteredFields = (section.fields || []).filter(f => signatoryFieldKeys.includes(f.key));
                    const filteredSubsections = (section.subsections || []).map(sub => {
                      return {
                        ...sub,
                        fields: sub.fields.filter(f => signatoryFieldKeys.includes(f.key))
                      };
                    }).filter(sub => sub.fields.length > 0);

                    if (filteredFields.length === 0 && filteredSubsections.length === 0) {
                      return null;
                    }

                    return {
                      ...section,
                      fields: filteredFields,
                      subsections: filteredSubsections
                    };
                  })
                  .filter((sec): sec is any => sec !== null) as SchemaSection[];

                if (filteredSectionsList.length === 0) {
                  return (
                    <div className="p-8 text-center text-slate-400 font-medium text-xs">
                      No signatory credentials found for this document type.
                    </div>
                  );
                }

                return filteredSectionsList.map((section, idx) => {
                  const sectionKey = section.id || String(idx);
                  const isExpanded = !!expandedSections[sectionKey];
                  if (!shouldShowSection(section, editData)) return null;

                  return (
                    <div key={sectionKey} className="border border-slate-150 rounded-2xl overflow-hidden bg-slate-50/20">
                      {/* Accordion Header */}
                      <button
                        type="button"
                        onClick={() => toggleSection(sectionKey)}
                        className="w-full flex items-center justify-between p-4 bg-slate-50 hover:bg-slate-100/80 transition-colors text-left"
                      >
                        <span className="text-xs font-bold text-slate-700 tracking-wide uppercase">
                          {section.title}
                        </span>
                        <svg
                          className={`w-4 h-4 text-slate-400 transition-transform duration-200 ${isExpanded ? 'rotate-180' : ''}`}
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                        >
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M19 9l-7 7-7-7" />
                        </svg>
                      </button>

                      {/* Accordion Content */}
                      {isExpanded && (
                        <div className="p-4 bg-white space-y-4 border-t border-slate-100">
                          {(section.fields || []).map(field => (
                            <div key={field.key}>
                              <FieldRenderer
                                field={field}
                                stepData={editData}
                                onUpdate={(k, v) => setEditData(prev => ({ ...prev, [k]: v }))}
                                aiMode={docData?.ai_created || false}
                                allData={editData}
                              />
                            </div>
                          ))}
                          {section.subsections && section.subsections.map((sub, sidx) => (
                            <div key={sidx} className="space-y-4 pt-2">
                              <div className="border-b border-slate-50 pb-1">
                                <h5 className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                                  {sub.title}
                                </h5>
                              </div>
                              {sub.fields.map(field => (
                                <div key={field.key}>
                                  <FieldRenderer
                                    field={field}
                                    stepData={editData}
                                    onUpdate={(k, v) => setEditData(prev => ({ ...prev, [k]: v }))}
                                    aiMode={docData?.ai_created || false}
                                    allData={editData}
                                  />
                                </div>
                              ))}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                });
              })()}
            </div>

            {/* Sidebar Footer */}
            <div className="p-4 border-t border-slate-200 bg-slate-50 flex items-center gap-2">
              <button
                type="button"
                onClick={handleSaveAndRegenerate}
                disabled={isRegenerating}
                className="flex-1 py-3 px-4 bg-indigo-600 text-white rounded-xl font-bold text-xs hover:bg-indigo-700 disabled:opacity-50 transition-colors flex items-center justify-center gap-1.5 shadow-md shadow-indigo-100"
              >
                {isRegenerating ? (
                  <>
                    <span className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    Updating PDF...
                  </>
                ) : (
                  <>
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"/></svg>
                    Save & Regenerate PDF
                  </>
                )}
              </button>
            </div>
          </div>
        )}
      </div>

      {/* ── Toast Overlay ── */}
      {toastVisible && (
        <div className="fixed bottom-6 right-6 z-[100] px-5 py-3 rounded-2xl bg-slate-900 text-white text-sm font-semibold shadow-xl flex items-center gap-2 border border-slate-800 animate-slide-in">
          <span>{toast}</span>
        </div>
      )}

      {/* ── Signature Canvas Modal ── */}
      {isSigningModalOpen && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[90] flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl w-full max-w-2xl overflow-hidden shadow-2xl border border-slate-100 flex flex-col animate-scale-in">
            {/* Modal Header */}
            <div className="p-6 bg-gradient-to-r from-indigo-50 to-indigo-100/50 border-b border-indigo-100 flex items-center justify-between">
              <div>
                <h3 className="text-lg font-bold text-slate-800 flex items-center gap-2">
                  <svg className="w-5 h-5 text-indigo-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z"/></svg>
                  Draw/Type Signature
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">Apply authorized signature to this trade confirmation</p>
              </div>
              <button 
                onClick={() => setIsSigningModalOpen(false)}
                className="w-8 h-8 rounded-full bg-white hover:bg-slate-100 text-slate-400 hover:text-slate-600 flex items-center justify-center transition-colors border border-slate-100 shadow-sm"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12"/></svg>
              </button>
            </div>

            {/* Modal Tabs */}
            <div className="flex border-b border-slate-100 bg-slate-50 p-1 m-4 rounded-xl">
              <button
                type="button"
                onClick={() => {
                  setSignatureType('draw');
                  clearCanvas();
                }}
                className={`flex-1 py-2 text-xs font-bold rounded-lg transition-all ${signatureType === 'draw' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
              >
                🖌️ Draw Signature
              </button>
              <button
                type="button"
                onClick={() => {
                  setSignatureType('type');
                  clearCanvas();
                }}
                className={`flex-1 py-2 text-xs font-bold rounded-lg transition-all ${signatureType === 'type' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
              >
                ⌨️ Type Signature
              </button>
            </div>

            {/* Modal Content */}
            <div className="px-6 pb-6 flex flex-col gap-4 overflow-y-auto max-h-[75vh] custom-scrollbar">
              {signatureType === 'type' && (
                <div className="flex flex-col gap-3">
                  <label className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Type Name for Signature</label>
                  <input
                    type="text"
                    value={typedName}
                    onChange={(e) => setTypedName(e.target.value)}
                    placeholder="Type your name here..."
                    className="px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-slate-800 text-sm font-semibold focus:outline-none focus:border-indigo-400 focus:bg-white transition-all shadow-inner"
                    maxLength={40}
                  />
                  
                  {/* Font Options Preview */}
                  <div className="grid grid-cols-3 gap-2">
                    <button
                      type="button"
                      onClick={() => setActiveFont("'Great Vibes', cursive")}
                      style={{ fontFamily: 'Great Vibes, cursive' }}
                      className={`py-2 px-3 border rounded-xl text-sm transition-all truncate ${activeFont.includes('Great Vibes') ? 'border-indigo-500 bg-indigo-50/50 text-indigo-700 font-bold' : 'border-slate-200 hover:bg-slate-50 text-slate-600'}`}
                    >
                      {typedName || 'Great Vibes'}
                    </button>
                    <button
                      type="button"
                      onClick={() => setActiveFont("'Playball', cursive")}
                      style={{ fontFamily: 'Playball, cursive' }}
                      className={`py-2 px-3 border rounded-xl text-sm transition-all truncate ${activeFont.includes('Playball') ? 'border-indigo-500 bg-indigo-50/50 text-indigo-700 font-bold' : 'border-slate-200 hover:bg-slate-50 text-slate-600'}`}
                    >
                      {typedName || 'Playball'}
                    </button>
                    <button
                      type="button"
                      onClick={() => setActiveFont("'Caveat', cursive")}
                      style={{ fontFamily: 'Caveat, cursive', fontWeight: 'bold' }}
                      className={`py-2 px-3 border rounded-xl text-sm transition-all truncate ${activeFont.includes('Caveat') ? 'border-indigo-500 bg-indigo-50/50 text-indigo-700 font-bold' : 'border-slate-200 hover:bg-slate-50 text-slate-600'}`}
                    >
                      {typedName || 'Caveat'}
                    </button>
                  </div>
                </div>
              )}

              {/* Signature Board (Canvas) */}
              <div className="flex flex-col gap-1.5">
                <label className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">
                  {signatureType === 'draw' ? 'Draw Signature' : 'Signature Preview Canvas'}
                </label>
                <div className="relative border border-slate-200 bg-slate-50/50 rounded-2xl overflow-hidden shadow-inner flex flex-col items-center">
                  <canvas
                    ref={canvasRef}
                    width={500}
                    height={180}
                    className="bg-white cursor-crosshair max-w-full touch-none"
                    onMouseDown={startDrawing}
                    onMouseMove={draw}
                    onMouseUp={stopDrawing}
                    onMouseLeave={stopDrawing}
                    onTouchStart={startDrawing}
                    onTouchMove={draw}
                    onTouchEnd={stopDrawing}
                  />
                  {signatureType === 'draw' && (
                    <div className="absolute bottom-3 left-4 text-[10px] text-slate-400 font-bold pointer-events-none select-none uppercase tracking-widest">
                      Draw using mouse or touch screen
                    </div>
                  )}
                </div>
              </div>

              {/* Clear Board button */}
              <div className="flex justify-start">
                <button
                  type="button"
                  onClick={clearCanvas}
                  className="px-3 py-1 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-lg text-xs font-bold transition-colors shadow-sm"
                >
                  🧹 Clear Board
                </button>
              </div>

              {/* Signatory details input fields */}
              <div className="border-t border-slate-100 pt-4 flex flex-col gap-3">
                <div className="text-[11px] font-bold text-indigo-600 uppercase tracking-wider">Signatory Details</div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="flex flex-col gap-1">
                    <label className="text-[10px] font-bold text-slate-500">Signatory Name</label>
                    <input
                      type="text"
                      value={signatoryName}
                      onChange={(e) => setSignatoryName(e.target.value)}
                      placeholder="e.g. John Doe"
                      className="px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-slate-800 text-xs font-semibold focus:outline-none focus:border-indigo-400 focus:bg-white transition-all shadow-inner"
                    />
                  </div>
                  <div className="flex flex-col gap-1">
                    <label className="text-[10px] font-bold text-slate-500">Signatory Title</label>
                    <input
                      type="text"
                      value={signatoryTitle}
                      onChange={(e) => setSignatoryTitle(e.target.value)}
                      placeholder="e.g. Managing Director"
                      className="px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-slate-800 text-xs font-semibold focus:outline-none focus:border-indigo-400 focus:bg-white transition-all shadow-inner"
                    />
                  </div>
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-[10px] font-bold text-slate-500">Signatory Date</label>
                  <input
                    type="text"
                    value={signatoryDate}
                    onChange={(e) => setSignatoryDate(e.target.value)}
                    placeholder="e.g. 20 March 2026"
                    className="px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-slate-800 text-xs font-semibold focus:outline-none focus:border-indigo-400 focus:bg-white transition-all shadow-inner"
                  />
                </div>
              </div>

              {/* Adjustments (Scale and Offsets) */}
              <div className="border-t border-slate-100 pt-4 flex flex-col gap-3">
                <div className="text-[11px] font-bold text-indigo-600 uppercase tracking-wider">Signature Adjustments</div>
                
                {/* Size (Scale) */}
                <div className="flex flex-col gap-1">
                  <div className="flex justify-between text-[10px] font-bold text-slate-500">
                    <span>Size (Scale)</span>
                    <span className="text-indigo-600">{sigScale.toFixed(2)}x</span>
                  </div>
                  <input
                    type="range"
                    min="0.5"
                    max="1.5"
                    step="0.05"
                    value={sigScale}
                    onChange={(e) => setSigScale(parseFloat(e.target.value))}
                    className="w-full h-1.5 bg-slate-100 rounded-lg appearance-none cursor-pointer accent-indigo-600"
                  />
                </div>

                {/* X and Y Offsets in one row */}
                <div className="grid grid-cols-2 gap-4">
                  {/* X Offset */}
                  <div className="flex flex-col gap-1">
                    <div className="flex justify-between text-[10px] font-bold text-slate-500">
                      <span>Horizontal Shift (Left/Right)</span>
                      <span className="text-indigo-600">{sigXOffset > 0 ? `+${sigXOffset}` : sigXOffset}px</span>
                    </div>
                    <input
                      type="range"
                      min="-100"
                      max="100"
                      step="1"
                      value={sigXOffset}
                      onChange={(e) => setSigXOffset(parseInt(e.target.value))}
                      className="w-full h-1.5 bg-slate-100 rounded-lg appearance-none cursor-pointer accent-indigo-600"
                    />
                  </div>

                  {/* Y Offset */}
                  <div className="flex flex-col gap-1">
                    <div className="flex justify-between text-[10px] font-bold text-slate-500">
                      <span>Vertical Shift (Up/Down)</span>
                      <span className="text-indigo-600">{sigYOffset > 0 ? `+${sigYOffset}` : sigYOffset}px</span>
                    </div>
                    <input
                      type="range"
                      min="-50"
                      max="50"
                      step="1"
                      value={sigYOffset}
                      onChange={(e) => setSigYOffset(parseInt(e.target.value))}
                      className="w-full h-1.5 bg-slate-100 rounded-lg appearance-none cursor-pointer accent-indigo-600"
                    />
                  </div>
                </div>
              </div>

              {/* Live Preview Block */}
              <div className="border-t border-slate-100 pt-4">
                <div className="border border-slate-200 rounded-2xl p-4 bg-slate-50/50 flex flex-col gap-3">
                  <div className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Live PDF Signature Block Preview</div>
                  
                  <div className="bg-white border border-slate-100 rounded-xl p-5 shadow-sm min-h-[150px] flex flex-col justify-between relative overflow-hidden">
                    <div className="grid grid-cols-2 gap-4 text-left">
                      {/* Party A */}
                      <div>
                        <div className="text-[10px] font-black text-slate-800 border-b border-slate-100 pb-1 mb-1.5 truncate">
                          {docData?.data?.party_a_name || 'Party A'}
                        </div>
                        
                        <div className="relative h-12 border-b border-dashed border-slate-200 flex items-end mb-1.5">
                          <span className="text-[10px] text-slate-400 select-none mr-2 mb-0.5">By:</span>
                          {tempSigUrl && (
                            <img 
                              src={tempSigUrl} 
                              alt="Signature Preview" 
                              className="absolute pointer-events-none origin-bottom-left"
                              style={{
                                left: '20px',
                                bottom: '2px',
                                width: '112px', // 140px scaled down slightly for UI card
                                height: '40px', // 50px scaled down slightly for UI card
                                transform: `translate(${sigXOffset * 1.2}px, ${-sigYOffset * 0.8}px) scale(${sigScale})`,
                              }}
                            />
                          )}
                        </div>
                        
                        <div className="flex flex-col gap-0.5 text-[10px] leading-tight font-medium">
                          <div className="truncate"><span className="text-slate-400 font-normal">Name:</span> <span className="font-bold text-slate-700">{signatoryName || '—'}</span></div>
                          <div className="truncate"><span className="text-slate-400 font-normal">Title:</span> <span className="font-bold text-slate-700">{signatoryTitle || '—'}</span></div>
                          <div className="truncate"><span className="text-slate-400 font-normal">Date:</span> <span className="font-bold text-slate-700">{signatoryDate || '—'}</span></div>
                        </div>
                      </div>
                      
                      {/* Party B */}
                      <div className="opacity-30 select-none">
                        <div className="text-[10px] font-black text-slate-800 border-b border-slate-100 pb-1 mb-1.5 truncate">
                          {docData?.data?.party_b_name || docData?.data?.counterparty || 'Party B'}
                        </div>
                        <div className="h-12 border-b border-dashed border-slate-200 flex items-end mb-1.5">
                          <span className="text-[10px] text-slate-400 mr-2 mb-0.5">By:</span>
                        </div>
                        <div className="flex flex-col gap-0.5 text-[10px] leading-tight">
                          <div><span className="text-slate-400">Name:</span> <span>—</span></div>
                          <div><span className="text-slate-400">Title:</span> <span>—</span></div>
                          <div><span className="text-slate-400">Date:</span> <span>—</span></div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Modal Footer Controls */}
              <div className="flex items-center justify-end gap-2 border-t border-slate-100 pt-4 mt-2">
                <button
                  type="button"
                  onClick={() => setIsSigningModalOpen(false)}
                  className="px-4 py-2 bg-slate-50 border border-slate-200 text-slate-600 rounded-xl font-bold text-xs hover:bg-slate-100 transition-colors shadow-sm"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={submitSignature}
                  disabled={isSigningApiLoading}
                  className="px-4 py-2 bg-indigo-600 text-white rounded-xl font-bold text-xs hover:bg-indigo-700 transition-colors shadow-md shadow-indigo-100 flex items-center gap-1.5 disabled:opacity-50"
                >
                  {isSigningApiLoading ? (
                    <>
                      <span className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                      Signing...
                    </>
                  ) : (
                    'Confirm & Sign'
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Confirmation Modal before signing ─────────────────── */}
      {isConfirmSignOpen && (
        <div className="fixed inset-0 z-[110] overflow-y-auto" aria-labelledby="modal-title" role="dialog" aria-modal="true">
          <div className="flex min-h-screen items-end justify-center px-4 pt-4 pb-20 text-center sm:block sm:p-0">
            {/* Background overlay */}
            <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm transition-opacity" onClick={() => setIsConfirmSignOpen(false)}></div>

            {/* Trick to center modal content */}
            <span className="hidden sm:inline-block sm:h-screen sm:align-middle" aria-hidden="true">&#8203;</span>

            {/* Modal Panel */}
            <div className="relative inline-block transform overflow-hidden rounded-3xl bg-white text-left align-middle shadow-2xl transition-all sm:my-8 sm:w-full sm:max-w-md border border-slate-100 p-6">
              {/* Header Icon */}
              <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-amber-50 border border-amber-100 mb-4">
                <svg className="h-8 w-8 text-amber-600 animate-pulse" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"/>
                </svg>
              </div>

              {/* Title */}
              <h3 className="text-lg font-extrabold text-slate-900 text-center leading-6 mb-2">
                Digital Signature Warning
              </h3>

              {/* Warning Content */}
              <div className="mt-2 text-center">
                <p className="text-sm font-medium text-slate-600 leading-relaxed">
                  Once this PDF is signed, you will not be able to manipulate the signature or modify its fields.
                </p>
                <p className="text-xs font-semibold text-slate-400 mt-3">
                  Do you want to proceed with signing?
                </p>
              </div>

              {/* Action Buttons */}
              <div className="mt-6 flex flex-col gap-2.5 sm:flex-row sm:justify-end">
                <button
                  type="button"
                  onClick={() => setIsConfirmSignOpen(false)}
                  className="w-full sm:w-auto px-5 py-2.5 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 font-bold text-xs shadow-sm transition-all duration-200 focus:outline-none"
                >
                  No, Cancel
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setIsConfirmSignOpen(false);
                    setIsEditPanelOpen(false);
                    setIsSigningModalOpen(true);
                    setTimeout(() => clearCanvas(), 50);
                  }}
                  className="w-full sm:w-auto px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs shadow-md shadow-indigo-100 hover:shadow-lg transition-all duration-200 focus:outline-none flex items-center justify-center gap-1.5"
                >
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7"/>
                  </svg>
                  <span>Yes, Proceed to Sign</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Email Client Modal ── */}
      {isEmailModalOpen && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[95] flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl w-full max-w-lg overflow-hidden shadow-2xl border border-slate-100 flex flex-col animate-scale-in">
            {/* Modal Header */}
            <div className="p-6 bg-gradient-to-r from-indigo-50 to-indigo-100/50 border-b border-indigo-100 flex items-center justify-between">
              <div>
                <h3 className="text-lg font-bold text-slate-800 flex items-center gap-2">
                  <svg className="w-5 h-5 text-indigo-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"/></svg>
                  Email Signed Document to Client
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">Send secure link to client for countersignature</p>
              </div>
              <button 
                onClick={() => setIsEmailModalOpen(false)}
                className="w-8 h-8 rounded-full bg-white hover:bg-slate-100 text-slate-400 hover:text-slate-600 flex items-center justify-center transition-colors border border-slate-100 shadow-sm"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12"/></svg>
              </button>
            </div>

            {/* Modal Content */}
            <div className="p-6 flex flex-col gap-4">
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-black text-slate-400 uppercase tracking-widest">Client Email Address</label>
                <input
                  type="email"
                  value={clientEmail}
                  onChange={(e) => setClientEmail(e.target.value)}
                  placeholder="e.g. client@bank.com"
                  className="px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-slate-800 text-sm font-semibold focus:outline-none focus:border-indigo-400 focus:bg-white transition-all shadow-inner"
                />
              </div>

              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-black text-slate-400 uppercase tracking-widest">Email Subject</label>
                <input
                  type="text"
                  value={emailSubject}
                  onChange={(e) => setEmailSubject(e.target.value)}
                  placeholder="Email Subject"
                  className="px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-slate-800 text-sm font-semibold focus:outline-none focus:border-indigo-400 focus:bg-white transition-all shadow-inner"
                />
              </div>

              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-black text-slate-400 uppercase tracking-widest">Email Message Body (AI Drafted)</label>
                <textarea
                  value={emailBody}
                  onChange={(e) => setEmailBody(e.target.value)}
                  rows={6}
                  placeholder="Email Message Body..."
                  className="px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-slate-800 text-sm font-medium focus:outline-none focus:border-indigo-400 focus:bg-white transition-all shadow-inner resize-none"
                />
                <span className="text-[10px] text-slate-400 italic">
                  Note: A secure single-use signing link will be automatically appended to this email.
                </span>
              </div>

              {/* Modal Footer Controls */}
              <div className="flex items-center justify-end gap-2 mt-4">
                <button
                  type="button"
                  onClick={() => setIsEmailModalOpen(false)}
                  className="px-4 py-2 bg-slate-50 border border-slate-200 text-slate-600 rounded-xl font-bold text-xs hover:bg-slate-100 transition-colors shadow-sm"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={sendEmailToClient}
                  disabled={isSendingEmail}
                  className="px-4 py-2 bg-indigo-600 text-white rounded-xl font-bold text-xs hover:bg-indigo-700 transition-colors shadow-md shadow-indigo-100 flex items-center gap-1.5 disabled:opacity-50"
                >
                  {isSendingEmail ? (
                    <>
                      <span className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                      Sending...
                    </>
                  ) : (
                    'Send Email'
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
