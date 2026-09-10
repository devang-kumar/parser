import React, { useEffect, useState } from 'react';
import { X, Clock, Trash2, Download, CheckCircle2 } from 'lucide-react';
import type { UploadHistoryItem, User } from '../types';
import { historyService } from '../services/historyService';

interface UploadHistoryModalProps {
  currentUser: User;
  onClose: () => void;
  onLoadHistory: (item: UploadHistoryItem) => void;
}

export const UploadHistoryModal: React.FC<UploadHistoryModalProps> = ({
  currentUser,
  onClose,
  onLoadHistory,
}) => {
  const [history, setHistory] = useState<UploadHistoryItem[]>([]);

  useEffect(() => {
    const loadHistory = async () => {
      const items = await historyService.getUploadHistory();
      setHistory(items);
    };
    loadHistory();
  }, [currentUser.id]);

  const handleDelete = async (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    const success = await historyService.deleteUpload(id);
    if (success) {
      setHistory(prev => prev.filter(item => item.id !== id));
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-md">
      <div className="w-full max-w-2xl bg-white rounded-3xl shadow-2xl overflow-hidden border border-slate-200 flex flex-col max-h-[85vh]">
        {/* Header */}
        <div className="px-6 py-5 border-b border-slate-100 flex items-center justify-between bg-slate-50">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl bg-blue-100 flex items-center justify-center text-blue-600">
              <Clock className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-slate-900 tracking-tight">Upload History</h2>
              <p className="text-xs text-slate-500">View and reload your previous statement extractions</p>
            </div>
          </div>
          <button 
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-200/50 rounded-xl transition-all cursor-pointer"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* List */}
        <div className="flex-1 overflow-y-auto p-6 space-y-3">
          {history.length === 0 ? (
            <div className="text-center py-12 text-slate-500">
              <Clock className="h-12 w-12 mx-auto text-slate-300 mb-3" />
              <p className="text-sm font-semibold">No history found</p>
              <p className="text-xs">Your past extractions will appear here.</p>
            </div>
          ) : (
            history.map((item) => (
              <div key={item.id} className="flex flex-col sm:flex-row sm:items-center justify-between p-4 border border-slate-200 rounded-2xl hover:border-blue-300 hover:shadow-sm transition-all bg-white gap-4">
                <div className="min-w-0">
                  <h3 className="font-bold text-slate-800 text-sm truncate" title={item.fileName}>
                    {item.fileName}
                  </h3>
                  <div className="flex items-center gap-3 mt-1.5 text-xs text-slate-500 font-medium">
                    <span className="flex items-center gap-1">
                      <Clock className="h-3.5 w-3.5" />
                      {new Date(item.uploadDate).toLocaleString()}
                    </span>
                    <span className="flex items-center gap-1 text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full">
                      <CheckCircle2 className="h-3.5 w-3.5" />
                      {item.transactionCount} rows
                    </span>
                  </div>
                </div>
                
                <div className="flex items-center gap-2 shrink-0">
                  <button
                    onClick={() => {
                      onLoadHistory(item);
                      onClose();
                    }}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-50 text-blue-700 hover:bg-blue-100 font-bold text-xs rounded-lg transition-all cursor-pointer"
                  >
                    <Download className="h-3.5 w-3.5" />
                    Load Data
                  </button>
                  <button
                    onClick={(e) => handleDelete(e, item.id)}
                    className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-all cursor-pointer"
                    title="Delete history"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
};
