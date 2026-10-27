import React, { useEffect, useState } from 'react';
import {
  X,
  Clock,
  Trash2,
  Download,
  FileSpreadsheet,
  Search,
  Eye,
  EyeOff,
  Calendar,
  DollarSign,
  Layers,
  FileDown,
  Edit2,
  Check,
  FileText,
} from 'lucide-react';
import type { UploadHistoryItem, User } from '../types';
import { historyService } from '../services/historyService';

interface UploadHistoryModalProps {
  currentUser?: User | null;
  onClose: () => void;
  onLoadHistory: (item: UploadHistoryItem) => void;
}

export const UploadHistoryModal: React.FC<UploadHistoryModalProps> = ({
  currentUser,
  onClose,
  onLoadHistory,
}) => {
  const [sessions, setSessions] = useState<UploadHistoryItem[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [previewId, setPreviewId] = useState<string | null>(null);
  const [editingSessionId, setEditingSessionId] = useState<string | null>(null);
  const [editNameText, setEditNameText] = useState('');

  useEffect(() => {
    const loadSessions = async () => {
      const items = await historyService.getSessions();
      setSessions(items);
    };
    loadSessions();
  }, [currentUser?.id]);

  const handleDelete = async (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    const success = await historyService.deleteSession(id);
    if (success) {
      setSessions((prev) => prev.filter((item) => item.id !== id));
      if (previewId === id) setPreviewId(null);
    }
  };

  const handleStartRename = (e: React.MouseEvent, session: UploadHistoryItem) => {
    e.stopPropagation();
    setEditingSessionId(session.id);
    setEditNameText(session.name || session.fileName || 'Import Session');
  };

  const handleSaveRename = async (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    if (!editNameText.trim()) return;
    await historyService.renameSession(id, editNameText.trim());
    setSessions((prev) =>
      prev.map((s) => (s.id === id ? { ...s, name: editNameText.trim(), fileName: editNameText.trim() } : s))
    );
    setEditingSessionId(null);
  };

  const handleClearAll = async () => {
    if (window.confirm('Are you sure you want to clear all import sessions?')) {
      await historyService.clearAllSessions();
      setSessions([]);
      setPreviewId(null);
    }
  };

  const handleExportCSV = (e: React.MouseEvent, session: UploadHistoryItem) => {
    e.stopPropagation();
    if (!session.transactions || session.transactions.length === 0) return;

    const headers = ['Date', 'Amount', 'Description', 'Type', 'Statement File', 'Confidence'];
    const csvRows = [headers.join(',')];

    session.transactions.forEach((t) => {
      const row = [
        `"${t.date || ''}"`,
        `"${t.pricePaid || 0}"`,
        `"${(t.chargeInformation || '').replace(/"/g, '""')}"`,
        `"${t.type || 'PURCHASE'}"`,
        `"${(t.fileName || '').replace(/"/g, '""')}"`,
        `"${t.confidenceScore || 99}%"`,
      ];
      csvRows.push(row.join(','));
    });

    const blob = new Blob([csvRows.join('\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    const cleanName = (session.name || session.fileName || 'session_export').replace(/[^a-zA-Z0-9_-]/g, '_');
    link.setAttribute('download', `${cleanName}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  // Filtered sessions
  const filteredSessions = sessions.filter((s) => {
    const q = searchQuery.toLowerCase();
    const matchesName = (s.name || s.fileName || '').toLowerCase().includes(q);
    const matchesDate = new Date(s.uploadDate).toLocaleDateString().includes(q);
    const matchesFiles = (s.files || []).some((f) => f.name.toLowerCase().includes(q));
    return matchesName || matchesDate || matchesFiles;
  });

  const isRowCredit = (t: any) =>
    t.pricePaid < 0 ||
    t.type === 'CREDIT' ||
    t.type === 'PAYMENT' ||
    (t.pricePaidFormatted && String(t.pricePaidFormatted).includes('-'));

  const getSessionNet = (s: UploadHistoryItem) => {
    if (typeof s.totalAmount === 'number') return s.totalAmount;
    return (s.transactions || []).reduce((sub, t) => {
      const val = isRowCredit(t) ? -Math.abs(t.pricePaid || 0) : Math.abs(t.pricePaid || 0);
      return sub + val;
    }, 0);
  };

  const totalSessionsCount = sessions.length;
  const totalStatementsCount = sessions.reduce(
    (sum, s) => sum + (s.files && s.files.length > 0 ? s.files.length : s.fileCount || 1),
    0
  );
  const totalRowsCount = sessions.reduce((sum, s) => sum + (s.transactionCount || 0), 0);
  const totalVolume = sessions.reduce((sum, s) => sum + getSessionNet(s), 0);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-md">
      <div className="w-full max-w-3xl bg-white rounded-3xl shadow-2xl overflow-hidden border border-slate-200 flex flex-col max-h-[88vh] animate-in fade-in zoom-in-95 duration-150">
        
        {/* Header */}
        <div className="px-6 py-5 border-b border-slate-100 flex items-center justify-between bg-slate-50/80">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-2xl bg-blue-100 flex items-center justify-center text-blue-600 shadow-2xs">
              <Clock className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-900 tracking-tight">Session History</h2>
              <p className="text-xs text-slate-500">
                View, restore, and export previously processed statement sessions
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {sessions.length > 0 && (
              <button
                onClick={handleClearAll}
                className="text-xs font-semibold text-slate-400 hover:text-red-600 px-3 py-1.5 rounded-lg hover:bg-red-50 transition-colors cursor-pointer"
              >
                Clear All
              </button>
            )}
            <button
              onClick={onClose}
              className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-200/50 rounded-xl transition-all cursor-pointer"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>

        {/* Stats & Search Toolbar */}
        <div className="p-5 border-b border-slate-100 bg-white space-y-4">
          {/* Quick Metrics */}
          <div className="grid grid-cols-4 gap-2.5">
            <div className="bg-slate-50 border border-slate-200/80 rounded-2xl p-3 flex items-center gap-2.5">
              <div className="h-8 w-8 rounded-xl bg-blue-100 flex items-center justify-center text-blue-600 shrink-0">
                <Clock className="h-4 w-4" />
              </div>
              <div className="min-w-0">
                <p className="text-[11px] text-slate-500 font-medium truncate">Sessions</p>
                <p className="text-sm font-bold text-slate-900">{totalSessionsCount}</p>
              </div>
            </div>

            <div className="bg-slate-50 border border-slate-200/80 rounded-2xl p-3 flex items-center gap-2.5">
              <div className="h-8 w-8 rounded-xl bg-indigo-100 flex items-center justify-center text-indigo-600 shrink-0">
                <FileSpreadsheet className="h-4 w-4" />
              </div>
              <div className="min-w-0">
                <p className="text-[11px] text-slate-500 font-medium truncate">Statements</p>
                <p className="text-sm font-bold text-slate-900">{totalStatementsCount}</p>
              </div>
            </div>

            <div className="bg-slate-50 border border-slate-200/80 rounded-2xl p-3 flex items-center gap-2.5">
              <div className="h-8 w-8 rounded-xl bg-emerald-100 flex items-center justify-center text-emerald-600 shrink-0">
                <Layers className="h-4 w-4" />
              </div>
              <div className="min-w-0">
                <p className="text-[11px] text-slate-500 font-medium truncate">Total Rows</p>
                <p className="text-sm font-bold text-slate-900">{totalRowsCount}</p>
              </div>
            </div>

            <div className="bg-slate-50 border border-slate-200/80 rounded-2xl p-3 flex items-center gap-2.5">
              <div className="h-8 w-8 rounded-xl bg-violet-100 flex items-center justify-center text-violet-600 shrink-0">
                <DollarSign className="h-4 w-4" />
              </div>
              <div className="min-w-0">
                <p className="text-[11px] text-slate-500 font-medium truncate">Total Volume</p>
                <p className="text-sm font-bold text-slate-900 font-mono truncate">
                  ${totalVolume.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </p>
              </div>
            </div>
          </div>

          {/* Search bar */}
          <div className="relative">
            <input
              type="text"
              placeholder="Search sessions by name, included files, or date..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-slate-50 border border-slate-200 pl-9 pr-3 py-2 rounded-xl text-xs focus:ring-2 focus:ring-blue-500/20 focus:border-blue-600 outline-none transition-all"
            />
            <Search className="h-4 w-4 text-slate-400 absolute left-3 top-2.5" />
          </div>
        </div>

        {/* Sessions List */}
        <div className="flex-1 overflow-y-auto p-6 space-y-4">
          {filteredSessions.length === 0 ? (
            <div className="text-center py-12 text-slate-500">
              <Clock className="h-12 w-12 mx-auto text-slate-300 mb-3" />
              <p className="text-sm font-bold text-slate-800">
                {searchQuery ? 'No matching sessions found' : 'No import sessions yet'}
              </p>
              <p className="text-xs text-slate-500 mt-1">
                {searchQuery
                  ? 'Try a different search keyword.'
                  : 'Whenever you upload and process statements, the full session is automatically saved here.'}
              </p>
            </div>
          ) : (
            filteredSessions.map((session) => {
              const sessionTotal = getSessionNet(session);
              const isPreviewOpen = previewId === session.id;
              const isEditing = editingSessionId === session.id;
              const fileCount = session.files && session.files.length > 0 ? session.files.length : session.fileCount || 1;

              return (
                <div
                  key={session.id}
                  className="border border-slate-200 rounded-2xl p-4 bg-white hover:border-blue-300 hover:shadow-xs transition-all space-y-3"
                >
                  <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      {/* Session Name (Editable) */}
                      <div className="flex items-center gap-2">
                        <FileSpreadsheet className="h-4 w-4 text-blue-600 shrink-0" />
                        {isEditing ? (
                          <div className="flex items-center gap-1.5 flex-1 max-w-sm">
                            <input
                              type="text"
                              value={editNameText}
                              onChange={(e) => setEditNameText(e.target.value)}
                              onKeyDown={(e) => e.key === 'Enter' && handleSaveRename(e as any, session.id)}
                              className="px-2 py-0.5 text-xs border border-blue-500 rounded-md outline-none w-full font-bold text-slate-900 bg-blue-50/50"
                              autoFocus
                            />
                            <button
                              onClick={(e) => handleSaveRename(e, session.id)}
                              className="p-1 text-emerald-600 hover:bg-emerald-50 rounded"
                            >
                              <Check className="h-3.5 w-3.5" />
                            </button>
                            <button
                              onClick={() => setEditingSessionId(null)}
                              className="p-1 text-slate-400 hover:bg-slate-100 rounded"
                            >
                              <X className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        ) : (
                          <div className="flex items-center gap-2 group">
                            <h3
                              className="font-bold text-slate-900 text-sm truncate"
                              title={session.name || session.fileName}
                            >
                              {session.name || session.fileName || 'Import Session'}
                            </h3>
                            <button
                              onClick={(e) => handleStartRename(e, session)}
                              className="opacity-0 group-hover:opacity-100 transition-opacity p-1 text-slate-400 hover:text-slate-600 rounded cursor-pointer"
                              title="Rename session"
                            >
                              <Edit2 className="h-3 w-3" />
                            </button>
                          </div>
                        )}
                      </div>

                      {/* Session Meta */}
                      <div className="flex flex-wrap items-center gap-2 sm:gap-3 mt-1.5 text-xs text-slate-500 font-medium">
                        <span className="flex items-center gap-1">
                          <Calendar className="h-3.5 w-3.5 text-slate-400" />
                          {new Date(session.uploadDate).toLocaleString('en-US', {
                            dateStyle: 'medium',
                            timeStyle: 'short',
                          })}
                        </span>
                        <span className="bg-blue-50 text-blue-700 font-semibold px-2.5 py-0.5 rounded-full border border-blue-200/60">
                          {fileCount} {fileCount === 1 ? 'Statement' : 'Statements'}
                        </span>
                        <span className="bg-emerald-50 text-emerald-700 font-semibold px-2.5 py-0.5 rounded-full border border-emerald-200/60">
                          {session.transactionCount} rows
                        </span>
                        <span className="bg-slate-100 text-slate-800 font-mono font-semibold px-2.5 py-0.5 rounded-full border border-slate-200">
                          ${sessionTotal.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </span>
                      </div>

                      {/* Included Files Pills */}
                      {session.files && session.files.length > 0 && (
                        <div className="flex flex-wrap items-center gap-1.5 mt-2.5">
                          {session.files.map((f, fIdx) => (
                            <span
                              key={fIdx}
                              className="inline-flex items-center gap-1 px-2 py-0.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-md text-[11px] font-medium transition-colors"
                              title={`${f.name} (${f.transactionCount} rows)`}
                            >
                              <FileText className="h-3 w-3 text-slate-400" />
                              <span className="truncate max-w-[180px]">{f.name}</span>
                              <span className="text-slate-400 font-mono text-[10px]">
                                ({f.transactionCount})
                              </span>
                            </span>
                          ))}
                        </div>
                      )}
                    </div>

                    {/* Action Buttons */}
                    <div className="flex items-center gap-2 shrink-0 pt-1 sm:pt-0">
                      {/* Preview toggle */}
                      {session.transactions && session.transactions.length > 0 && (
                        <button
                          onClick={() => setPreviewId(isPreviewOpen ? null : session.id)}
                          className="p-1.5 text-slate-500 hover:text-slate-800 hover:bg-slate-100 rounded-lg transition-all cursor-pointer"
                          title={isPreviewOpen ? 'Hide preview' : 'Preview session transactions'}
                        >
                          {isPreviewOpen ? (
                            <EyeOff className="h-4 w-4" />
                          ) : (
                            <Eye className="h-4 w-4" />
                          )}
                        </button>
                      )}

                      {/* Export CSV */}
                      <button
                        onClick={(e) => handleExportCSV(e, session)}
                        className="p-1.5 text-slate-500 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-all cursor-pointer"
                        title="Download full session CSV"
                      >
                        <FileDown className="h-4 w-4" />
                      </button>

                      {/* Restore Session */}
                      <button
                        onClick={() => {
                          onLoadHistory(session);
                          onClose();
                        }}
                        className="flex items-center gap-1.5 px-3 py-1.5 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white font-bold text-xs rounded-xl transition-all shadow-xs cursor-pointer"
                        title="Restores all files & combined transactions from this session"
                      >
                        <Download className="h-3.5 w-3.5" />
                        Restore Session
                      </button>

                      {/* Delete Session */}
                      <button
                        onClick={(e) => handleDelete(e, session.id)}
                        className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-all cursor-pointer"
                        title="Delete session"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </div>

                  {/* Expandable Transaction Preview */}
                  {isPreviewOpen && session.transactions && (
                    <div className="pt-3 border-t border-slate-100 text-xs">
                      <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-2">
                        First {Math.min(5, session.transactions.length)} Transactions Preview:
                      </p>
                      <div className="overflow-x-auto rounded-xl border border-slate-200">
                        <table className="w-full text-left">
                          <thead className="bg-slate-50 text-[11px] font-bold text-slate-600 border-b border-slate-200">
                            <tr>
                              <th className="py-1.5 px-3">Date</th>
                              <th className="py-1.5 px-3">Description</th>
                              <th className="py-1.5 px-3">File</th>
                              <th className="py-1.5 px-3 text-right">Amount</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100">
                            {session.transactions.slice(0, 5).map((row, rIdx) => (
                              <tr key={rIdx} className="hover:bg-slate-50">
                                <td className="py-1.5 px-3 text-slate-600 font-mono text-[11px]">
                                  {row.date}
                                </td>
                                <td className="py-1.5 px-3 text-slate-800 font-medium truncate max-w-[220px]">
                                  {row.chargeInformation}
                                </td>
                                <td className="py-1.5 px-3 text-slate-500 text-[11px] truncate max-w-[140px]">
                                  {row.fileName || 'Statement'}
                                </td>
                                <td className="py-1.5 px-3 text-right font-mono font-bold text-slate-900">
                                  ${row.pricePaid.toFixed(2)}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
};

