import React from 'react';
import { FileSpreadsheet, HelpCircle, Layers } from 'lucide-react';
import type { ExtractionStats } from '../types';

interface NavbarProps {
  stats: ExtractionStats;
  onOpenGuide: () => void;
  onOpenSheetsManager: () => void;
}

export const Navbar: React.FC<NavbarProps> = ({
  stats,
  onOpenGuide,
  onOpenSheetsManager,
}) => {
  return (
    <header className="sticky top-0 z-40 bg-white/90 backdrop-blur-md border-b border-slate-200 px-4 lg:px-8 py-3.5 shadow-sm">
      <div className="max-w-7xl mx-auto flex items-center justify-between">
        
        {/* Brand logo & Title */}
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-xl bg-gradient-to-tr from-blue-600 to-indigo-600 p-0.5 shadow-md shadow-blue-500/20">
            <div className="h-full w-full bg-white rounded-[10px] flex items-center justify-center">
              <FileSpreadsheet className="h-5 w-5 text-blue-600" />
            </div>
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-lg font-bold text-slate-900 tracking-tight">StatementImporter</h1>
              <span className="text-[10px] font-bold uppercase tracking-wider bg-emerald-50 text-emerald-700 border border-emerald-200 px-2.5 py-0.5 rounded-full">
                High Precision
              </span>
            </div>
            <p className="text-xs text-slate-500">Bank Statement to Google Sheets Auto Importer</p>
          </div>
        </div>

        {/* Live Metrics & Quick Actions */}
        <div className="flex items-center gap-3">
          {/* Group Stats Badges */}
          <div className="hidden md:flex items-center gap-2 bg-slate-100/80 border border-slate-200 rounded-xl p-1 px-3 text-xs">
            <div className="flex items-center gap-1.5 px-2 py-1 bg-blue-50 text-blue-700 rounded-lg border border-blue-200/60">
              <span className="h-2 w-2 rounded-full bg-blue-600"></span>
              <span className="font-semibold">Group A:</span> {stats.groupATransactions}
            </div>
            <div className="flex items-center gap-1.5 px-2 py-1 bg-purple-50 text-purple-700 rounded-lg border border-purple-200/60">
              <span className="h-2 w-2 rounded-full bg-purple-600"></span>
              <span className="font-semibold">Group B:</span> {stats.groupBTransactions}
            </div>
          </div>

          {/* Action Buttons */}
          <button
            onClick={onOpenSheetsManager}
            className="flex items-center gap-2 px-3.5 py-2 bg-white hover:bg-slate-50 text-slate-700 border border-slate-300 rounded-xl text-xs font-semibold shadow-xs transition-all"
          >
            <Layers className="h-4 w-4 text-emerald-600" />
            <span>Saved Sheets</span>
          </button>

          <button
            onClick={onOpenGuide}
            className="flex items-center gap-2 px-3.5 py-2 bg-blue-50 hover:bg-blue-100/80 text-blue-700 border border-blue-200 rounded-xl text-xs font-semibold transition-all"
          >
            <HelpCircle className="h-4 w-4 text-blue-600" />
            <span>Sync Setup</span>
          </button>
        </div>

      </div>
    </header>
  );
};

