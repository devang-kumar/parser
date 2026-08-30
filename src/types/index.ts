export * from './auth';

export type GroupType = 'Group A' | 'Group B' | string;

export interface SavedSpreadsheet {
  id: string;
  title: string;
  url: string;
  spreadsheetId: string;
  tabName: string;
  groupId: GroupType;
  webhookUrl?: string;
  createdAt: string;
  isDefault?: boolean;
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
  group: GroupType;
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
  group: GroupType;
  transactionCount: number;
  transactions: TransactionRow[];
  errorMessage?: string;
  fileObject?: File;
}

export interface ExtractionStats {
  totalFiles: number;
  totalTransactions: number;
  groupATransactions: number;
  groupBTransactions: number;
  totalAmount: number;
}
