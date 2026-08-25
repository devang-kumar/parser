import React, { useState } from 'react';
import { FileSpreadsheet, Plus, Trash2, CheckCircle2, ExternalLink, ShieldCheck, Link2 } from 'lucide-react';
import type { SavedSpreadsheet, GroupType } from '../types';
import { extractSpreadsheetId } from '../utils/sheetsSync';

interface SavedSheetsManagerProps {
  sheets: SavedSpreadsheet[];
  onAddSheet: (sheet: SavedSpreadsheet) => void;
  onDeleteSheet: (id: string) => void;
  onSetDefault: (id: string) => void;
  onClose?: () => void;
}

export const SavedSheetsManager: React.FC<SavedSheetsManagerProps> = ({
  sheets,
  onAddSheet,
  onDeleteSheet,
  onSetDefault,
  onClose,
}) => {
  const [title, setTitle] = useState('');
  const [url, setUrl] = useState('');
  const [tabName, setTabName] = useState('Sheet1');
  const [groupId, setGroupId] = useState<GroupType>('Group A');
  const [webhookUrl, setWebhookUrl] = useState('');
  const [error, setError] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!url.trim()) {
      setError('Please paste a valid Google Sheet URL.');
      return;
    }

    const spreadsheetId = extractSpreadsheetId(url);
    if (!spreadsheetId) {
      setError('Could not extract Spreadsheet ID. Please make sure it is a valid Google Sheets URL.');
      return;
    }

    const newSheet: SavedSpreadsheet = {
      id: `sheet-${Date.now()}`,
      title: title.trim() || `${groupId} Target Sheet`,
      url: url.trim(),
      spreadsheetId,
      tabName: tabName.trim() || 'Sheet1',
      groupId,
      webhookUrl: webhookUrl.trim() || undefined,
      createdAt: new Date().toLocaleDateString(),
      isDefault: sheets.filter((s) => s.groupId === groupId).length === 0,
    };

    onAddSheet(newSheet);
    setTitle('');
    setUrl('');
    setWebhookUrl('');
    setError('');
  };

  return (
    <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-xs space-y-5">
      
      {/* Header */}
      <div className="flex items-center justify-between pb-3.5 border-b border-slate-100">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-emerald-50 text-emerald-600 rounded-xl border border-emerald-200">
            <FileSpreadsheet className="h-5 w-5" />
          </div>
          <div>
            <h2 className="text-base font-bold text-slate-900">Saved Google Sheets Library</h2>
            <p className="text-xs text-slate-500">
              Save your Group A (Sheet X) and Group B (Sheet Y) destination links once. Select with 1-click later.
            </p>
          </div>
        </div>
        {onClose && (
          <button
            onClick={onClose}
            className="text-slate-500 hover:text-slate-900 text-xs px-3 py-1.5 bg-slate-100 hover:bg-slate-200 rounded-lg cursor-pointer"
          >
            Close
          </button>
        )}
      </div>

      {/* Add New Sheet Form */}
      <form onSubmit={handleSubmit} className="bg-slate-50 p-4 rounded-xl border border-slate-200 space-y-4">
        <h3 className="text-xs font-bold uppercase tracking-wider text-slate-700 flex items-center gap-2">
          <Plus className="h-4 w-4 text-blue-600" />
          Add Target Google Sheet Link
        </h3>

        {error && (
          <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-xs text-red-700">
            {error}
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Spreadsheet Name/Label
            </label>
            <input
              type="text"
              placeholder="e.g. Sheet X - Personal Expenses"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full glass-input px-3 py-1.5 rounded-lg text-xs"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Assign to Group Category
            </label>
            <select
              value={groupId}
              onChange={(e) => setGroupId(e.target.value)}
              className="w-full glass-input px-3 py-1.5 rounded-lg text-xs bg-white text-slate-800"
            >
              <option value="Group A">Group A (Sheet X Target)</option>
              <option value="Group B">Group B (Sheet Y Target)</option>
            </select>
          </div>

          <div className="md:col-span-2">
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Google Sheet URL / Share Link *
            </label>
            <div className="relative">
              <input
                type="url"
                placeholder="https://docs.google.com/spreadsheets/d/1BxiMVs0XRA5nFMd..."
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                required
                className="w-full glass-input pl-9 pr-3 py-1.5 rounded-lg text-xs"
              />
              <Link2 className="h-4 w-4 text-slate-400 absolute left-3 top-2" />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Target Tab Name (Optional)
            </label>
            <input
              type="text"
              placeholder="e.g. Sheet1 or July Statements"
              value={tabName}
              onChange={(e) => setTabName(e.target.value)}
              className="w-full glass-input px-3 py-1.5 rounded-lg text-xs"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Apps Script Webhook URL (Optional for 1-Click Auto Sync)
            </label>
            <input
              type="url"
              placeholder="https://script.google.com/macros/s/.../exec"
              value={webhookUrl}
              onChange={(e) => setWebhookUrl(e.target.value)}
              className="w-full glass-input px-3 py-1.5 rounded-lg text-xs"
            />
          </div>
        </div>

        <div className="flex justify-end">
          <button
            type="submit"
            className="flex items-center gap-1.5 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-bold shadow-xs transition-all cursor-pointer"
          >
            <Plus className="h-4 w-4" />
            Save Sheet Link
          </button>
        </div>
      </form>

      {/* Saved Sheets List */}
      <div className="space-y-2.5">
        <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider">
          Saved Destinations ({sheets.length})
        </h3>

        {sheets.length === 0 ? (
          <div className="p-6 text-center bg-slate-50 rounded-xl border border-dashed border-slate-300 text-slate-500 text-xs">
            No saved sheets yet. Add your Group A (Sheet X) and Group B (Sheet Y) links above!
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {sheets.map((s) => (
              <div
                key={s.id}
                className={`p-3.5 rounded-xl border transition-all ${
                  s.groupId === 'Group A'
                    ? 'bg-blue-50/40 border-blue-200 hover:border-blue-300'
                    : 'bg-purple-50/40 border-purple-200 hover:border-purple-300'
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="flex items-center gap-2">
                      <span
                        className={`text-[9px] font-bold px-2 py-0.5 rounded-md uppercase tracking-wider ${
                          s.groupId === 'Group A'
                            ? 'bg-blue-100 text-blue-800 border border-blue-300'
                            : 'bg-purple-100 text-purple-800 border border-purple-300'
                        }`}
                      >
                        {s.groupId}
                      </span>
                      <h4 className="text-sm font-semibold text-slate-900">{s.title}</h4>
                    </div>

                    <p className="text-xs text-slate-500 mt-1 font-mono truncate max-w-xs">
                      Tab: <span className="text-slate-800 font-semibold">{s.tabName}</span> | ID: {s.spreadsheetId.slice(0, 12)}...
                    </p>

                    {s.webhookUrl && (
                      <div className="flex items-center gap-1 text-[11px] text-emerald-700 font-medium mt-1">
                        <ShieldCheck className="h-3.5 w-3.5" />
                        <span>Apps Script Webhook Ready</span>
                      </div>
                    )}
                  </div>

                  <div className="flex items-center gap-1">
                    <a
                      href={s.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="p-1.5 text-slate-400 hover:text-slate-800 hover:bg-slate-100 rounded-lg"
                      title="Open Google Sheet in new tab"
                    >
                      <ExternalLink className="h-4 w-4" />
                    </a>
                    <button
                      onClick={() => onDeleteSheet(s.id)}
                      className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg cursor-pointer"
                      title="Delete Sheet link"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </div>

                <div className="mt-2.5 pt-2 border-t border-slate-200/80 flex items-center justify-between text-[11px]">
                  <span className="text-slate-400">Added: {s.createdAt}</span>
                  {s.isDefault ? (
                    <span className="text-emerald-700 font-semibold flex items-center gap-1">
                      <CheckCircle2 className="h-3 w-3 text-emerald-600" /> Default Target
                    </span>
                  ) : (
                    <button
                      onClick={() => onSetDefault(s.id)}
                      className="text-slate-500 hover:text-slate-800 underline cursor-pointer"
                    >
                      Set as Default
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

    </div>
  );
};

