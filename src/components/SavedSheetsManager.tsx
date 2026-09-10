import React, { useState } from 'react';
import { Layers, X, Save, Trash2, Link } from 'lucide-react';
import type { SavedSpreadsheet } from '../types';

interface SavedSheetsManagerProps {
  sheets: SavedSpreadsheet[];
  onAddSheet: (sheet: SavedSpreadsheet) => void;
  onDeleteSheet: (id: string) => void;
  onClose: () => void;
}

export const SavedSheetsManager: React.FC<SavedSheetsManagerProps> = ({
  sheets,
  onAddSheet,
  onDeleteSheet,
  onClose,
}) => {
  const [webhookUrl, setWebhookUrl] = useState('');
  
  // For simplified UI, we only use the first sheet/config
  const currentSheet = sheets[0];

  const handleSave = () => {
    if (!webhookUrl.trim()) return;
    
    // Replace the current config if it exists
    if (currentSheet) {
      onDeleteSheet(currentSheet.id);
    }
    
    onAddSheet({
      id: `config-${Date.now()}`,
      title: 'Default Google Sheet',
      url: '',
      spreadsheetId: '',
      tabName: 'Sheet1',
      webhookUrl: webhookUrl.trim(),
      createdAt: new Date().toISOString(),
    });
    
    onClose();
  };

  const handleRemove = () => {
    if (currentSheet) {
      onDeleteSheet(currentSheet.id);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-md">
      <div className="w-full max-w-lg bg-white rounded-3xl shadow-2xl overflow-hidden border border-slate-200">
        
        {/* Header */}
        <div className="px-6 py-5 border-b border-slate-100 flex items-center justify-between bg-slate-50">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl bg-emerald-100 flex items-center justify-center text-emerald-600">
              <Layers className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-slate-900 tracking-tight">Sheets Configuration</h2>
              <p className="text-xs text-slate-500">Link your Google Sheet using Apps Script Webhook</p>
            </div>
          </div>
          <button 
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-200/50 rounded-xl transition-all cursor-pointer"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-5">
          {currentSheet && currentSheet.webhookUrl ? (
            <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-xl">
              <h3 className="text-sm font-bold text-emerald-800 mb-1 flex items-center gap-2">
                <CheckCircle2Icon className="h-4 w-4" />
                Sheet Linked Successfully
              </h3>
              <p className="text-xs text-emerald-600 mb-3 break-all font-mono opacity-80 line-clamp-2">
                {currentSheet.webhookUrl}
              </p>
              <div className="flex gap-2">
                <button
                  onClick={handleRemove}
                  className="px-3 py-1.5 bg-white text-red-600 border border-red-200 hover:bg-red-50 text-xs font-bold rounded-lg transition-colors cursor-pointer flex items-center gap-1.5"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  Remove Link
                </button>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1.5">
                  Apps Script Webhook URL
                </label>
                <div className="relative">
                  <Link className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
                  <input
                    type="text"
                    placeholder="https://script.google.com/macros/s/.../exec"
                    value={webhookUrl}
                    onChange={(e) => setWebhookUrl(e.target.value)}
                    className="w-full pl-9 pr-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm font-mono focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
                  />
                </div>
                <p className="text-[10px] text-slate-500 mt-2">
                  To get this URL, go to Google Sheets &gt; Extensions &gt; Apps Script, paste the Webhook script code, and click "Deploy as Web App".
                </p>
              </div>

              <div className="flex justify-end pt-2">
                <button
                  onClick={handleSave}
                  disabled={!webhookUrl.trim()}
                  className="flex items-center gap-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-sm font-bold shadow-sm transition-all disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
                >
                  <Save className="h-4 w-4" />
                  Save Configuration
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

// Extracted from lucide-react above since it was missing
function CheckCircle2Icon(props: any) {
  return (
    <svg
      {...props}
      xmlns="http://www.w3.org/2000/svg"
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <circle cx="12" cy="12" r="10" />
      <path d="m9 12 2 2 4-4" />
    </svg>
  );
}
