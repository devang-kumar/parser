import React, { useState } from 'react';
import { X, Copy, Check, Zap } from 'lucide-react';
import { APPS_SCRIPT_CODE_TEMPLATE } from '../utils/sheetsSync';

interface SetupGuideModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const SetupGuideModal: React.FC<SetupGuideModalProps> = ({ isOpen, onClose }) => {
  const [copiedCode, setCopiedCode] = useState(false);

  if (!isOpen) return null;

  const handleCopyCode = () => {
    navigator.clipboard.writeText(APPS_SCRIPT_CODE_TEMPLATE);
    setCopiedCode(true);
    setTimeout(() => setCopiedCode(false), 2000);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-xs">
      <div className="bg-white w-full max-w-2xl rounded-2xl border border-slate-200 shadow-xl p-6 space-y-5 max-h-[90vh] overflow-y-auto">
        
        {/* Modal Header */}
        <div className="flex items-center justify-between border-b border-slate-100 pb-3.5">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-blue-50 text-blue-600 rounded-xl border border-blue-100">
              <Zap className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-900">Google Sheets Integration Guide</h2>
              <p className="text-xs text-slate-500">
                Fast Copy Matrix or 1-Click Apps Script Auto Sync
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-slate-800 bg-slate-100 rounded-lg cursor-pointer"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Option 1: Fast Copy Matrix (Zero Setup) */}
        <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 space-y-2">
          <div className="flex items-center gap-2">
            <span className="h-5 w-5 rounded-full bg-emerald-100 text-emerald-800 text-xs font-bold flex items-center justify-center border border-emerald-300">
              1
            </span>
            <h3 className="text-xs font-bold text-slate-800 uppercase tracking-wider">
              Option A: Fast Copy Matrix (Zero Setup Required)
            </h3>
          </div>
          <p className="text-xs text-slate-600 pl-7 leading-relaxed">
            Click <strong className="text-blue-600">"Copy Matrix"</strong> in the dashboard.
            Open your Google Sheet (Sheet X or Sheet Y), click cell <code className="bg-white px-1.5 py-0.5 rounded text-emerald-700 border border-slate-200 font-mono">A1</code>, and press <kbd className="bg-slate-200 px-1.5 py-0.5 rounded text-slate-800 font-mono text-[10px]">Ctrl + V</kbd>! Dates align to Column A, Prices to Column B, and Descriptions to Column C.
          </p>
        </div>

        {/* Option 2: 1-Click Google Apps Script Webhook */}
        <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="h-5 w-5 rounded-full bg-blue-100 text-blue-800 text-xs font-bold flex items-center justify-center border border-blue-300">
                2
              </span>
              <h3 className="text-xs font-bold text-slate-800 uppercase tracking-wider">
                Option B: 1-Click Direct Sync via Apps Script Webhook
              </h3>
            </div>
            <button
              onClick={handleCopyCode}
              className="flex items-center gap-1.5 px-3 py-1 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-bold shadow-xs transition-all cursor-pointer"
            >
              {copiedCode ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
              {copiedCode ? 'Code Copied!' : 'Copy Script Code'}
            </button>
          </div>

          <ol className="text-xs text-slate-600 pl-7 list-decimal space-y-1 leading-relaxed">
            <li>Open your target Google Sheet (Sheet X or Sheet Y).</li>
            <li>Click <strong className="text-slate-800">Extensions &gt; Apps Script</strong>.</li>
            <li>Paste the script code below and click <strong className="text-slate-800">Save</strong>.</li>
            <li>Click <strong className="text-slate-800">Deploy &gt; New deployment</strong>, choose <strong className="text-slate-800">Web App</strong>.</li>
            <li>Set "Who has access" to <strong className="text-emerald-700 font-bold">Anyone</strong>, click Deploy, and copy the Web App URL.</li>
            <li>Paste into <strong className="text-slate-800">Saved Sheets Manager</strong>. Sync with 1 click forever!</li>
          </ol>

          {/* Script Code Preview */}
          <div className="relative bg-slate-900 p-3 rounded-lg border border-slate-700 font-mono text-[11px] text-slate-200 max-h-36 overflow-y-auto">
            <pre className="whitespace-pre-wrap">{APPS_SCRIPT_CODE_TEMPLATE}</pre>
          </div>
        </div>

        <div className="flex justify-end pt-1">
          <button
            onClick={onClose}
            className="px-5 py-2 bg-slate-800 hover:bg-slate-900 text-white rounded-xl text-xs font-bold cursor-pointer"
          >
            Got It!
          </button>
        </div>

      </div>
    </div>
  );
};

