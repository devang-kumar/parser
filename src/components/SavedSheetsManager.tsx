import React, { useState, useEffect } from 'react';
import { Layers, X, Save, Link, Sparkles, CheckCircle2, LogOut, ExternalLink, HelpCircle } from 'lucide-react';
import type { SavedSpreadsheet } from '../types';
import {
  requestGoogleAccessToken,
  isGoogleConnected,
  getConnectedGoogleAccount,
  disconnectGoogleAccount,
} from '../utils/googleAuth';

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
  const [connectedAccount, setConnectedAccount] = useState<{ email: string | null; name: string | null; picture: string | null } | null>(null);
  const [errorMsg, setErrorMsg] = useState('');
  const [isEditingTarget, setIsEditingTarget] = useState(false);

  const currentSheet = sheets[0];

  useEffect(() => {
    const connected = isGoogleConnected();
    setGoogleConnected(connected);
    if (connected) {
      setConnectedAccount(getConnectedGoogleAccount());
    }
  }, []);

  const handleConnectGoogle = async () => {
    setIsConnectingGoogle(true);
    setErrorMsg('');
    try {
      // Force interactive prompt when user explicitly clicks "Connect" or "Change Account"
      await requestGoogleAccessToken(true);
      setGoogleConnected(true);
      setConnectedAccount(getConnectedGoogleAccount());
    } catch (err: any) {
      setErrorMsg(err.message || 'Failed to connect Google account');
    } finally {
      setIsConnectingGoogle(false);
    }
  };

  const handleDisconnectGoogle = () => {
    disconnectGoogleAccount();
    setGoogleConnected(false);
    setConnectedAccount(null);
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

    setIsEditingTarget(false);
    setSheetUrl('');
  };

  const handleRemoveTarget = () => {
    if (currentSheet) {
      onDeleteSheet(currentSheet.id);
      setIsEditingTarget(false);
    }
  };

  const startEditTarget = () => {
    if (currentSheet) {
      setSheetUrl(currentSheet.url || currentSheet.spreadsheetId);
      setTabName(currentSheet.tabName || 'Sheet1');
      setIsEditingTarget(true);
    }
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
              <h2 className="text-base font-bold text-slate-900 tracking-tight">Google Sheets Configuration</h2>
              <p className="text-xs text-slate-500">Connect once for 1-click sync without repeated logins</p>
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
        <div className="p-6 space-y-5 max-h-[80vh] overflow-y-auto">
          
          {/* Section 1: Persistent Google Account OAuth */}
          <div className="p-4 bg-gradient-to-br from-blue-50/70 to-indigo-50/40 border border-blue-100 rounded-2xl space-y-3.5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="w-7 h-7 rounded-xl bg-white flex items-center justify-center shadow-2xs border border-blue-100/50">
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
                <div>
                  <span className="text-xs font-bold text-slate-900 block">Google Account Linking</span>
                  <span className="text-[11px] text-slate-500">Connect once to stay linked</span>
                </div>
              </div>

              {googleConnected ? (
                <span className="inline-flex items-center gap-1 text-[11px] font-bold text-emerald-700 bg-emerald-100/90 border border-emerald-200 px-2.5 py-0.5 rounded-full">
                  <CheckCircle2 className="h-3 w-3" /> Linked & Active
                </span>
              ) : (
                <span className="text-[11px] font-medium text-slate-500 bg-slate-100 px-2 py-0.5 rounded-full">
                  Not Connected
                </span>
              )}
            </div>

            {googleConnected ? (
              <div className="bg-white/80 border border-blue-200/60 rounded-xl p-3 flex items-center justify-between gap-3">
                <div className="flex items-center gap-2.5 min-w-0">
                  {connectedAccount?.picture ? (
                    <img
                      src={connectedAccount.picture}
                      alt="Google avatar"
                      className="w-8 h-8 rounded-full border border-slate-200 shrink-0"
                    />
                  ) : (
                    <div className="w-8 h-8 rounded-full bg-blue-600 text-white font-bold text-xs flex items-center justify-center shrink-0 shadow-2xs">
                      {(connectedAccount?.name || connectedAccount?.email || 'G')[0].toUpperCase()}
                    </div>
                  )}
                  <div className="min-w-0">
                    <p className="text-xs font-bold text-slate-900 truncate">
                      {connectedAccount?.name || 'Connected Google Account'}
                    </p>
                    <p className="text-[11px] text-slate-500 truncate font-mono">
                      {connectedAccount?.email || 'Authorized for Google Sheets'}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  <button
                    onClick={handleConnectGoogle}
                    disabled={isConnectingGoogle}
                    className="text-[11px] text-blue-600 hover:text-blue-800 font-semibold px-2 py-1 rounded-lg hover:bg-blue-50 transition-colors cursor-pointer"
                    title="Switch or re-link account"
                  >
                    Switch
                  </button>
                  <button
                    onClick={handleDisconnectGoogle}
                    className="flex items-center gap-1 text-[11px] text-red-600 hover:text-red-700 font-semibold px-2 py-1 rounded-lg hover:bg-red-50 transition-colors cursor-pointer"
                    title="Disconnect Google account"
                  >
                    <LogOut className="h-3 w-3" /> Disconnect
                  </button>
                </div>
              </div>
            ) : (
              <div className="space-y-2">
                <p className="text-xs text-slate-600 leading-relaxed">
                  Link your Google account once. Your authorization is remembered so you can sync statement transactions straight to Google Sheets with 1-click at any time.
                </p>
                <button
                  onClick={handleConnectGoogle}
                  disabled={isConnectingGoogle}
                  className="w-full flex items-center justify-center gap-2 py-2 px-4 bg-white hover:bg-slate-50 text-slate-800 font-semibold text-xs rounded-xl border border-slate-200 shadow-2xs transition-all cursor-pointer disabled:opacity-50"
                >
                  <Sparkles className="h-3.5 w-3.5 text-blue-600" />
                  {isConnectingGoogle ? 'Connecting with Google...' : 'Link Google Account (1-Click)'}
                </button>
              </div>
            )}
          </div>

          {errorMsg && (
            <div className="p-3 bg-red-50 text-red-700 text-xs rounded-xl border border-red-200">
              {errorMsg}
            </div>
          )}

          {/* Section 2: Optional Target Spreadsheet URL */}
          <div className="space-y-3 pt-1 border-t border-slate-100">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-xs font-bold text-slate-800 uppercase tracking-wider">
                  Target Spreadsheet (Optional)
                </h3>
                <p className="text-[11px] text-slate-500">
                  Specify a specific spreadsheet URL to sync into
                </p>
              </div>
            </div>

            {currentSheet?.url && !isEditingTarget ? (
              <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-2xl space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5">
                    <span className="text-xs font-bold text-slate-800">Target Sheet Configured</span>
                    <a
                      href={currentSheet.url}
                      target="_blank"
                      rel="noreferrer"
                      className="text-slate-400 hover:text-slate-600"
                      title="Open sheet in new tab"
                    >
                      <ExternalLink className="h-3 w-3" />
                    </a>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={startEditTarget}
                      className="text-[11px] text-blue-600 hover:text-blue-700 font-semibold cursor-pointer"
                    >
                      Edit
                    </button>
                    <button
                      onClick={handleRemoveTarget}
                      className="text-[11px] text-red-600 hover:text-red-700 font-semibold cursor-pointer"
                    >
                      Remove
                    </button>
                  </div>
                </div>

                <p className="text-xs text-slate-600 truncate font-mono bg-white p-2 rounded-lg border border-slate-200/80">
                  {currentSheet.url}
                </p>

                <div className="flex items-center justify-between text-[11px] text-slate-500 pt-0.5">
                  <span>
                    Tab: <strong className="text-slate-800">{currentSheet.tabName || 'Sheet1'}</strong>
                  </span>
                  <span className="text-emerald-600 font-medium">Ready for Sync</span>
                </div>
              </div>
            ) : (
              <div className="space-y-3 bg-slate-50/70 p-3.5 rounded-2xl border border-slate-200/80">
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Google Sheet URL or Spreadsheet ID
                  </label>
                  <div className="relative">
                    <Link className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
                    <input
                      type="text"
                      placeholder="https://docs.google.com/spreadsheets/d/..."
                      value={sheetUrl}
                      onChange={(e) => setSheetUrl(e.target.value)}
                      className="w-full pl-9 pr-3 py-2 bg-white border border-slate-200 rounded-xl text-xs font-mono focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
                    />
                  </div>
                  <span className="text-[10px] text-slate-400 mt-1 block">
                    Leave blank to auto-create and append to your Master Sheet in Drive.
                  </span>
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Tab Name (Default: Sheet1)
                  </label>
                  <input
                    type="text"
                    placeholder="Sheet1"
                    value={tabName}
                    onChange={(e) => setTabName(e.target.value)}
                    className="w-full px-3 py-1.5 bg-white border border-slate-200 rounded-xl text-xs focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
                  />
                </div>

                <div className="flex items-center justify-between pt-1">
                  {isEditingTarget ? (
                    <button
                      onClick={() => setIsEditingTarget(false)}
                      className="text-xs text-slate-500 hover:text-slate-700 font-medium cursor-pointer"
                    >
                      Cancel
                    </button>
                  ) : <div />}
                  <button
                    onClick={handleSaveSheet}
                    disabled={!sheetUrl.trim()}
                    className="flex items-center gap-1.5 px-3.5 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold shadow-2xs transition-all disabled:opacity-50 cursor-pointer"
                  >
                    <Save className="h-3.5 w-3.5" />
                    Save Target Sheet
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Section 3: Dual Destination Explanation */}
          <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 text-slate-600 flex items-start gap-2.5 text-xs">
            <HelpCircle className="h-4 w-4 text-blue-500 shrink-0 mt-0.5" />
            <div className="space-y-1">
              <span className="font-semibold text-slate-800 block text-[11px]">Sync Destination Choice</span>
              <p className="text-[11px] text-slate-500 leading-normal">
                If both a <strong>Target Sheet URL</strong> and a <strong>Linked Google Account</strong> are available, clicking <strong>Sync to Google Sheets</strong> will present you with an option to choose which sheet to export to.
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
