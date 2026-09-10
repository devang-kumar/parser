import { useState, useEffect } from 'react';
import { Navbar } from './components/Navbar';
import { StatementUploader } from './components/StatementUploader';
import { TransactionValidator } from './components/TransactionValidator';
import { SavedSheetsManager } from './components/SavedSheetsManager';
import { AuthModal } from './components/AuthModal';
import { UploadHistoryModal } from './components/UploadHistoryModal';
import { AdminPanel } from './components/AdminPanel';
import { Chatbot } from './components/Chatbot';
import { authService } from './services/authService';
import { historyService } from './services/historyService';
import type { 
  StatementFile, 
  SavedSpreadsheet, 
  TransactionRow,
  User,
  UploadHistoryItem
} from './types';
import { parseStatementFile } from './utils/pdfParser';
import { FileSpreadsheet } from 'lucide-react';

const LOCAL_STORAGE_SHEETS_KEY = 'statement_importer_saved_sheets';

export function App() {
  // Auth state
  const [currentUser, setCurrentUser] = useState<User | null>(() => {
    const session = authService.getCurrentSession();
    return session ? session.user : null;
  });

  const [showAuthModal, setShowAuthModal] = useState(false);
  const [isSheetsManagerOpen, setIsSheetsManagerOpen] = useState(false);
  const [isHistoryModalOpen, setIsHistoryModalOpen] = useState(false);
  const [isAdminPanelOpen, setIsAdminPanelOpen] = useState(false);

  // App core state
  const [files, setFiles] = useState<StatementFile[]>([]);
  const [transactions, setTransactions] = useState<TransactionRow[]>([]);
  const [savedSheets, setSavedSheets] = useState<SavedSpreadsheet[]>(() => {
    const cached = localStorage.getItem(LOCAL_STORAGE_SHEETS_KEY);
    return cached ? JSON.parse(cached) : [];
  });
  const [isProcessing, setIsProcessing] = useState(false);

  // Sync savedSheets to localStorage
  useEffect(() => {
    localStorage.setItem(LOCAL_STORAGE_SHEETS_KEY, JSON.stringify(savedSheets));
  }, [savedSheets]);

  // Handle logout
  const handleLogout = () => {
    authService.logout();
    setCurrentUser(null);
    setFiles([]);
    setTransactions([]);
  };

  // Handle successful authentication
  const handleAuthSuccess = (user: User) => {
    setCurrentUser(user);
    setShowAuthModal(false);
  };

  // Upload handler
  const handleUploadFiles = (rawFiles: File[]) => {
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
      transactionCount: 0,
      transactions: [],
      fileObject: file,
    }));

    setFiles((prev) => [...prev, ...newStatementFiles]);
  };

  // Process queued files
  const handleProcessFiles = async () => {
    setIsProcessing(true);
    const updatedFiles = [...files];
    let newTransactions: TransactionRow[] = [];

    for (let i = 0; i < updatedFiles.length; i++) {
      const fileItem = updatedFiles[i];
      if (fileItem.status === 'queued' && fileItem.fileObject) {
        fileItem.status = 'processing';
        setFiles([...updatedFiles]);

        try {
          const parsedRows = await parseStatementFile(
            fileItem.fileObject,
            fileItem.id,
            'default'
          );

          fileItem.status = 'completed';
          fileItem.transactionCount = parsedRows.length;
          fileItem.transactions = parsedRows;
          newTransactions = [...newTransactions, ...parsedRows];

          if (currentUser) {
            historyService.saveUpload(fileItem.name, parsedRows);
          }

        } catch (err: any) {
          fileItem.status = 'error';
          fileItem.errorMessage = err.message || 'Failed to parse statement file';
        }

        setFiles([...updatedFiles]);
      }
    }

    if (newTransactions.length > 0) {
      setTransactions((prev) => [...prev, ...newTransactions]);
    }
    
    setIsProcessing(false);
  };

  // Remove file from queue
  const handleRemoveFile = (fileId: string) => {
    setFiles((prev) => prev.filter((f) => f.id !== fileId));
    setTransactions((prev) => prev.filter((t) => t.fileId !== fileId));
  };

  // Update specific transaction row
  const handleUpdateTransaction = (id: string, updated: Partial<TransactionRow>) => {
    setTransactions((prev) =>
      prev.map((t) => (t.id === id ? { ...t, ...updated } : t))
    );
  };

  // Delete transaction row
  const handleDeleteTransaction = (id: string) => {
    setTransactions((prev) => prev.filter((t) => t.id !== id));
  };

  // Clear all parsed data
  const handleClearAll = () => {
    setTransactions([]);
    setFiles([]);
  };

  // Sheets Manager handlers
  const handleAddSheet = (sheet: SavedSpreadsheet) => {
    setSavedSheets([sheet]);
  };

  const handleDeleteSheet = (id: string) => {
    setSavedSheets((prev) => prev.filter((s) => s.id !== id));
  };

  const handleLoadHistory = (item: UploadHistoryItem) => {
    setTransactions(item.transactions);
    setFiles([{
      id: `history-${item.id}`,
      name: item.fileName,
      size: 0,
      uploadTime: new Date().toLocaleTimeString(),
      status: 'completed',
      progress: 100,
      transactionCount: item.transactionCount,
      transactions: item.transactions,
    }]);
  };

  return (
    <div className="min-h-screen pb-16 bg-slate-50 font-sans">
      {/* Top Navbar */}
      <Navbar
        currentUser={currentUser}
        onOpenSheetsManager={() => setIsSheetsManagerOpen(true)}
        onOpenHistory={() => setIsHistoryModalOpen(true)}
        onOpenAdminPanel={() => setIsAdminPanelOpen(true)}
        onLogout={handleLogout}
        onOpenAuth={() => setShowAuthModal(true)}
      />

      <main className="max-w-5xl mx-auto px-4 lg:px-8 mt-8 space-y-6">
        
        {!currentUser && (
          /* Unauthenticated Landing Page */
          <div className="flex flex-col items-center justify-center py-12 text-center animate-in fade-in slide-in-from-bottom-4 duration-700">
            <div className="h-16 w-16 rounded-3xl bg-gradient-to-tr from-blue-600 to-indigo-600 p-1 shadow-2xl shadow-blue-500/20 mb-6">
              <div className="h-full w-full bg-white rounded-[20px] flex items-center justify-center">
                <FileSpreadsheet className="h-8 w-8 text-blue-600" />
              </div>
            </div>
            
            <h1 className="text-3xl md:text-4xl font-extrabold text-slate-900 tracking-tight mb-4">
              Simplify Your Finances
            </h1>
            <p className="text-base text-slate-600 max-w-2xl mb-8 leading-relaxed">
              Instantly parse bank statement PDFs and sync them directly to your Google Sheets. No manual data entry, no mixed rows. Just clean data.
            </p>
          </div>
        )}

        {/* Dashboard / Uploader - Always visible */}
        <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
          <StatementUploader
            files={files}
            onUploadFiles={handleUploadFiles}
            onProcessFiles={handleProcessFiles}
            onRemoveFile={handleRemoveFile}
            isProcessing={isProcessing}
          />

          {transactions.length > 0 && (
            <TransactionValidator
              transactions={transactions}
              savedSheets={savedSheets}
              onUpdateTransaction={handleUpdateTransaction}
              onDeleteTransaction={handleDeleteTransaction}
              onClearAll={handleClearAll}
            />
          )}
        </div>

      </main>

      {/* Modals & Overlays */}
      
      {isSheetsManagerOpen && (
        <SavedSheetsManager
          sheets={savedSheets}
          onAddSheet={handleAddSheet}
          onDeleteSheet={handleDeleteSheet}
          onClose={() => setIsSheetsManagerOpen(false)}
        />
      )}

      {isHistoryModalOpen && currentUser && (
        <UploadHistoryModal
          currentUser={currentUser}
          onClose={() => setIsHistoryModalOpen(false)}
          onLoadHistory={handleLoadHistory}
        />
      )}

      {isAdminPanelOpen && currentUser && currentUser.role === 'admin' && (
        <AdminPanel
          currentUser={currentUser}
          onClose={() => setIsAdminPanelOpen(false)}
        />
      )}

      {showAuthModal && (
        <AuthModal 
          onSuccess={handleAuthSuccess} 
          onClose={() => setShowAuthModal(false)} 
        />
      )}

      {/* Groq AI Chatbot */}
      {currentUser && (
        <Chatbot transactions={transactions} />
      )}
    </div>
  );
}

export default App;
