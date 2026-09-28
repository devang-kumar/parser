import React, { useState } from 'react';
import {
  FileSpreadsheet,
  CheckCircle2,
  Copy,
  Download,
  Send,
  AlertTriangle,
  Search,
  Eye,
  Edit2,
  Check,
  Trash2,
  Layers,
  Sparkles,
  ArrowRight,
  X,
} from 'lucide-react';
import type { TransactionRow, SavedSpreadsheet } from '../types';
import {
  formatForGoogleSheetsClipboard,
  downloadCSV,
  syncToGoogleSheetsWebhook,
} from '../utils/sheetsSync';
import {
  syncToMasterSheet,
  syncToExistingSheet,
  isGoogleConnected,
  getConnectedGoogleAccount,
  getMasterSheetId,
} from '../utils/googleAuth';

interface TransactionValidatorProps {
  transactions: TransactionRow[];
  savedSheets: SavedSpreadsheet[];
  onUpdateTransaction: (id: string, updated: Partial<TransactionRow>) => void;
  onDeleteTransaction: (id: string) => void;
  onClearAll: () => void;
  onOpenSheetsManager?: () => void;
}

export const TransactionValidator: React.FC<TransactionValidatorProps> = ({
  transactions,
  savedSheets,
  onUpdateTransaction,
  onDeleteTransaction,
  onClearAll,
  onOpenSheetsManager,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [auditRowId, setAuditRowId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDate, setEditDate] = useState('');
  const [editPrice, setEditPrice] = useState('');
  const [editDesc, setEditDesc] = useState('');
  const [copySuccess, setCopySuccess] = useState(false);
  const [syncStatus, setSyncStatus] = useState<{ loading: boolean; message?: string; isError?: boolean }>({
    loading: false,
  });
  const [showDestinationModal, setShowDestinationModal] = useState(false);
  const [lastSheetUrl, setLastSheetUrl] = useState<string | null>(null);

  // Filter transactions
  const filtered = transactions.filter((t) => {
    return (
      t.chargeInformation.toLowerCase().includes(searchQuery.toLowerCase()) ||
      t.date.includes(searchQuery) ||
      t.pricePaidFormatted.includes(searchQuery)
    );
  });

  const totalAmount = transactions.reduce((sum, t) => sum + t.pricePaid, 0);

  const startEdit = (row: TransactionRow) => {
    setEditingId(row.id);
    setEditDate(row.date);
    setEditPrice(row.pricePaid.toString());
    setEditDesc(row.chargeInformation);
  };

  const saveEdit = (id: string) => {
    const num = parseFloat(editPrice);
    if (!isNaN(num)) {
      onUpdateTransaction(id, {
        date: editDate,
        pricePaid: num,
        pricePaidFormatted: num < 0 ? `-$${Math.abs(num).toFixed(2)}` : `$${num.toFixed(2)}`,
        chargeInformation: editDesc,
      });
    }
    setEditingId(null);
  };

  const handleCopyMatrix = () => {
    const tsv = formatForGoogleSheetsClipboard(filtered);
    navigator.clipboard.writeText(tsv);
    setCopySuccess(true);
    setTimeout(() => setCopySuccess(false), 2500);
  };

  const handleExportCSV = () => {
    downloadCSV(filtered, `Bank_Statements`);
  };

  const targetSheet = savedSheets[0];
  const hasValidTargetSheet = Boolean(
    targetSheet &&
      ((targetSheet.url && targetSheet.url.includes('/d/')) ||
        (targetSheet.spreadsheetId &&
          targetSheet.spreadsheetId.length > 15 &&
          !targetSheet.spreadsheetId.startsWith('config-')))
  );

  const isGoogleLinked = isGoogleConnected() || Boolean(getMasterSheetId());
  const connectedAccount = getConnectedGoogleAccount();

  const executeSync = async (mode: 'target' | 'master') => {
    setShowDestinationModal(false);
    if (filtered.length === 0) return;

    setSyncStatus({
      loading: true,
      message: mode === 'target' ? 'Syncing to Target Sheet...' : 'Syncing to Google Master Sheet...',
    });
    setLastSheetUrl(null);

    try {
      let res;
      if (mode === 'target' && targetSheet) {
        res = await syncToExistingSheet(
          targetSheet.url || targetSheet.spreadsheetId,
          targetSheet.tabName || 'Sheet1',
          filtered
        );
      } else {
        // Master Sheet in user's Drive
        res = await syncToMasterSheet(filtered, undefined, 'Transactions');
      }

      if (res.success) {
        if (res.spreadsheetUrl) setLastSheetUrl(res.spreadsheetUrl);
        setSyncStatus({
          loading: false,
          message: res.message,
          isError: false,
        });
      } else {
        // Fallback: If webhook is configured on target sheet, attempt webhook
        if (mode === 'target' && targetSheet?.webhookUrl) {
          const webhookRes = await syncToGoogleSheetsWebhook(
            targetSheet.webhookUrl,
            targetSheet.spreadsheetId,
            targetSheet.tabName,
            filtered
          );
          setSyncStatus({
            loading: false,
            message: webhookRes.message,
            isError: !webhookRes.success,
          });
        } else {
          setSyncStatus({
            loading: false,
            message: res.message,
            isError: true,
          });
        }
      }
    } catch (err: any) {
      setSyncStatus({
        loading: false,
        message: err.message || 'Failed to sync with Google Sheet',
        isError: true,
      });
    }
  };

  const handleInitiateSync = () => {
    if (filtered.length === 0) return;

    // If BOTH target sheet and Google account linking are available:
    if (hasValidTargetSheet && isGoogleLinked) {
      setShowDestinationModal(true);
      return;
    }

    // If only target sheet is configured:
    if (hasValidTargetSheet) {
      executeSync('target');
      return;
    }

    // Default to Google master sheet (will trigger 1-time link if needed)
    executeSync('master');
  };

  return (
    <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-xs space-y-5">
      
      {/* Header & Metric Summary Cards */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-3.5 border-b border-slate-100">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
              <FileSpreadsheet className="h-5 w-5 text-emerald-600" />
              Parsed Transactions
            </h2>
            <span className="text-xs bg-slate-100 text-slate-700 font-semibold px-2.5 py-0.5 rounded-full border border-slate-200">
              {filtered.length} Rows
            </span>
          </div>
          <p className="text-xs text-slate-500 mt-0.5">
            Review and edit your transactions before syncing.
          </p>
        </div>

        {/* Totals */}
        <div className="flex items-center gap-3">
          <div className="bg-slate-50 border border-slate-200 p-2 px-4 rounded-xl text-xs">
            <span className="text-slate-500 font-medium">Total Amount: </span>
            <span className="font-mono font-bold text-slate-900 ml-1">${totalAmount.toFixed(2)}</span>
          </div>
        </div>
      </div>

      {/* Filter Bar & Quick Sync Actions */}
      <div className="flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-3 bg-slate-50 p-3 rounded-xl border border-slate-200">
        
        {/* Left Search */}
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative flex-1 min-w-[220px]">
            <input
              type="text"
              placeholder="Search vendor, date, or price..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-white border border-slate-300 pl-8 pr-3 py-1.5 rounded-lg text-xs focus:ring-2 focus:ring-blue-500/20 focus:border-blue-600 outline-none"
            />
            <Search className="h-3.5 w-3.5 text-slate-400 absolute left-2.5 top-2" />
          </div>
        </div>

        {/* Right Export / Sync Controls */}
        <div className="flex flex-wrap items-center gap-2">
          
          <button
            onClick={handleCopyMatrix}
            disabled={filtered.length === 0}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all border cursor-pointer ${
              copySuccess
                ? 'bg-emerald-600 text-white border-emerald-600'
                : 'bg-white hover:bg-slate-100 text-slate-700 border-slate-300 shadow-2xs'
            }`}
            title="Copies tab-separated matrix. Press Ctrl+V directly into Google Sheets!"
          >
            {copySuccess ? (
              <>
                <CheckCircle2 className="h-3.5 w-3.5" />
                Copied!
              </>
            ) : (
              <>
                <Copy className="h-3.5 w-3.5 text-blue-600" />
                Copy Data
              </>
            )}
          </button>

          {/* Attach / Configure Target Google Sheet */}
          {onOpenSheetsManager && (
            <button
              onClick={onOpenSheetsManager}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-white hover:bg-slate-100 text-slate-700 rounded-lg border border-slate-300 text-xs font-semibold shadow-2xs transition-all cursor-pointer"
              title={
                savedSheets[0]?.url
                  ? `Target: ${savedSheets[0].url} (Tab: ${savedSheets[0].tabName})`
                  : 'Attach an existing Google Sheet URL or ID'
              }
            >
              <Layers className="h-3.5 w-3.5 text-emerald-600" />
              <span>{savedSheets[0]?.url ? 'Target Sheet' : 'Attach Sheet'}</span>
            </button>
          )}

          {/* 1-Click Sync to Google Sheets via Google OAuth */}
          <button
            onClick={handleInitiateSync}
            disabled={filtered.length === 0 || syncStatus.loading}
            className="flex items-center gap-2 px-4 py-1.5 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 text-white rounded-lg text-xs font-bold shadow-xs transition-all disabled:opacity-50 cursor-pointer"
            title="Export directly to Google Sheets (Target Sheet or Master Sheet)"
          >
            <Send className="h-3.5 w-3.5" />
            {syncStatus.loading ? 'Syncing...' : 'Sync to Google Sheets'}
          </button>

          {/* Export CSV */}
          <button
            onClick={handleExportCSV}
            disabled={filtered.length === 0}
            className="p-1.5 bg-white hover:bg-slate-100 text-slate-600 rounded-lg border border-slate-300 text-xs shadow-2xs cursor-pointer"
            title="Download CSV file"
          >
            <Download className="h-4 w-4" />
          </button>

          {transactions.length > 0 && (
            <div className="pl-2 border-l border-slate-300">
              <button
                onClick={onClearAll}
                className="p-1.5 bg-white hover:bg-red-50 text-slate-400 hover:text-red-600 rounded-lg border border-slate-300 text-xs cursor-pointer transition-colors"
                title="Clear all parsed transactions"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Sync Status Banner */}
      {syncStatus.message && (
        <div
          className={`p-3 rounded-xl text-xs flex flex-wrap items-center justify-between gap-2 border ${
            syncStatus.isError
              ? 'bg-red-50 text-red-700 border-red-200'
              : 'bg-emerald-50 text-emerald-700 border-emerald-200'
          }`}
        >
          <div className="flex items-center gap-2">
            {syncStatus.isError ? (
              <AlertTriangle className="h-4 w-4 shrink-0 text-red-600" />
            ) : (
              <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600" />
            )}
            <span className="font-medium">{syncStatus.message}</span>
          </div>

          <div className="flex items-center gap-3">
            {lastSheetUrl && (
              <a
                href={lastSheetUrl}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 font-bold text-emerald-800 underline hover:text-emerald-950"
              >
                Open in Google Sheets ↗
              </a>
            )}
            <button
              onClick={() => setSyncStatus({ loading: false })}
              className="text-slate-500 hover:text-slate-800 text-[10px] cursor-pointer"
            >
              Dismiss
            </button>
          </div>
        </div>
      )}

      {/* Transactions Data Table */}
      {filtered.length === 0 ? (
        <div className="p-10 text-center bg-slate-50 rounded-xl border border-dashed border-slate-300 space-y-1.5">
          <Layers className="h-7 w-7 text-slate-400 mx-auto" />
          <p className="text-sm font-semibold text-slate-700">No transactions to display</p>
          <p className="text-xs text-slate-500">
            Upload your bank statement to see data here.
          </p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-slate-200 max-h-[520px] overflow-y-auto shadow-2xs">
          <table className="w-full text-left text-xs border-collapse">
            <thead className="sticky top-0 z-10 bg-slate-100/90 backdrop-blur-xs border-b border-slate-200 text-slate-600 font-bold uppercase text-[10px] tracking-wider">
              <tr>
                <th className="py-3 px-3 w-12 text-center">Row</th>
                <th className="py-3 px-3 w-32">Date</th>
                <th className="py-3 px-3 w-36">Amount</th>
                <th className="py-3 px-3">Description</th>
                <th className="py-3 px-3 w-28 text-center">Audit</th>
                <th className="py-3 px-3 w-20 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 bg-white">
              {filtered.map((row, index) => {
                const isEditing = editingId === row.id;
                const isAuditing = auditRowId === row.id;

                return (
                  <React.Fragment key={row.id}>
                    <tr
                      className={`hover:bg-slate-50 transition-all ${
                        row.isDuplicate ? 'bg-amber-50/60' : ''
                      }`}
                    >
                      <td className="py-2.5 px-3 text-center text-slate-400 font-mono text-[11px]">
                        {index + 1}
                      </td>

                      <td className="py-2.5 px-3 font-mono font-semibold text-slate-800">
                        {isEditing ? (
                          <input
                            type="text"
                            value={editDate}
                            onChange={(e) => setEditDate(e.target.value)}
                            className="bg-white border border-slate-300 px-2 py-1 rounded w-24 text-xs font-mono outline-none focus:border-blue-500"
                          />
                        ) : (
                          row.date
                        )}
                      </td>

                      <td className="py-2.5 px-3 font-mono font-bold">
                        {isEditing ? (
                          <input
                            type="text"
                            value={editPrice}
                            onChange={(e) => setEditPrice(e.target.value)}
                            className="bg-white border border-slate-300 px-2 py-1 rounded w-28 text-xs font-mono outline-none focus:border-blue-500"
                          />
                        ) : (
                          <span
                            className={row.pricePaid < 0 ? 'text-emerald-600' : 'text-slate-900'}
                          >
                            {row.pricePaidFormatted}
                          </span>
                        )}
                      </td>

                      <td className="py-2.5 px-3 text-slate-800 font-medium">
                        {isEditing ? (
                          <input
                            type="text"
                            value={editDesc}
                            onChange={(e) => setEditDesc(e.target.value)}
                            className="bg-white border border-slate-300 px-2 py-1 rounded w-full text-xs outline-none focus:border-blue-500"
                          />
                        ) : (
                          <div className="flex items-center gap-2">
                            <span className="truncate">{row.chargeInformation}</span>
                            {row.isDuplicate && (
                              <span
                                className="text-[9px] bg-amber-100 text-amber-800 border border-amber-300 px-1.5 py-0.5 rounded-full font-semibold"
                                title="Duplicate charge detected"
                              >
                                Duplicate
                              </span>
                            )}
                          </div>
                        )}
                      </td>

                      <td className="py-2.5 px-3 text-center">
                        <button
                          onClick={() => setAuditRowId(isAuditing ? null : row.id)}
                          className={`px-2.5 py-1.5 rounded-lg text-[10px] font-semibold flex items-center gap-1.5 mx-auto transition-all cursor-pointer ${
                            isAuditing
                              ? 'bg-blue-600 text-white'
                              : 'bg-slate-100 text-slate-600 hover:text-slate-900 hover:bg-slate-200'
                          }`}
                        >
                          <Eye className="h-3.5 w-3.5" />
                          Audit
                        </button>
                      </td>

                      <td className="py-2.5 px-3 text-right">
                        {isEditing ? (
                          <button
                            onClick={() => saveEdit(row.id)}
                            className="p-1.5 text-emerald-600 hover:bg-emerald-50 rounded-lg cursor-pointer transition-colors"
                          >
                            <Check className="h-4 w-4" />
                          </button>
                        ) : (
                          <div className="flex items-center justify-end gap-1">
                            <button
                              onClick={() => startEdit(row)}
                              className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg cursor-pointer transition-colors"
                              title="Edit"
                            >
                              <Edit2 className="h-3.5 w-3.5" />
                            </button>
                            <button
                              onClick={() => onDeleteTransaction(row.id)}
                              className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg cursor-pointer transition-colors"
                              title="Delete"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        )}
                      </td>
                    </tr>

                    {/* Audit Row Inspector */}
                    {isAuditing && (
                      <tr className="bg-blue-50/40 border-b border-blue-200">
                        <td colSpan={6} className="p-4 text-xs space-y-3">
                          <div className="flex items-center justify-between font-semibold text-blue-700 border-b border-blue-200/60 pb-2">
                            <span className="flex items-center gap-1.5">
                              <Sparkles className="h-4 w-4" />
                              Row Audit: Raw Data vs Parsed
                            </span>
                            <span className="font-mono text-[10px] bg-blue-100 px-2 py-0.5 rounded-md text-blue-800">
                              Confidence: {row.confidenceScore}%
                            </span>
                          </div>

                          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div className="bg-white p-3 rounded-xl border border-slate-200 font-mono text-[11px] shadow-sm">
                              <span className="text-slate-400 block text-[10px] uppercase font-sans mb-1.5 font-bold">
                                Raw PDF Line (Source: {row.fileName})
                              </span>
                              <span className="text-slate-800 break-all leading-relaxed">{row.rawLine}</span>
                            </div>

                            <div className="bg-white p-3 rounded-xl border border-slate-200 text-[11px] space-y-1.5 shadow-sm">
                              <span className="text-slate-400 block text-[10px] uppercase font-sans mb-1.5 font-bold">
                                Parsed Destination Columns
                              </span>
                              <div className="flex items-center gap-4">
                                <div>
                                  <span className="text-slate-500">Date:</span>{' '}
                                  <span className="font-mono font-bold text-emerald-700 bg-emerald-50 px-1 rounded">{row.date}</span>
                                </div>
                                <div>
                                  <span className="text-slate-500">Amount:</span>{' '}
                                  <span className="font-mono font-bold text-emerald-700 bg-emerald-50 px-1 rounded">{row.pricePaidFormatted}</span>
                                </div>
                              </div>
                              <div className="pt-1 border-t border-slate-100">
                                <span className="text-slate-500 block mb-0.5">Description:</span>
                                <span className="text-slate-800 font-medium">{row.chargeInformation}</span>
                              </div>
                            </div>
                          </div>
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Destination Choice Modal (When both Target Sheet & Google Account Linking are active) */}
      {showDestinationModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-md">
          <div className="w-full max-w-lg bg-white rounded-3xl shadow-2xl overflow-hidden border border-slate-200 animate-in fade-in zoom-in-95 duration-150">
            {/* Header */}
            <div className="px-6 py-5 border-b border-slate-100 flex items-center justify-between bg-slate-50/80">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-2xl bg-emerald-100 flex items-center justify-center text-emerald-600 shadow-2xs">
                  <Layers className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-900 tracking-tight">Choose Sync Destination</h3>
                  <p className="text-xs text-slate-500">Select which Google Sheet to export these {filtered.length} rows to</p>
                </div>
              </div>
              <button
                onClick={() => setShowDestinationModal(false)}
                className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-200/50 rounded-xl transition-all cursor-pointer"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Options */}
            <div className="p-6 space-y-4">
              <p className="text-xs text-slate-600">
                You have both an attached <strong>Target Sheet</strong> and a <strong>Linked Google Account</strong> configured. Where would you like to sync?
              </p>

              {/* Option 1: Target Sheet */}
              <div
                onClick={() => executeSync('target')}
                className="p-4 bg-slate-50 hover:bg-emerald-50/70 border border-slate-200 hover:border-emerald-300 rounded-2xl transition-all cursor-pointer group shadow-2xs space-y-2"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold text-slate-900 group-hover:text-emerald-900">
                      Target Sheet (Attached URL)
                    </span>
                    <span className="text-[10px] font-semibold bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded-full">
                      Custom Tab
                    </span>
                  </div>
                  <div className="h-7 w-7 rounded-xl bg-white border border-slate-200 group-hover:border-emerald-300 flex items-center justify-center text-slate-400 group-hover:text-emerald-600 shadow-2xs">
                    <ArrowRight className="h-3.5 w-3.5" />
                  </div>
                </div>

                <p className="text-xs text-slate-600 font-mono truncate bg-white p-2 rounded-lg border border-slate-200/70">
                  {targetSheet?.url || targetSheet?.spreadsheetId}
                </p>

                <div className="flex items-center justify-between text-[11px] text-slate-500 pt-1">
                  <span>Destination Tab: <strong className="text-slate-700">{targetSheet?.tabName || 'Sheet1'}</strong></span>
                  <span className="text-emerald-600 font-bold group-hover:underline">Export to this sheet &rarr;</span>
                </div>
              </div>

              {/* Option 2: Google Linked Master Sheet */}
              <div
                onClick={() => executeSync('master')}
                className="p-4 bg-slate-50 hover:bg-blue-50/70 border border-slate-200 hover:border-blue-300 rounded-2xl transition-all cursor-pointer group shadow-2xs space-y-2"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold text-slate-900 group-hover:text-blue-900">
                      Google Master Sheet
                    </span>
                    <span className="text-[10px] font-semibold bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full">
                      Primary Drive
                    </span>
                  </div>
                  <div className="h-7 w-7 rounded-xl bg-white border border-slate-200 group-hover:border-blue-300 flex items-center justify-center text-slate-400 group-hover:text-blue-600 shadow-2xs">
                    <ArrowRight className="h-3.5 w-3.5" />
                  </div>
                </div>

                <div className="bg-white p-2 rounded-lg border border-slate-200/70 space-y-0.5">
                  <p className="text-xs font-bold text-slate-800">
                    Bank Statement Imports (Master)
                  </p>
                  <p className="text-[11px] text-slate-500 font-mono truncate">
                    Account: {connectedAccount?.email || 'Linked Google Account'}
                  </p>
                </div>

                <div className="flex items-center justify-between text-[11px] text-slate-500 pt-1">
                  <span>Destination Tab: <strong className="text-slate-700">Transactions</strong></span>
                  <span className="text-blue-600 font-bold group-hover:underline">Export to master &rarr;</span>
                </div>
              </div>
            </div>

            {/* Footer */}
            <div className="px-6 py-3.5 bg-slate-50/80 border-t border-slate-100 flex justify-end">
              <button
                onClick={() => setShowDestinationModal(false)}
                className="px-4 py-1.5 text-xs text-slate-600 hover:text-slate-800 font-medium rounded-xl hover:bg-slate-200/50 transition-colors cursor-pointer"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
