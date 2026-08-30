import React, { useState, useRef, useEffect } from 'react';
import { 
  FileSpreadsheet, 
  HelpCircle, 
  Layers, 
  ShieldCheck, 
  LogOut, 
  ChevronDown
} from 'lucide-react';
import type { ExtractionStats, User } from '../types';

interface NavbarProps {
  stats: ExtractionStats;
  currentUser: User | null;
  onOpenGuide: () => void;
  onOpenSheetsManager: () => void;
  onOpenAdminPanel: () => void;
  onLogout: () => void;
  onOpenAuth: () => void;
}

export const Navbar: React.FC<NavbarProps> = ({
  stats,
  currentUser,
  onOpenGuide,
  onOpenSheetsManager,
  onOpenAdminPanel,
  onLogout,
  onOpenAuth,
}) => {
  const [isProfileOpen, setIsProfileOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsProfileOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  return (
    <header className="sticky top-0 z-40 bg-white/90 backdrop-blur-md border-b border-slate-200 px-4 lg:px-8 py-3.5 shadow-xs">
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

        {/* Live Metrics & Actions */}
        <div className="flex items-center gap-3">
          {/* Group Stats Badges */}
          <div className="hidden lg:flex items-center gap-2 bg-slate-100/80 border border-slate-200 rounded-xl p-1 px-3 text-xs">
            <div className="flex items-center gap-1.5 px-2 py-1 bg-blue-50 text-blue-700 rounded-lg border border-blue-200/60">
              <span className="h-2 w-2 rounded-full bg-blue-600"></span>
              <span className="font-semibold">Group A:</span> {stats.groupATransactions}
            </div>
            <div className="flex items-center gap-1.5 px-2 py-1 bg-purple-50 text-purple-700 rounded-lg border border-purple-200/60">
              <span className="h-2 w-2 rounded-full bg-purple-600"></span>
              <span className="font-semibold">Group B:</span> {stats.groupBTransactions}
            </div>
          </div>

          {/* Admin Panel Button (Visible for Admins) */}
          {currentUser && currentUser.role === 'admin' && (
            <button
              onClick={onOpenAdminPanel}
              className="flex items-center gap-2 px-3.5 py-2 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200 rounded-xl text-xs font-bold transition-all shadow-2xs cursor-pointer"
            >
              <ShieldCheck className="h-4 w-4 text-indigo-600" />
              <span>Admin Panel</span>
              <span className="bg-indigo-600 text-white text-[9px] px-1.5 py-0.2 rounded-full font-bold uppercase">
                Admin
              </span>
            </button>
          )}

          {/* Action Buttons */}
          <button
            onClick={onOpenSheetsManager}
            className="hidden sm:flex items-center gap-2 px-3.5 py-2 bg-white hover:bg-slate-50 text-slate-700 border border-slate-300 rounded-xl text-xs font-semibold shadow-2xs transition-all cursor-pointer"
          >
            <Layers className="h-4 w-4 text-emerald-600" />
            <span>Saved Sheets</span>
          </button>

          <button
            onClick={onOpenGuide}
            className="hidden sm:flex items-center gap-2 px-3.5 py-2 bg-blue-50 hover:bg-blue-100/80 text-blue-700 border border-blue-200 rounded-xl text-xs font-semibold transition-all cursor-pointer"
          >
            <HelpCircle className="h-4 w-4 text-blue-600" />
            <span>Sync Setup</span>
          </button>

          {/* User Profile & Dropdown OR Login Button */}
          {currentUser ? (
            <div className="relative" ref={dropdownRef}>
              <button
                onClick={() => setIsProfileOpen(!isProfileOpen)}
                className="flex items-center gap-2 p-1.5 pr-2.5 bg-slate-100 hover:bg-slate-200/70 border border-slate-200 rounded-xl transition-all cursor-pointer"
              >
                <div className={`h-7 w-7 rounded-lg ${currentUser.avatarColor || 'bg-indigo-600'} text-white font-bold text-xs flex items-center justify-center shadow-2xs`}>
                  {currentUser.name.charAt(0).toUpperCase()}
                </div>
                <div className="hidden md:block text-left text-xs">
                  <div className="font-bold text-slate-900 leading-none truncate max-w-[110px]">
                    {currentUser.name}
                  </div>
                  <div className="text-[10px] text-slate-500 uppercase font-semibold">
                    {currentUser.role}
                  </div>
                </div>
                <ChevronDown className="h-3.5 w-3.5 text-slate-500" />
              </button>

              {/* Profile Dropdown Menu */}
              {isProfileOpen && (
                <div className="absolute right-0 mt-2 w-64 bg-white rounded-2xl shadow-xl border border-slate-200 py-2 z-50 animate-in fade-in slide-in-from-top-2">
                  <div className="px-4 py-3 border-b border-slate-100">
                    <div className="flex items-center justify-between">
                      <p className="text-xs font-bold text-slate-900">{currentUser.name}</p>
                      <span className={`px-2 py-0.5 rounded-full text-[10px] font-extrabold uppercase ${
                        currentUser.role === 'admin' ? 'bg-indigo-100 text-indigo-700' : 'bg-slate-100 text-slate-700'
                      }`}>
                        {currentUser.role}
                      </span>
                    </div>
                    <p className="text-[11px] text-slate-500 truncate mt-0.5">{currentUser.email}</p>
                  </div>

                  <div className="py-1">
                    {currentUser.role === 'admin' && (
                      <button
                        onClick={() => { setIsProfileOpen(false); onOpenAdminPanel(); }}
                        className="w-full text-left px-4 py-2 text-xs text-indigo-700 font-semibold hover:bg-indigo-50 flex items-center gap-2 cursor-pointer"
                      >
                        <ShieldCheck className="h-4 w-4 text-indigo-600" />
                        <span>Manage Users & Audit Logs</span>
                      </button>
                    )}

                    <button
                      onClick={() => { setIsProfileOpen(false); onOpenSheetsManager(); }}
                      className="w-full text-left px-4 py-2 text-xs text-slate-700 hover:bg-slate-50 flex items-center gap-2 cursor-pointer sm:hidden"
                    >
                      <Layers className="h-4 w-4 text-emerald-600" />
                      <span>Saved Sheets Manager</span>
                    </button>

                    <button
                      onClick={() => { setIsProfileOpen(false); onOpenGuide(); }}
                      className="w-full text-left px-4 py-2 text-xs text-slate-700 hover:bg-slate-50 flex items-center gap-2 cursor-pointer sm:hidden"
                    >
                      <HelpCircle className="h-4 w-4 text-blue-600" />
                      <span>Sync Setup Guide</span>
                    </button>
                  </div>

                  <div className="border-t border-slate-100 pt-1 mt-1">
                    <button
                      onClick={() => { setIsProfileOpen(false); onLogout(); }}
                      className="w-full text-left px-4 py-2 text-xs text-rose-600 font-bold hover:bg-rose-50 flex items-center gap-2 cursor-pointer"
                    >
                      <LogOut className="h-4 w-4 text-rose-600" />
                      <span>Sign Out</span>
                    </button>
                  </div>
                </div>
              )}
            </div>
          ) : (
            <button
              onClick={onOpenAuth}
              className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white border border-blue-600 rounded-xl text-xs font-bold transition-all shadow-sm cursor-pointer"
            >
              <span>Login / Sign Up</span>
            </button>
          )}

        </div>

      </div>
    </header>
  );
};
