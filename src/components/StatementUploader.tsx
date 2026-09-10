import React, { useState, useRef } from 'react';
import { UploadCloud, FileText, CheckCircle2, AlertCircle, Loader2, Play, Trash2 } from 'lucide-react';
import type { StatementFile } from '../types';

interface StatementUploaderProps {
  files: StatementFile[];
  onUploadFiles: (files: File[]) => void;
  onProcessFiles: () => void;
  onRemoveFile: (id: string) => void;
  isProcessing: boolean;
}

export const StatementUploader: React.FC<StatementUploaderProps> = ({
  files,
  onUploadFiles,
  onProcessFiles,
  onRemoveFile,
  isProcessing,
}) => {
  const [isDragOver, setIsDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      onUploadFiles(Array.from(e.target.files));
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      onUploadFiles(Array.from(e.dataTransfer.files));
    }
  };

  const queuedCount = files.filter((f) => f.status === 'queued').length;

  return (
    <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-xs space-y-5">
      
      {/* Title */}
      <div className="pb-3.5 border-b border-slate-100">
        <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
          <UploadCloud className="h-5 w-5 text-blue-600" />
          Upload Bank Statements
        </h2>
        <p className="text-xs text-slate-500 mt-1">
          Securely parse your PDF or CSV bank statements. Drag and drop files below.
        </p>
      </div>

      {/* Drag & Drop Upload Zone */}
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setIsDragOver(true);
        }}
        onDragLeave={() => setIsDragOver(false)}
        onDrop={handleDrop}
        onClick={() => fileInputRef.current?.click()}
        className={`border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-all duration-200 ${
          isDragOver
            ? 'border-blue-500 bg-blue-50/50 scale-[1.005]'
            : 'border-slate-300 bg-slate-50/50 hover:border-blue-400 hover:bg-blue-50/20'
        }`}
      >
        <input
          type="file"
          ref={fileInputRef}
          onChange={handleFileChange}
          multiple
          accept=".pdf,.csv,.txt"
          className="hidden"
        />

        <div className="flex flex-col items-center gap-2">
          <div className="h-14 w-14 rounded-full bg-blue-50 text-blue-600 flex items-center justify-center border border-blue-100 shadow-xs mb-2">
            <UploadCloud className="h-7 w-7" />
          </div>
          <div>
            <p className="text-sm font-semibold text-slate-800">
              Click or drag & drop statements here
            </p>
          </div>
          <span className="text-xs font-medium text-slate-400">
            Supports PDF, CSV & TXT files
          </span>
        </div>
      </div>

      {/* Uploaded Files Queue */}
      {files.length > 0 && (
        <div className="space-y-2.5 pt-1">
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider">
              Files Ready ({files.length})
            </h3>
            {queuedCount > 0 && (
              <button
                onClick={onProcessFiles}
                disabled={isProcessing}
                className="flex items-center gap-1.5 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-bold shadow-xs transition-all disabled:opacity-50 cursor-pointer"
              >
                {isProcessing ? (
                  <>
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    Extracting...
                  </>
                ) : (
                  <>
                    <Play className="h-3.5 w-3.5 fill-white" />
                    Extract Rows ({queuedCount})
                  </>
                )}
              </button>
            )}
          </div>

          <div className="space-y-1.5 max-h-48 overflow-y-auto pr-0.5">
            {files.map((file) => (
              <div
                key={file.id}
                className="flex items-center justify-between p-3 bg-slate-50 border border-slate-200 rounded-lg text-xs"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <FileText className="h-5 w-5 text-slate-400 shrink-0" />
                  <div className="min-w-0">
                    <div className="font-semibold text-slate-800 truncate">{file.name}</div>
                    <div className="text-[10px] text-slate-500 mt-0.5">
                      {(file.size / 1024).toFixed(1)} KB
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  {file.status === 'queued' && (
                    <span className="text-slate-600 bg-slate-200 px-2.5 py-1 rounded-md text-[10px] font-medium">
                      Queued
                    </span>
                  )}
                  {file.status === 'processing' && (
                    <span className="text-blue-600 font-medium flex items-center gap-1.5">
                      <Loader2 className="h-3.5 w-3.5 animate-spin" /> Extracting...
                    </span>
                  )}
                  {file.status === 'completed' && (
                    <span className="text-emerald-700 font-semibold flex items-center gap-1.5 bg-emerald-50 px-2.5 py-1 rounded-md border border-emerald-200 text-[11px]">
                      <CheckCircle2 className="h-3.5 w-3.5" /> {file.transactionCount} Rows
                    </span>
                  )}
                  {file.status === 'error' && (
                    <span className="text-red-600 flex items-center gap-1.5 bg-red-50 px-2.5 py-1 rounded-md border border-red-200">
                      <AlertCircle className="h-3.5 w-3.5" /> Error
                    </span>
                  )}

                  <button
                    onClick={() => onRemoveFile(file.id)}
                    className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-md transition-all cursor-pointer"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

    </div>
  );
};
