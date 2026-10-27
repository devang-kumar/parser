import React, { useState } from 'react';
import { Layers, X, Save, Link, CheckCircle2, ExternalLink, Trash2, Edit3, HelpCircle } from 'lucide-react';
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
  const currentSheet = sheets[0];
  const [sheetUrl, setSheetUrl] = useState(currentSheet?.url || currentSheet?.spreadsheetId || '');
  const [tabName, setTabName] = useState(currentSheet?.tabName || 'Sheet1');
  const [isEditing, setIsEditing] = useState(!currentSheet?.url);
  const [errorMsg, setErrorMsg] = useState('');

  const handleSave = () => {
    const trimmed = sheetUrl.trim();
    if (!trimmed) {
      setErrorMsg('Please enter a valid Google Sheet URL or Spreadsheet ID.');
      return;
    }

    // Extract spreadsheet ID if full URL
    const idMatch = trimmed.match(/\/d\/([a-zA-Z0-9-_]+)/);
    const spreadsheetId = idMatch ? idMatch[1] : trimmed;

    if (spreadsheetId.length < 15) {
      setErrorMsg('The provided link does not appear to contain a valid Google Spreadsheet ID.');
      return;
    }

    setErrorMsg('');

    // Remove previous sheet config if exists
    if (currentSheet) {
      onDeleteSheet(currentSheet.id);
    }

    onAddSheet({
      id: `sheet-${Date.now()}`,
      title: 'Target Google Sheet',
      url: trimmed.startsWith('http') ? trimmed : `https://docs.google.com/spreadsheets/d/${trimmed}/edit`,
      spreadsheetId,
      tabName: tabName.trim() || 'Sheet1',
      createdAt: new Date().toISOString(),
    });

    setIsEditing(false);
  };

  const handleRemove = () => {
    if (currentSheet) {
      onDeleteSheet(currentSheet.id);
      setSheetUrl('');
      setTabName('Sheet1');
      setIsEditing(true);
    }
  };

  const handleStartEdit = () => {
    if (currentSheet) {
      setSheetUrl(currentSheet.url || currentSheet.spreadsheetId);
      setTabName(currentSheet.tabName || 'Sheet1');
    }
    setIsEditing(true);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-md">
      <div className="w-full max-w-lg bg-white rounded-3xl shadow-2xl overflow-hidden border border-slate-200 animate-in fade-in zoom-in-95 duration-150">
        
        {/* Header */}
        <div className="px-6 py-5 border-b border-slate-100 flex items-center justify-between bg-slate-50/80">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-2xl bg-emerald-100 flex items-center justify-center text-emerald-600 shadow-2xs">
              <Layers className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-900 tracking-tight">Google Sheet Link</h2>
              <p className="text-xs text-slate-500">Configure your destination Google Sheet for 1-click sync</p>
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

          {errorMsg && (
            <div className="p-3 bg-red-50 text-red-700 text-xs rounded-xl border border-red-200 font-medium">
              {errorMsg}
            </div>
          )}

          {/* Active Sheet Card */}
          {currentSheet?.url && !isEditing ? (
            <div className="p-4 bg-emerald-50/60 border border-emerald-200/80 rounded-2xl space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="inline-flex items-center gap-1.5 text-xs font-bold text-emerald-800">
                    <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                    Target Sheet Configured
                  </span>
                  <a
                    href={currentSheet.url}
                    target="_blank"
                    rel="noreferrer"
                    className="text-emerald-700 hover:text-emerald-900 inline-flex items-center gap-1 text-[11px] font-semibold underline ml-1"
                    title="Open sheet in new tab"
                  >
                    Open Sheet
                    <ExternalLink className="h-3 w-3" />
                  </a>
                </div>

                <div className="flex items-center gap-1.5">
                  <button
                    onClick={handleStartEdit}
                    className="inline-flex items-center gap-1 text-xs text-slate-700 hover:text-blue-700 font-semibold px-2.5 py-1 bg-white hover:bg-slate-100 rounded-lg border border-slate-200 shadow-2xs transition-colors cursor-pointer"
                  >
                    <Edit3 className="h-3 w-3" />
                    Edit
                  </button>
                  <button
                    onClick={handleRemove}
                    className="inline-flex items-center gap-1 text-xs text-rose-600 hover:text-rose-700 font-semibold px-2.5 py-1 bg-white hover:bg-rose-50 rounded-lg border border-slate-200 shadow-2xs transition-colors cursor-pointer"
                  >
                    <Trash2 className="h-3 w-3" />
                    Remove
                  </button>
                </div>
              </div>

              {/* URL preview */}
              <p className="text-xs text-slate-700 font-mono truncate bg-white p-2.5 rounded-xl border border-slate-200">
                {currentSheet.url}
              </p>

              <div className="flex items-center justify-between text-xs text-slate-600 pt-0.5">
                <span>
                  Destination Tab: <strong className="text-slate-900 font-semibold">{currentSheet.tabName || 'Sheet1'}</strong>
                </span>
                <span className="text-emerald-700 font-bold text-[11px] bg-emerald-100/90 px-2 py-0.5 rounded-full">
                  Ready for 1-Click Sync
                </span>
              </div>
            </div>
          ) : (
            /* Input Form */
            <div className="space-y-4 bg-slate-50/70 p-4 rounded-2xl border border-slate-200">
              <div>
                <label className="block text-xs font-bold text-slate-800 mb-1.5">
                  Google Sheet Link or Spreadsheet ID
                </label>
                <div className="relative">
                  <Link className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
                  <input
                    type="text"
                    placeholder="https://docs.google.com/spreadsheets/d/.../edit"
                    value={sheetUrl}
                    onChange={(e) => {
                      setSheetUrl(e.target.value);
                      setErrorMsg('');
                    }}
                    className="w-full pl-9 pr-3 py-2 bg-white border border-slate-300 rounded-xl text-xs font-mono focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-600 text-slate-800"
                  />
                </div>
                <p className="text-[11px] text-slate-500 mt-1">
                  Copy the full link from your browser's address bar when viewing your sheet.
                </p>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-800 mb-1.5">
                  Destination Tab Name (Optional)
                </label>
                <input
                  type="text"
                  placeholder="Sheet1"
                  value={tabName}
                  onChange={(e) => setTabName(e.target.value)}
                  className="w-full px-3 py-2 bg-white border border-slate-300 rounded-xl text-xs focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-600 text-slate-800"
                />
                <p className="text-[11px] text-slate-500 mt-1">
                  Default is <strong>Sheet1</strong>. If the tab doesn't exist, it will be automatically created.
                </p>
              </div>

              <div className="flex items-center justify-between pt-2 border-t border-slate-200/70">
                {currentSheet?.url && isEditing ? (
                  <button
                    onClick={() => setIsEditing(false)}
                    className="text-xs text-slate-600 hover:text-slate-800 font-semibold cursor-pointer"
                  >
                    Cancel
                  </button>
                ) : <div />}

                <button
                  onClick={handleSave}
                  disabled={!sheetUrl.trim()}
                  className="flex items-center gap-1.5 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold shadow-xs transition-all disabled:opacity-50 cursor-pointer"
                >
                  <Save className="h-3.5 w-3.5" />
                  Save Sheet Link
                </button>
              </div>
            </div>
          )}

          {/* Quick Info Box */}
          <div className="p-3.5 bg-blue-50/60 border border-blue-100 rounded-2xl flex items-start gap-2.5 text-xs text-slate-600">
            <HelpCircle className="h-4 w-4 text-blue-600 shrink-0 mt-0.5" />
            <div className="space-y-0.5">
              <span className="font-bold text-slate-900 block text-xs">How 1-Click Sync Works</span>
              <p className="text-[11px] text-slate-500 leading-relaxed">
                Whenever you click <strong>Sync to Google Sheets</strong> on your parsed transactions, your rows are instantly appended to this specific spreadsheet with an import timestamp.
              </p>
            </div>
          </div>

        </div>

        {/* Footer */}
        <div className="px-6 py-3.5 bg-slate-50 border-t border-slate-100 flex justify-end">
          <button
            onClick={onClose}
            className="px-4 py-1.5 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-semibold shadow-2xs transition-all cursor-pointer"
          >
            Done
          </button>
        </div>

      </div>
    </div>
  );
};
