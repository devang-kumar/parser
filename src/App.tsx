import { useState, useEffect } from 'react';
import { Navbar } from './components/Navbar';
import { StatementUploader } from './components/StatementUploader';
import { TransactionValidator } from './components/TransactionValidator';
import { SavedSheetsManager } from './components/SavedSheetsManager';
import { SetupGuideModal } from './components/SetupGuideModal';
import { AuthModal } from './components/AuthModal';
import { AdminPanel } from './components/AdminPanel';
import { authService } from './services/authService';
import type { 
  StatementFile, 
  SavedSpreadsheet, 
  TransactionRow, 
  GroupType, 
  ExtractionStats,
  User
} from './types';
import { parseStatementFile } from './utils/pdfParser';
import { Sparkles, FileCheck } from 'lucide-react';

const LOCAL_STORAGE_SHEETS_KEY = 'statement_importer_saved_sheets';

const INITIAL_DEFAULT_SHEETS: SavedSpreadsheet[] = [
  {
    id: 'default-sheet-x',
    title: 'Sheet X - Group A (Personal & Primary)',
    url: 'https://docs.google.com/spreadsheets/d/1BxiMVs0XRA5nFMdG1BxiMVs0XRA5nFMd/edit#gid=0',
    spreadsheetId: '1BxiMVs0XRA5nFMdG1BxiMVs0XRA5nFMd',
    tabName: 'Sheet1',
    groupId: 'Group A',
    createdAt: new Date().toLocaleDateString(),
    isDefault: true,
  },
  {
    id: 'default-sheet-y',
    title: 'Sheet Y - Group B (Business & Side Hustle)',
    url: 'https://docs.google.com/spreadsheets/d/2CyiNWt1YSA6oGNeH2CyiNWt1YSA6oGNe/edit#gid=0',
    spreadsheetId: '2CyiNWt1YSA6oGNeH2CyiNWt1YSA6oGNe',
    tabName: 'Sheet1',
    groupId: 'Group B',
    createdAt: new Date().toLocaleDateString(),
    isDefault: true,
  },
];

export function App() {
  // Auth state
  const [currentUser, setCurrentUser] = useState<User | null>(() => {
    const session = authService.getCurrentSession();
    return session ? session.user : null;
  });

  const [isAdminPanelOpen, setIsAdminPanelOpen] = useState(false);
  const [showAuthModal, setShowAuthModal] = useState(false);

  // App core state
  const [files, setFiles] = useState<StatementFile[]>([]);
  const [transactions, setTransactions] = useState<TransactionRow[]>([]);
  const [savedSheets, setSavedSheets] = useState<SavedSpreadsheet[]>(() => {
    const cached = localStorage.getItem(LOCAL_STORAGE_SHEETS_KEY);
    return cached ? JSON.parse(cached) : INITIAL_DEFAULT_SHEETS;
  });
  const [isProcessing, setIsProcessing] = useState(false);
  const [isSheetsManagerOpen, setIsSheetsManagerOpen] = useState(false);
  const [isGuideOpen, setIsGuideOpen] = useState(false);

  // Sync savedSheets to localStorage
  useEffect(() => {
    localStorage.setItem(LOCAL_STORAGE_SHEETS_KEY, JSON.stringify(savedSheets));
  }, [savedSheets]);

  // Handle logout
  const handleLogout = () => {
    authService.logout();
    setCurrentUser(null);
    setIsAdminPanelOpen(false);
  };

  // Handle successful authentication
  const handleAuthSuccess = (user: User) => {
    setCurrentUser(user);
    setShowAuthModal(false);
  };

  // Compute live statistics
  const stats: ExtractionStats = {
    totalFiles: files.length,
    totalTransactions: transactions.length,
    groupATransactions: transactions.filter((t) => t.group === 'Group A').length,
    groupBTransactions: transactions.filter((t) => t.group === 'Group B').length,
    totalAmount: transactions.reduce((sum, t) => sum + t.pricePaid, 0),
  };

  // Upload handler with activity logging
  const handleUploadFiles = (rawFiles: File[], group: GroupType) => {
    if (!currentUser) {
      setShowAuthModal(true);
      return;
    }

    const newStatementFiles: StatementFile[] = rawFiles.map((file, idx) => ({
      id: `file-${Date.now()}-${idx}`,
      name: file.name,
      size: file.size,
      uploadTime: new Date().toLocaleTimeString(),
      status: 'queued',
      progress: 0,
      group,
      transactionCount: 0,
      transactions: [],
      fileObject: file,
    }));

    setFiles((prev) => [...prev, ...newStatementFiles]);

    authService.logActivity(
      'STATEMENT_UPLOADED',
      `Queued ${rawFiles.length} file(s) for ${group}. (${rawFiles.map((f) => f.name).join(', ')})`,
      'FILE_UPLOAD'
    );
  };

  // Process queued files with activity logging
  const handleProcessFiles = async () => {
    setIsProcessing(true);
    const updatedFiles = [...files];

    for (let i = 0; i < updatedFiles.length; i++) {
      const fileItem = updatedFiles[i];
      if (fileItem.status === 'queued' && fileItem.fileObject) {
        fileItem.status = 'processing';
        setFiles([...updatedFiles]);

        try {
          const parsedRows = await parseStatementFile(
            fileItem.fileObject,
            fileItem.id,
            fileItem.group
          );

          fileItem.status = 'completed';
          fileItem.transactionCount = parsedRows.length;
          fileItem.transactions = parsedRows;

          setTransactions((prev) => [...prev, ...parsedRows]);

          authService.logActivity(
            'PARSE_STATEMENT_SUCCESS',
            `Successfully parsed ${parsedRows.length} transactions from ${fileItem.name} (${fileItem.group})`,
            'PARSE_DATA'
          );
        } catch (err: any) {
          fileItem.status = 'error';
          fileItem.errorMessage = err.message || 'Failed to parse statement file';

          authService.logActivity(
            'PARSE_STATEMENT_FAILED',
            `Failed to parse ${fileItem.name}: ${err.message}`,
            'PARSE_DATA'
          );
        }

        setFiles([...updatedFiles]);
      }
    }

    setIsProcessing(false);
  };

  // Remove file from queue
  const handleRemoveFile = (fileId: string) => {
    const targetFile = files.find((f) => f.id === fileId);
    setFiles((prev) => prev.filter((f) => f.id !== fileId));
    setTransactions((prev) => prev.filter((t) => t.fileId !== fileId));

    if (targetFile) {
      authService.logActivity(
        'FILE_REMOVED',
        `Removed statement file ${targetFile.name} from queue.`,
        'FILE_UPLOAD'
      );
    }
  };

  // Update specific transaction row
  const handleUpdateTransaction = (id: string, updated: Partial<TransactionRow>) => {
    setTransactions((prev) =>
      prev.map((t) => (t.id === id ? { ...t, ...updated } : t))
    );
  };

  // Delete transaction row
  const handleDeleteTransaction = (id: string) => {
    const target = transactions.find((t) => t.id === id);
    setTransactions((prev) => prev.filter((t) => t.id !== id));

    if (target) {
      authService.logActivity(
        'TRANSACTION_DELETED',
        `Deleted transaction row (${target.date} - ${target.chargeInformation} - ${target.pricePaidFormatted})`,
        'PARSE_DATA'
      );
    }
  };

  // Clear all parsed data
  const handleClearAll = () => {
    authService.logActivity(
      'CLEAR_ALL_DATA',
      `Cleared ${transactions.length} transaction rows and ${files.length} statement files.`,
      'PARSE_DATA'
    );
    setTransactions([]);
    setFiles([]);
  };

  // Sheets Manager handlers
  const handleAddSheet = (sheet: SavedSpreadsheet) => {
    setSavedSheets((prev) => [sheet, ...prev]);
    authService.logActivity(
      'SHEET_MAPPING_ADDED',
      `Added Google Sheet mapping: "${sheet.title}" (${sheet.groupId})`,
      'SHEET_SYNC'
    );
  };

  const handleDeleteSheet = (id: string) => {
    const target = savedSheets.find((s) => s.id === id);
    setSavedSheets((prev) => prev.filter((s) => s.id !== id));
    if (target) {
      authService.logActivity(
        'SHEET_MAPPING_DELETED',
        `Deleted sheet mapping: "${target.title}"`,
        'SHEET_SYNC'
      );
    }
  };

  const handleSetDefaultSheet = (id: string) => {
    setSavedSheets((prev) =>
      prev.map((s) => {
        const target = prev.find((x) => x.id === id);
        if (target && s.groupId === target.groupId) {
          return { ...s, isDefault: s.id === id };
        }
        return s;
      })
    );
  };

  // Load Real Chase & Business Statement Demo Data for testing
  const handleLoadDemoData = () => {
    if (!currentUser) {
      setShowAuthModal(true);
      return;
    }
    const rawChaseLines = [
      { date: '06/26/2026', desc: 'TEMU.COM 1-302-4806118 MA', price: -32.76, type: 'CREDIT' },
      { date: '07/12/2026', desc: 'ANNUAL HOTEL CREDIT', price: -50.00, type: 'CREDIT' },
      { date: '07/20/2026', desc: 'AUTOMATIC PAYMENT - THANK YOU', price: -1199.71, type: 'CREDIT' },
      { date: '06/24/2026', desc: 'Netflix.com netflix.com CA', price: 19.99, type: 'PURCHASE' },
      { date: '06/29/2026', desc: 'PAYPAL *TRADINGVIEW PRODU 940-419-1000 NY', price: 89.40, type: 'PURCHASE' },
      { date: '07/04/2026', desc: 'AMERIGAS PROPANE LP 3SM RIVERSIDE CA', price: 21.30, type: 'PURCHASE' },
      { date: '07/04/2026', desc: 'AMERIGAS PROPANE LP 3SM RIVERSIDE CA', price: 21.30, type: 'PURCHASE' },
      { date: '07/04/2026', desc: 'AMERIGAS PROPANE LP 3SM RIVERSIDE CA', price: 21.30, type: 'PURCHASE' },
      { date: '07/04/2026', desc: 'SAMSCLUB 6378 GAS RIVERSIDE CA', price: 88.32, type: 'PURCHASE' },
      { date: '07/04/2026', desc: 'SAMS CLUB #6378 RIVERSIDE CA', price: 10.83, type: 'PURCHASE' },
      { date: '07/08/2026', desc: 'Hibbett Retail, Inc. Birmingham AL', price: 51.32, type: 'PURCHASE' },
      { date: '07/08/2026', desc: 'Hibbett Retail, Inc. Birmingham AL', price: 21.73, type: 'PURCHASE' },
      { date: '07/10/2026', desc: 'CL *Chase Travel TRIPCHRG.COM VA', price: 57.28, type: 'PURCHASE' },
      { date: '07/11/2026', desc: 'Hibbett Retail, Inc. Birmingham AL', price: 118.52, type: 'PURCHASE' },
      { date: '07/12/2026', desc: 'Hibbett Retail, Inc. Birmingham AL', price: 60.33, type: 'PURCHASE' },
      { date: '07/13/2026', desc: 'Hibbett Retail, Inc. Birmingham AL', price: 90.69, type: 'PURCHASE' },
      { date: '07/13/2026', desc: 'Hibbett Retail, Inc. Birmingham AL', price: 103.74, type: 'PURCHASE' },
      { date: '07/13/2026', desc: 'Hibbett Retail, Inc. Birmingham AL', price: 59.37, type: 'PURCHASE' },
      { date: '07/13/2026', desc: 'Hibbett Retail, Inc. Birmingham AL', price: 103.74, type: 'PURCHASE' },
      { date: '07/14/2026', desc: 'Hibbett Retail, Inc. Birmingham AL', price: 68.49, type: 'PURCHASE' },
      { date: '07/14/2026', desc: 'Hibbett Retail, Inc. Birmingham AL', price: 66.04, type: 'PURCHASE' },
      { date: '07/15/2026', desc: 'Hibbett Retail, Inc. Birmingham AL', price: 88.89, type: 'PURCHASE' },
      { date: '07/14/2026', desc: 'Hibbett Retail, Inc. Birmingham AL', price: 80.74, type: 'PURCHASE' },
      { date: '07/14/2026', desc: 'Hibbett Retail, Inc. Birmingham AL', price: 60.33, type: 'PURCHASE' },
      { date: '07/15/2026', desc: 'Hibbett Retail, Inc. Birmingham AL', price: 49.74, type: 'PURCHASE' },
      { date: '07/16/2026', desc: 'Hibbett Retail, Inc. Birmingham AL', price: 60.35, type: 'PURCHASE' },
      { date: '07/16/2026', desc: 'Hibbett Retail, Inc. Birmingham AL', price: 94.59, type: 'PURCHASE' },
      { date: '07/16/2026', desc: 'Hibbett Retail, Inc. Birmingham AL', price: 60.33, type: 'PURCHASE' },
      { date: '07/16/2026', desc: 'Hibbett Retail, Inc. Birmingham AL', price: 60.33, type: 'PURCHASE' },
      { date: '07/16/2026', desc: 'Hibbett Retail, Inc. Birmingham AL', price: 94.59, type: 'PURCHASE' },
      { date: '07/16/2026', desc: 'Hibbett Retail, Inc. Birmingham AL', price: 58.71, type: 'PURCHASE' },
      { date: '07/16/2026', desc: 'Hibbett Retail, Inc. Birmingham AL', price: 58.70, type: 'PURCHASE' },
      { date: '07/16/2026', desc: 'Hibbett Retail, Inc. Birmingham AL', price: 58.71, type: 'PURCHASE' },
      { date: '07/16/2026', desc: 'Hibbett Retail, Inc. Birmingham AL', price: 94.59, type: 'PURCHASE' },
      { date: '07/18/2026', desc: 'Hibbett Retail, Inc. Birmingham AL', price: 63.60, type: 'PURCHASE' },
      { date: '07/18/2026', desc: 'Hibbett Retail, Inc. Birmingham AL', price: 63.60, type: 'PURCHASE' },
      { date: '07/19/2026', desc: 'Hibbett Retail, Inc. Birmingham AL', price: 94.60, type: 'PURCHASE' },
      { date: '07/20/2026', desc: 'Hibbett Retail, Inc. Birmingham AL', price: 60.33, type: 'PURCHASE' },
    ];

    const sampleRowsGroupA: TransactionRow[] = rawChaseLines.map((item, idx) => ({
      id: `chase-row-${idx + 1}`,
      fileId: 'chase-file-a',
      fileName: 'Chase_Sapphire_July2026.pdf',
      lineNum: idx + 1,
      date: item.date,
      pricePaid: item.price,
      pricePaidFormatted: item.price < 0 ? `-$${Math.abs(item.price).toFixed(2)}` : `$${item.price.toFixed(2)}`,
      chargeInformation: item.desc,
      type: item.type as any,
      rawLine: `${item.date.slice(0, 5)} ${item.desc} ${Math.abs(item.price).toFixed(2)}`,
      confidenceScore: 100,
      group: 'Group A',
      isDuplicate: idx > 0 && rawChaseLines.slice(0, idx).some((x) => x.date === item.date && x.price === item.price && x.desc === item.desc),
    }));

    const sampleRowsGroupB: TransactionRow[] = [
      {
        id: 'groupb-1',
        fileId: 'bofa-file-b',
        fileName: 'BofA_Business_Statement_July.pdf',
        lineNum: 1,
        date: '07/15/2026',
        pricePaid: 199.99,
        pricePaidFormatted: '$199.99',
        chargeInformation: 'AWS Cloud Hosting Services',
        type: 'PURCHASE',
        rawLine: '07/15 AWS Cloud Hosting Services 199.99',
        confidenceScore: 100,
        group: 'Group B',
      },
      {
        id: 'groupb-2',
        fileId: 'bofa-file-b',
        fileName: 'BofA_Business_Statement_July.pdf',
        lineNum: 2,
        date: '07/18/2026',
        pricePaid: 45.00,
        pricePaidFormatted: '$45.00',
        chargeInformation: 'Google Workspace Subscriptions',
        type: 'PURCHASE',
        rawLine: '07/18 Google Workspace Subscriptions 45.00',
        confidenceScore: 100,
        group: 'Group B',
      },
      {
        id: 'groupb-3',
        fileId: 'bofa-file-b',
        fileName: 'BofA_Business_Statement_July.pdf',
        lineNum: 3,
        date: '07/21/2026',
        pricePaid: 50.00,
        pricePaidFormatted: '$50.00',
        chargeInformation: 'Hibbett Retail, Inc. Birmingham AL',
        type: 'PURCHASE',
        rawLine: '07/21 Hibbett Retail, Inc. Birmingham AL 50.00',
        confidenceScore: 100,
        group: 'Group B',
      },
      {
        id: 'groupb-4',
        fileId: 'bofa-file-b',
        fileName: 'BofA_Business_Statement_July.pdf',
        lineNum: 4,
        date: '07/22/2026',
        pricePaid: 60.00,
        pricePaidFormatted: '$60.00',
        chargeInformation: 'Nike Store Beaverton OR',
        type: 'PURCHASE',
        rawLine: '07/22 Nike Store Beaverton OR 60.00',
        confidenceScore: 100,
        group: 'Group B',
      },
      {
        id: 'groupb-5',
        fileId: 'bofa-file-b',
        fileName: 'BofA_Business_Statement_July.pdf',
        lineNum: 5,
        date: '07/23/2026',
        pricePaid: 60.00,
        pricePaidFormatted: '$60.00',
        chargeInformation: 'Hibbett Retail, Inc. Birmingham AL',
        type: 'PURCHASE',
        rawLine: '07/23 Hibbett Retail, Inc. Birmingham AL 60.00',
        confidenceScore: 100,
        group: 'Group B',
      },
    ];

    setTransactions([...sampleRowsGroupA, ...sampleRowsGroupB]);
    setFiles([
      {
        id: 'chase-file-a',
        name: 'Chase_Sapphire_July2026.pdf',
        size: 184200,
        uploadTime: new Date().toLocaleTimeString(),
        status: 'completed',
        progress: 100,
        group: 'Group A',
        transactionCount: sampleRowsGroupA.length,
        transactions: sampleRowsGroupA,
      },
      {
        id: 'bofa-file-b',
        name: 'BofA_Business_Statement_July.pdf',
        size: 98400,
        uploadTime: new Date().toLocaleTimeString(),
        status: 'completed',
        progress: 100,
        group: 'Group B',
        transactionCount: sampleRowsGroupB.length,
        transactions: sampleRowsGroupB,
      },
    ]);

    authService.logActivity(
      'DEMO_DATA_LOADED',
      'Loaded 43 sample transactions (Group A & Group B).',
      'PARSE_DATA'
    );
  };

  // (Removed early return for !currentUser)

  return (
    <div className="min-h-screen pb-16 space-y-6 bg-slate-50">
      {/* Top Navbar */}
      <Navbar
        stats={stats}
        currentUser={currentUser}
        onOpenGuide={() => setIsGuideOpen(true)}
        onOpenSheetsManager={() => setIsSheetsManagerOpen(true)}
        onOpenAdminPanel={() => setIsAdminPanelOpen(true)}
        onLogout={handleLogout}
        onOpenAuth={() => setShowAuthModal(true)}
      />

      <main className="max-w-7xl mx-auto px-4 lg:px-8 space-y-6">
        
        {/* Banner Section */}
        <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-2xs relative overflow-hidden">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <span className="p-1 bg-blue-50 text-blue-600 rounded-lg">
                  <Sparkles className="h-4 w-4" />
                </span>
                <span className="text-xs font-bold uppercase tracking-wider text-blue-600">
                  Bank Statement Importer
                </span>
              </div>
              <h2 className="text-xl lg:text-2xl font-bold text-slate-900 tracking-tight">
                Import Group A to Sheet X & Group B to Sheet Y
              </h2>
              <p className="text-xs text-slate-600 max-w-2xl leading-relaxed">
                Zero row mixing. Automatically maps Date $\rightarrow$ Column A, Price Paid $\rightarrow$ Column B, Description $\rightarrow$ Column C in 1-click.
              </p>
            </div>

            {/* Quick Demo Action */}
            {transactions.length === 0 && (
              <button
                onClick={handleLoadDemoData}
                className="flex items-center gap-2 px-4 py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl text-xs shadow-sm transition-all shrink-0 cursor-pointer"
              >
                <FileCheck className="h-4 w-4" />
                Load Sample Statement Data
              </button>
            )}
          </div>
        </div>

        {/* Admin Panel Overlay / Modal (Visible when triggered by Admin) */}
        {isAdminPanelOpen && currentUser.role === 'admin' && (
          <AdminPanel
            currentUser={currentUser}
            onClose={() => setIsAdminPanelOpen(false)}
          />
        )}

        {/* Saved Sheets Manager Drawer / Modal section if toggled */}
        {isSheetsManagerOpen && (
          <SavedSheetsManager
            sheets={savedSheets}
            onAddSheet={handleAddSheet}
            onDeleteSheet={handleDeleteSheet}
            onSetDefault={handleSetDefaultSheet}
            onClose={() => setIsSheetsManagerOpen(false)}
          />
        )}

        {/* Main Grid: Upload & File Queue */}
        <StatementUploader
          files={files}
          onUploadFiles={handleUploadFiles}
          onProcessFiles={handleProcessFiles}
          onRemoveFile={handleRemoveFile}
          isProcessing={isProcessing}
        />

        {/* Transaction Data Table & Accuracy Audit */}
        <TransactionValidator
          transactions={transactions}
          savedSheets={savedSheets}
          onUpdateTransaction={handleUpdateTransaction}
          onDeleteTransaction={handleDeleteTransaction}
          onClearAll={handleClearAll}
        />

      </main>

      {/* Setup Guide Modal */}
      <SetupGuideModal isOpen={isGuideOpen} onClose={() => setIsGuideOpen(false)} />

      {/* Auth Modal Overlay */}
      {showAuthModal && (
        <AuthModal 
          onSuccess={handleAuthSuccess} 
          onClose={() => setShowAuthModal(false)} 
        />
      )}
    </div>
  );
}

export default App;
