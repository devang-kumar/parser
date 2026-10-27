export * from './auth';

export type GroupType = 'default' | 'all';

export interface AuthResponse {
  success: boolean;
  message?: string;
  token?: string;
  user?: any;
}

export interface SavedSpreadsheet {
  id: string;
  title: string;
  url: string;
  spreadsheetId: string;
  tabName: string;
  webhookUrl?: string;
  createdAt: string;
}

export type TransactionType = 'PURCHASE' | 'CREDIT' | 'PAYMENT' | 'FEE' | 'INTEREST' | 'OTHER';

export interface TransactionRow {
  id: string;
  fileId: string;
  fileName: string;
  lineNum: number;
  date: string;
  pricePaid: number;
  pricePaidFormatted: string;
  chargeInformation: string;
  type: TransactionType;
  rawLine: string;
  confidenceScore: number;
  group?: GroupType;
  isDuplicate?: boolean;
  isSelected?: boolean;
}

export interface StatementFile {
  id: string;
  name: string;
  size: number;
  uploadTime: string;
  status: 'queued' | 'processing' | 'completed' | 'error';
  progress: number;
  transactionCount: number;
  transactions: TransactionRow[];
  errorMessage?: string;
  fileObject?: File;
}

export interface SessionFileSummary {
  name: string;
  size?: number;
  transactionCount: number;
}

export interface ImportSession {
  id: string;
  userId?: string;
  name: string;
  fileName?: string;
  uploadDate: string;
  createdAt?: string;
  fileCount: number;
  files: SessionFileSummary[];
  transactionCount: number;
  totalAmount?: number;
  transactions: TransactionRow[];
  sheetUrl?: string;
}

export type UploadHistoryItem = ImportSession;


