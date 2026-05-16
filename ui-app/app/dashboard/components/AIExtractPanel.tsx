'use client';

import React, { useState } from 'react';

interface AIExtractProps {
  text: string;
  onChange: (val: string) => void;
  onExtract: (model?: string) => void;
  onCancel: () => void;
}

export default function AIExtractPanel({ text, onChange, onExtract, onCancel }: AIExtractProps) {
  const [modelMode, setModelMode] = useState<'fast' | 'deep'>('fast');

  return (
    <div className="w-full max-w-3xl mx-auto animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div
        className="rounded-3xl bg-white overflow-hidden"
        style={{ border: '1px solid rgba(226,232,240,0.8)', boxShadow: '0 8px 40px rgba(79,70,229,0.08)' }}
      >
        {/* Header */}
        <div
          className="p-6 sm:p-8 lg:p-10 text-center relative overflow-hidden"
          style={{ background: 'linear-gradient(160deg, rgba(99,102,241,0.05) 0%, rgba(248,249,252,1) 100%)' }}
        >
          {/* Radial glow */}
          <div
            className="pointer-events-none absolute inset-0"
            style={{ background: 'radial-gradient(ellipse 60% 50% at 50% 0%, rgba(99,102,241,0.07) 0%, transparent 70%)' }}
          />

          <div className="relative z-10 flex items-center justify-center mx-auto mb-6">
            <img
              src="/logo.svg"
              alt="TradeDocAI Logo"
              className="w-20 h-20 sm:w-28 sm:h-28 lg:w-30 lg:h-30"
              style={{ animation: 'spin 35s linear infinite' }}
            />
          </div>

          <h2
            className="relative z-10 mb-2"
            style={{
              fontSize: 'clamp(30px, 8vw, 46px)',
              fontWeight: 700,
              color: '#0f172a',
              fontFamily: "'DM Serif Display', Georgia, serif",
              letterSpacing: '0.01em',
            }}
          >
            AI Intelligent Extraction
          </h2>
          <p
            className="relative z-10 max-w-md mx-auto text-xs sm:text-[13px]"
            style={{ color: '#94a3b8', fontFamily: "'DM Sans', system-ui, sans-serif", lineHeight: 1.65 }}
          >
            Paste your trade email text below. Our AI will automatically identify the product type and extract all required fields.
          </p>
        </div>

        {/* Body */}
        <div className="px-5 sm:px-8 lg:px-10 pb-6 sm:pb-10">
          {/* Feature pills & Model Toggle */}
          <div className="flex flex-col justify-between items-stretch mb-5 gap-4 sm:flex-row sm:items-center sm:flex-wrap">
            <div className="flex gap-2 flex-wrap">
              {['Auto-classify document type', 'Extract 30+ fields', 'ISDA-compliant output'].map((f) => (
                <span
                  key={f}
                  className="px-4 py-1.5 rounded-full"
                  style={{
                    fontSize: '12px',
                    fontWeight: 600,
                    color: '#4f46e5',
                    background: 'rgba(79,70,229,0.08)',
                    fontFamily: "'DM Sans', system-ui, sans-serif",
                    letterSpacing: '0.02em',
                  }}
                >
                  ✓ {f}
                </span>
              ))}
            </div>

            {/* Model Toggle */}
            <div className="grid grid-cols-2 items-center bg-slate-100 p-1 rounded-xl sm:flex" style={{ border: '1px solid rgba(226,232,240,0.8)' }}>
              <button
                onClick={() => setModelMode('fast')}
                className={`px-4 py-1.5 text-xs font-bold rounded-lg transition-all duration-300 flex items-center gap-1.5 ${modelMode === 'fast' ? 'bg-white shadow-sm text-indigo-600' : 'text-slate-500 hover:text-slate-700'}`}
                style={{ fontFamily: "'DM Sans', system-ui, sans-serif" }}
                title="Uses Gemini Flash for extremely fast extraction."
              >
                ⚡ Fast Mode
              </button>
              <button
                onClick={() => setModelMode('deep')}
                className={`px-4 py-1.5 text-xs font-bold rounded-lg transition-all duration-300 flex items-center gap-1.5 ${modelMode === 'deep' ? 'bg-white shadow-sm text-indigo-600' : 'text-slate-500 hover:text-slate-700'}`}
                style={{ fontFamily: "'DM Sans', system-ui, sans-serif" }}
                title="Uses Gemini Pro for deep, highly accurate extraction of complex documents."
              >
                🧠 Deep Mode
              </button>
            </div>
          </div>

          {/* Textarea */}
          <div className="relative">
            <textarea
              value={text}
              onChange={(e) => onChange(e.target.value)}
              placeholder={`e.g.,\nFrom: operations@bank.com\nTo: confirmations@client.com\nSubject: Trade Confirmation - NDF USD/INR\n\nWe are pleased to confirm the following Non-Deliverable Forward trade:\nTrade Date: 15-Sep-2026\nNotional: 10,000,000 USD\nStrike Rate: 82.50\nFixing Date: 15-Dec-2026\nValue Date: 17-Dec-2026\n\nPlease review and confirm if this matches your records.`}
              className="w-full h-48 sm:h-64 p-4 sm:p-6 text-[13px] sm:text-sm resize-none transition-all duration-300 focus:outline-none"
              style={{
                background: 'rgba(248,249,252,1)',
                border: '1.5px solid rgba(226,232,240,0.8)',
                borderRadius: '20px',
                color: '#334155',
                fontFamily: "'DM Sans', system-ui, sans-serif",
                lineHeight: 1.7,
                fontSize: '13px',
              }}
              onFocus={(e) => {
                e.currentTarget.style.borderColor = '#6366f1';
                e.currentTarget.style.background = '#fff';
                e.currentTarget.style.boxShadow = '0 0 0 3px rgba(99,102,241,0.08)';
              }}
              onBlur={(e) => {
                e.currentTarget.style.borderColor = 'rgba(226,232,240,0.8)';
                e.currentTarget.style.background = 'rgba(248,249,252,1)';
                e.currentTarget.style.boxShadow = 'none';
              }}
            />
            {!text && (
              <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none opacity-30">
                <svg width="36" height="36" fill="none" stroke="currentColor" viewBox="0 0 24 24" className="mb-2 text-slate-300">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
                <span style={{ fontSize: '10px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.14em', color: '#94a3b8', fontFamily: "'DM Sans', system-ui, sans-serif" }}>
                  Awaiting Input
                </span>
              </div>
            )}
          </div>

          {/* Actions */}
          <div className="flex flex-col sm:flex-row gap-2.5 sm:gap-3 mt-5 sm:mt-6">
            <button
              onClick={onCancel}
              className="flex-1 py-3.5 rounded-2xl font-bold text-sm transition-all duration-200"
              style={{
                background: 'rgba(241,245,249,1)',
                color: '#64748b',
                fontFamily: "'DM Sans', system-ui, sans-serif",
                border: '1px solid rgba(226,232,240,0.8)',
                fontSize: '13px',
              }}
              onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.background = 'rgba(226,232,240,0.8)'; }}
              onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.background = 'rgba(241,245,249,1)'; }}
            >
              Cancel
            </button>
            <button
              onClick={() => onExtract(modelMode === 'fast' ? 'gemini-flash-latest' : 'gemini-2.5-pro')}
              disabled={!text.trim()}
              className="flex-[2] py-3.5 rounded-2xl font-bold text-[15px] flex items-center justify-center gap-2.5 transition-all duration-300"
              style={{
                background: '#4f46e5',
                color: 'white',
                fontFamily: "'DM Sans', system-ui, sans-serif",
                letterSpacing: '0.04em',
                boxShadow: '0 10px 25px rgba(79,70,229,0.35)',
                opacity: 1,
                cursor: text.trim() ? 'pointer' : 'not-allowed',
              }}
              onMouseEnter={(e) => {
                if (text.trim()) {
                  (e.currentTarget as HTMLButtonElement).style.transform = 'translateY(-2px)';
                  (e.currentTarget as HTMLButtonElement).style.boxShadow = '0 15px 35px rgba(24,20,243,0.45)';
                }
              }}
              onMouseLeave={(e) => {
                if (text.trim()) {
                  (e.currentTarget as HTMLButtonElement).style.transform = 'translateY(0)';
                  (e.currentTarget as HTMLButtonElement).style.boxShadow = '0 10px 25px rgba(24,20,243,0.35)';
                }
              }}
            >
              <svg width="18" height="18" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M13 10V3L4 14h7v7l9-11h-7z" />
              </svg>
              Run AI Engine ({modelMode === 'fast' ? 'Fast' : 'Deep'})
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
