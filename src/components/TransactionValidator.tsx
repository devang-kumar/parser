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
} from 'lucide-react';
import type { TransactionRow, GroupType, SavedSpreadsheet } from '../types';
import {
  formatForGoogleSheetsClipboard,
  downloadCSV,
  syncToGoogleSheetsWebhook,
} from '../utils/sheetsSync';

interface TransactionValidatorProps {
  transactions: TransactionRow[];
  savedSheets: SavedSpreadsheet[];
  onUpdateTransaction: (id: string, updated: Partial<TransactionRow>) => void;
  onDeleteTransaction: (id: string) => void;
  onClearAll: () => void;
}

export const TransactionValidator: React.FC<TransactionValidatorProps> = ({
  transactions,
  savedSheets,
  onUpdateTransaction,
  onDeleteTransaction,
  onClearAll,
}) => {
  const [selectedGroupFilter, setSelectedGroupFilter] = useState<GroupType | 'ALL'>('ALL');
  const [selectedTypeFilter, setSelectedTypeFilter] = useState<'ALL' | 'PURCHASES' | 'CREDITS_PAYMENTS'>('ALL');
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
  const [selectedTargetSheetId, setSelectedTargetSheetId] = useState<string>('');

  // Filter transactions
  const filtered = transactions.filter((t) => {
    const matchesGroup = selectedGroupFilter === 'ALL' || t.group === selectedGroupFilter;
    const isCreditOrPayment = t.type === 'CREDIT' || t.pricePaid < 0 || /PAYMENT|CREDIT|THANK YOU|REFUND/i.test(t.chargeInformation);
    
    let matchesType = true;
    if (selectedTypeFilter === 'PURCHASES') {
      matchesType = !isCreditOrPayment;
    } else if (selectedTypeFilter === 'CREDITS_PAYMENTS') {
      matchesType = isCreditOrPayment;
    }

    const matchesSearch =
      t.chargeInformation.toLowerCase().includes(searchQuery.toLowerCase()) ||
      t.date.includes(searchQuery) ||
      t.pricePaidFormatted.includes(searchQuery);

    return matchesGroup && matchesType && matchesSearch;
  });

  const groupATotal = transactions
    .filter((t) => t.group === 'Group A')
    .reduce((sum, t) => sum + t.pricePaid, 0);
  const groupBTotal = transactions
    .filter((t) => t.group === 'Group B')
    .reduce((sum, t) => sum + t.pricePaid, 0);

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
    downloadCSV(filtered, `Bank_Statements_${selectedGroupFilter}`);
  };

  const handleSyncToSheets = async () => {
    if (filtered.length === 0) return;

    // Find target sheet
    let targetSheet: SavedSpreadsheet | undefined;
    if (selectedTargetSheetId) {
      targetSheet = savedSheets.find((s) => s.id === selectedTargetSheetId);
    } else {
      // Pick matching default sheet for current filter
      targetSheet = savedSheets.find((s) => s.groupId === selectedGroupFilter) || savedSheets[0];
    }

    if (!targetSheet) {
      setSyncStatus({
        loading: false,
        message: 'No saved Google Sheet target found! Please add a sheet in Saved Sheets Manager.',
        isError: true,
      });
      return;
    }

    if (!targetSheet.webhookUrl) {
      setSyncStatus({
        loading: false,
        message: `Sheet "${targetSheet.title}" has no Webhook URL configured. Use "Copy Matrix" or add Apps Script webhook URL in Saved Sheets Manager.`,
        isError: true,
      });
      return;
    }

    setSyncStatus({ loading: true, message: 'Syncing rows to Google Sheets...' });
    const res = await syncToGoogleSheetsWebhook(
      targetSheet.webhookUrl,
      targetSheet.spreadsheetId,
      targetSheet.tabName,
      filtered
    );

    setSyncStatus({
      loading: false,
      message: res.message,
      isError: !res.success,
    });
  };

  const handleBatchSyncAll = async () => {
    if (transactions.length === 0) return;

    const groupATx = transactions.filter((t) => t.group === 'Group A');
    const groupBTx = transactions.filter((t) => t.group === 'Group B');

    const sheetA = savedSheets.find((s) => s.groupId === 'Group A' && s.isDefault) || savedSheets.find((s) => s.groupId === 'Group A');
    const sheetB = savedSheets.find((s) => s.groupId === 'Group B' && s.isDefault) || savedSheets.find((s) => s.groupId === 'Group B');

    let totalSynced = 0;
    const logs: string[] = [];

    setSyncStatus({ loading: true, message: 'Batch syncing Group A -> Sheet X and Group B -> Sheet Y...' });

    if (groupATx.length > 0 && sheetA?.webhookUrl) {
      const resA = await syncToGoogleSheetsWebhook(sheetA.webhookUrl, sheetA.spreadsheetId, sheetA.tabName, groupATx);
      if (resA.success) {
        totalSynced += groupATx.length;
        logs.push(`Synced ${groupATx.length} rows to ${sheetA.title}`);
      } else {
        logs.push(`Group A failed: ${resA.message}`);
      }
    } else if (groupATx.length > 0) {
      logs.push(`Group A skipped (no Webhook URL configured)`);
    }

    if (groupBTx.length > 0 && sheetB?.webhookUrl) {
      const resB = await syncToGoogleSheetsWebhook(sheetB.webhookUrl, sheetB.spreadsheetId, sheetB.tabName, groupBTx);
      if (resB.success) {
        totalSynced += groupBTx.length;
        logs.push(`Synced ${groupBTx.length} rows to ${sheetB.title}`);
      } else {
        logs.push(`Group B failed: ${resB.message}`);
      }
    } else if (groupBTx.length > 0) {
      logs.push(`Group B skipped (no Webhook URL configured)`);
    }

    setSyncStatus({
      loading: false,
      message: logs.length > 0 ? logs.join(' | ') : 'No transactions or webhook configuration found.',
      isError: totalSynced === 0,
    });
  };

  return (
    <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-xs space-y-5">
      
      {/* Header & Metric Summary Cards */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-3.5 border-b border-slate-100">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
              <FileSpreadsheet className="h-5 w-5 text-emerald-600" />
              Parsed Transactions Table
            </h2>
            <span className="text-xs bg-slate-100 text-slate-700 font-semibold px-2.5 py-0.5 rounded-full border border-slate-200">
              {filtered.length} Rows
            </span>
          </div>
          <p className="text-xs text-slate-500 mt-0.5">
            Column A (Date), Column B (Price Paid), Column C (Charge Info).
          </p>
        </div>

        {/* Group Totals */}
        <div className="flex items-center gap-3">
          <div className="bg-blue-50/70 border border-blue-200/80 p-2 px-3 rounded-xl text-xs">
            <span className="text-slate-600">Group A Total: </span>
            <span className="font-mono font-bold text-blue-700">${groupATotal.toFixed(2)}</span>
          </div>
          <div className="bg-purple-50/70 border border-purple-200/80 p-2 px-3 rounded-xl text-xs">
            <span className="text-slate-600">Group B Total: </span>
            <span className="font-mono font-bold text-purple-700">${groupBTotal.toFixed(2)}</span>
          </div>
        </div>
      </div>

      {/* Filter Bar & Quick Sync Actions */}
      <div className="flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-3 bg-slate-50 p-3 rounded-xl border border-slate-200">
        
        {/* Left Filter & Search */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Group Filter Buttons */}
          <div className="flex items-center bg-white p-1 rounded-lg border border-slate-200 text-xs font-medium shadow-2xs">
            <button
              onClick={() => setSelectedGroupFilter('ALL')}
              className={`px-3 py-1 rounded-md transition-all cursor-pointer ${
                selectedGroupFilter === 'ALL'
                  ? 'bg-slate-800 text-white font-bold'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              All Groups ({transactions.length})
            </button>
            <button
              onClick={() => setSelectedGroupFilter('Group A')}
              className={`px-3 py-1 rounded-md transition-all cursor-pointer ${
                selectedGroupFilter === 'Group A'
                  ? 'bg-blue-600 text-white font-bold'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Group A (Sheet X)
            </button>
            <button
              onClick={() => setSelectedGroupFilter('Group B')}
              className={`px-3 py-1 rounded-md transition-all cursor-pointer ${
                selectedGroupFilter === 'Group B'
                  ? 'bg-purple-600 text-white font-bold'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Group B (Sheet Y)
            </button>
          </div>

          {/* Activity Type Filter Buttons (Purchases vs Payments/Credits) */}
          <div className="flex items-center bg-white p-1 rounded-lg border border-slate-200 text-xs font-medium shadow-2xs">
            <button
              onClick={() => setSelectedTypeFilter('ALL')}
              className={`px-3 py-1 rounded-md transition-all cursor-pointer ${
                selectedTypeFilter === 'ALL'
                  ? 'bg-slate-800 text-white font-bold'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
              title="Show all activity (Purchases, Payments, and Credits)"
            >
              All Activity
            </button>
            <button
              onClick={() => setSelectedTypeFilter('PURCHASES')}
              className={`px-3 py-1 rounded-md transition-all cursor-pointer ${
                selectedTypeFilter === 'PURCHASES'
                  ? 'bg-emerald-600 text-white font-bold'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
              title="Excludes payment lines (e.g. AUTOMATIC PAYMENT) and credits so only purchases are imported"
            >
              Purchases Only
            </button>
            <button
              onClick={() => setSelectedTypeFilter('CREDITS_PAYMENTS')}
              className={`px-3 py-1 rounded-md transition-all cursor-pointer ${
                selectedTypeFilter === 'CREDITS_PAYMENTS'
                  ? 'bg-amber-600 text-white font-bold'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
              title="Show only payment lines, bill payoffs, and credits"
            >
              Payments & Credits
            </button>
          </div>

          {/* Search box */}
          <div className="relative flex-1 min-w-[180px]">
            <input
              type="text"
              placeholder="Search vendor or price..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full glass-input pl-8 pr-3 py-1.5 rounded-lg text-xs"
            />
            <Search className="h-3.5 w-3.5 text-slate-400 absolute left-2.5 top-2" />
          </div>
        </div>

        {/* Right Export / Sync Controls */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Target Sheet Picker */}
          {savedSheets.length > 0 && (
            <select
              value={selectedTargetSheetId}
              onChange={(e) => setSelectedTargetSheetId(e.target.value)}
              className="glass-input px-3 py-1.5 rounded-lg text-xs bg-white border-slate-300 text-slate-800 max-w-[190px]"
            >
              <option value="">Default Target Sheet</option>
              {savedSheets.map((s) => (
                <option key={s.id} value={s.id}>
                  [{s.groupId}] {s.title}
                </option>
              ))}
            </select>
          )}

          {/* Copy Matrix Button */}
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
                Copied Matrix!
              </>
            ) : (
              <>
                <Copy className="h-3.5 w-3.5 text-blue-600" />
                Copy Matrix
              </>
            )}
          </button>

          {/* Sync via Webhook */}
          <button
            onClick={handleSyncToSheets}
            disabled={filtered.length === 0 || syncStatus.loading}
            className="flex items-center gap-1.5 px-3.5 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-bold shadow-xs transition-all disabled:opacity-50 cursor-pointer"
            title="Syncs filtered rows to the active target sheet"
          >
            <Send className="h-3.5 w-3.5" />
            1-Click Sync
          </button>

          {/* Batch Sync Both Groups */}
          <button
            onClick={handleBatchSyncAll}
            disabled={transactions.length === 0 || syncStatus.loading}
            className="flex items-center gap-1.5 px-3.5 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-bold shadow-xs transition-all disabled:opacity-50 cursor-pointer"
            title="Automatically syncs Group A -> Sheet X and Group B -> Sheet Y in one click!"
          >
            <Sparkles className="h-3.5 w-3.5" />
            Batch Sync Both (X & Y)
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
            <button
              onClick={onClearAll}
              className="p-1.5 bg-white hover:bg-red-50 text-slate-400 hover:text-red-600 rounded-lg border border-slate-300 text-xs cursor-pointer"
              title="Clear all parsed transactions"
            >
              <Trash2 className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>

      {/* Sync Status Banner */}
      {syncStatus.message && (
        <div
          className={`p-3 rounded-xl text-xs flex items-center justify-between border ${
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
            <span>{syncStatus.message}</span>
          </div>
          <button
            onClick={() => setSyncStatus({ loading: false })}
            className="text-slate-500 hover:text-slate-800 text-[10px] cursor-pointer"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Transactions Data Table */}
      {filtered.length === 0 ? (
        <div className="p-10 text-center bg-slate-50 rounded-xl border border-dashed border-slate-300 space-y-1.5">
          <Layers className="h-7 w-7 text-slate-400 mx-auto" />
          <p className="text-sm font-semibold text-slate-700">No transactions loaded yet</p>
          <p className="text-xs text-slate-500">
            Upload your bank statement PDF/CSV above to extract structured rows.
          </p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-slate-200 max-h-[520px] overflow-y-auto shadow-2xs">
          <table className="w-full text-left text-xs border-collapse">
            <thead className="sticky top-0 z-10 bg-slate-100/90 backdrop-blur-xs border-b border-slate-200 text-slate-600 font-bold uppercase text-[10px] tracking-wider">
              <tr>
                <th className="py-3 px-3 w-12 text-center">Row</th>
                <th className="py-3 px-3 w-28">Col A (Date)</th>
                <th className="py-3 px-3 w-36">Col B (Price Paid)</th>
                <th className="py-3 px-3">Col C (Charge Information)</th>
                <th className="py-3 px-3 w-24">Group</th>
                <th className="py-3 px-3 w-28 text-center">Accuracy Audit</th>
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
                      {/* Row sequence number */}
                      <td className="py-2.5 px-3 text-center text-slate-400 font-mono text-[11px]">
                        {index + 1}
                      </td>

                      {/* Date (Column A) */}
                      <td className="py-2.5 px-3 font-mono font-semibold text-slate-800">
                        {isEditing ? (
                          <input
                            type="text"
                            value={editDate}
                            onChange={(e) => setEditDate(e.target.value)}
                            className="glass-input px-2 py-1 rounded w-24 text-xs font-mono"
                          />
                        ) : (
                          row.date
                        )}
                      </td>

                      {/* Price Paid (Column B) */}
                      <td className="py-2.5 px-3 font-mono font-bold">
                        {isEditing ? (
                          <input
                            type="text"
                            value={editPrice}
                            onChange={(e) => setEditPrice(e.target.value)}
                            className="glass-input px-2 py-1 rounded w-28 text-xs font-mono"
                          />
                        ) : (
                          <span
                            className={row.pricePaid < 0 ? 'text-emerald-600' : 'text-slate-900'}
                          >
                            {row.pricePaidFormatted}
                          </span>
                        )}
                      </td>

                      {/* Charge Information (Column C) */}
                      <td className="py-2.5 px-3 text-slate-800 font-medium">
                        {isEditing ? (
                          <input
                            type="text"
                            value={editDesc}
                            onChange={(e) => setEditDesc(e.target.value)}
                            className="glass-input px-2 py-1 rounded w-full text-xs"
                          />
                        ) : (
                          <div className="flex items-center gap-2">
                            <span className="truncate">{row.chargeInformation}</span>
                            {row.isDuplicate && (
                              <span
                                className="text-[9px] bg-amber-100 text-amber-800 border border-amber-300 px-1.5 py-0.2 rounded font-semibold"
                                title="Duplicate charge detected on same date & amount"
                              >
                                Duplicate
                              </span>
                            )}
                          </div>
                        )}
                      </td>

                      {/* Group Tag */}
                      <td className="py-2.5 px-3">
                        <span
                          className={`text-[9px] font-bold px-2 py-0.5 rounded-md uppercase tracking-wider ${
                            row.group === 'Group A'
                              ? 'bg-blue-50 text-blue-700 border border-blue-200'
                              : 'bg-purple-50 text-purple-700 border border-purple-200'
                          }`}
                        >
                          {row.group}
                        </span>
                      </td>

                      {/* Accuracy Line Audit Toggle */}
                      <td className="py-2.5 px-3 text-center">
                        <button
                          onClick={() => setAuditRowId(isAuditing ? null : row.id)}
                          className={`px-2 py-1 rounded text-[10px] font-semibold flex items-center gap-1 mx-auto transition-all cursor-pointer ${
                            isAuditing
                              ? 'bg-blue-600 text-white'
                              : 'bg-slate-100 text-slate-600 hover:text-slate-900 border border-slate-200'
                          }`}
                        >
                          <Eye className="h-3 w-3" />
                          Audit
                        </button>
                      </td>

                      {/* Edit / Delete Actions */}
                      <td className="py-2.5 px-3 text-right">
                        {isEditing ? (
                          <button
                            onClick={() => saveEdit(row.id)}
                            className="p-1 text-emerald-600 hover:bg-emerald-50 rounded cursor-pointer"
                          >
                            <Check className="h-4 w-4" />
                          </button>
                        ) : (
                          <div className="flex items-center justify-end gap-1">
                            <button
                              onClick={() => startEdit(row)}
                              className="p-1 text-slate-400 hover:text-slate-700 rounded hover:bg-slate-100 cursor-pointer"
                              title="Edit values"
                            >
                              <Edit2 className="h-3.5 w-3.5" />
                            </button>
                            <button
                              onClick={() => onDeleteTransaction(row.id)}
                              className="p-1 text-slate-400 hover:text-red-600 rounded hover:bg-red-50 cursor-pointer"
                              title="Delete row"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        )}
                      </td>
                    </tr>

                    {/* Audit Row Inspector breakdown */}
                    {isAuditing && (
                      <tr className="bg-blue-50/40 border-b border-blue-200">
                        <td colSpan={7} className="p-3.5 text-xs space-y-2">
                          <div className="flex items-center justify-between font-semibold text-blue-700 border-b border-blue-200/60 pb-1.5">
                            <span className="flex items-center gap-1.5">
                              <Sparkles className="h-3.5 w-3.5" />
                              Row Audit: Exact Physical PDF Extraction vs Sheet Mapping
                            </span>
                            <span className="font-mono text-[10px] text-blue-600">
                              Confidence: {row.confidenceScore}% Line Locked
                            </span>
                          </div>

                          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-0.5">
                            <div className="bg-white p-2.5 rounded-lg border border-slate-200 font-mono text-[11px]">
                              <span className="text-slate-400 block text-[10px] uppercase font-sans mb-1 font-bold">
                                Raw PDF Line Text (File: {row.fileName})
                              </span>
                              <span className="text-slate-800">{row.rawLine}</span>
                            </div>

                            <div className="bg-white p-2.5 rounded-lg border border-slate-200 text-[11px] space-y-1">
                              <span className="text-slate-400 block text-[10px] uppercase mb-1 font-bold">
                                Parsed Destination Columns
                              </span>
                              <div className="flex items-center gap-3">
                                <div>
                                  <span className="text-slate-500">Col A (Date):</span>{' '}
                                  <span className="font-mono font-bold text-emerald-700">{row.date}</span>
                                </div>
                                <div>
                                  <span className="text-slate-500">Col B (Price):</span>{' '}
                                  <span className="font-mono font-bold text-emerald-700">{row.pricePaidFormatted}</span>
                                </div>
                              </div>
                              <div>
                                <span className="text-slate-500">Col C (Info):</span>{' '}
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

    </div>
  );
};
