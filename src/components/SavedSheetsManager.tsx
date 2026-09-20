import React, { useState, useEffect } from 'react';
import { Layers, X, Save, Link, Sparkles, CheckCircle2 } from 'lucide-react';
import type { SavedSpreadsheet } from '../types';
import { requestGoogleAccessToken } from '../utils/googleAuth';

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
  const [sheetUrl, setSheetUrl] = useState('');
  const [tabName, setTabName] = useState('Sheet1');
  const [isConnectingGoogle, setIsConnectingGoogle] = useState(false);
  const [googleConnected, setGoogleConnected] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  const currentSheet = sheets[0];

  useEffect(() => {
    if (localStorage.getItem('google_oauth_connected') === 'true') {
      setGoogleConnected(true);
    }
  }, []);

  const handleConnectGoogle = async () => {
    setIsConnectingGoogle(true);
    setErrorMsg('');
    try {
      await requestGoogleAccessToken();
      localStorage.setItem('google_oauth_connected', 'true');
      setGoogleConnected(true);
    } catch (err: any) {
      setErrorMsg(err.message || 'Failed to connect Google account');
    } finally {
      setIsConnectingGoogle(false);
    }
  };

  const handleSaveSheet = () => {
    if (!sheetUrl.trim()) return;

    if (currentSheet) {
      onDeleteSheet(currentSheet.id);
    }

    onAddSheet({
      id: `config-${Date.now()}`,
      title: 'Target Google Sheet',
      url: sheetUrl.trim(),
      spreadsheetId: sheetUrl.trim(),
      tabName: tabName.trim() || 'Sheet1',
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
              <h2 className="text-lg font-bold text-slate-900 tracking-tight">Google Sheets Integration</h2>
              <p className="text-xs text-slate-500">1-Click Google export with zero friction</p>
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
          {/* Section 1: 1-Click Google OAuth */}
          <div className="p-4 bg-blue-50/70 border border-blue-100 rounded-2xl space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="w-6 h-6 rounded-full bg-white flex items-center justify-center shadow-2xs">
                  <svg className="w-4 h-4" viewBox="0 0 24 24">
                    <path
                      fill="#4285F4"
                      d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                    />
                    <path
                      fill="#34A853"
                      d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                    />
                    <path
                      fill="#FBBC05"
                      d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
                    />
                    <path
                      fill="#EA4335"
                      d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
                    />
                  </svg>
                </div>
                <span className="text-xs font-bold text-slate-900">Google Account Connection</span>
              </div>

              {googleConnected ? (
                <span className="inline-flex items-center gap-1 text-[11px] font-bold text-emerald-600 bg-emerald-100/80 px-2 py-0.5 rounded-full">
                  <CheckCircle2 className="h-3 w-3" /> Connected
                </span>
              ) : (
                <span className="text-[11px] text-slate-500">Not connected</span>
              )}
            </div>

            <p className="text-xs text-slate-600">
              Connect your Google account once to export statement transactions straight to Google Sheets with a single click.
            </p>

            <button
              onClick={handleConnectGoogle}
              disabled={isConnectingGoogle}
              className="w-full flex items-center justify-center gap-2 py-2 px-4 bg-white hover:bg-slate-50 text-slate-800 font-semibold text-xs rounded-xl border border-slate-200 shadow-2xs transition-all cursor-pointer disabled:opacity-50"
            >
              <Sparkles className="h-3.5 w-3.5 text-blue-600" />
              {isConnectingGoogle ? 'Connecting...' : googleConnected ? 'Re-authorize Google' : 'Connect Google Sheets (1-Click)'}
            </button>
          </div>

          {errorMsg && (
            <div className="p-3 bg-red-50 text-red-700 text-xs rounded-xl border border-red-200">
              {errorMsg}
            </div>
          )}

          {/* Section 2: Optional Target Sheet Link */}
          <div className="space-y-3 pt-2">
            <h3 className="text-xs font-bold text-slate-700 uppercase tracking-wider">
              Target Spreadsheet (Optional)
            </h3>

            {currentSheet?.url ? (
              <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-xl space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-slate-800">Saved Sheet</span>
                  <button
                    onClick={handleRemove}
                    className="text-[11px] text-red-600 hover:text-red-700 font-medium cursor-pointer"
                  >
                    Remove
                  </button>
                </div>
                <p className="text-xs text-slate-500 truncate font-mono">{currentSheet.url}</p>
                <div className="text-[11px] text-slate-500">
                  Tab Name: <span className="font-semibold text-slate-700">{currentSheet.tabName}</span>
                </div>
              </div>
            ) : (
              <div className="space-y-3">
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">
                    Existing Google Sheet URL or ID (Leave blank to auto-create a new sheet)
                  </label>
                  <div className="relative">
                    <Link className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
                    <input
                      type="text"
                      placeholder="https://docs.google.com/spreadsheets/d/..."
                      value={sheetUrl}
                      onChange={(e) => setSheetUrl(e.target.value)}
                      className="w-full pl-9 pr-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-mono focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">
                    Tab Name (Default: Sheet1)
                  </label>
                  <input
                    type="text"
                    placeholder="Sheet1"
                    value={tabName}
                    onChange={(e) => setTabName(e.target.value)}
                    className="w-full px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-xs focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
                  />
                </div>

                <div className="flex justify-end pt-1">
                  <button
                    onClick={handleSaveSheet}
                    disabled={!sheetUrl.trim()}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold shadow-2xs transition-all disabled:opacity-50 cursor-pointer"
                  >
                    <Save className="h-3.5 w-3.5" />
                    Save Target Sheet
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
