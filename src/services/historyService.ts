import type { TransactionRow, UploadHistoryItem } from '../types';
import { authService } from './authService';

class HistoryService {
  private getHeaders() {
    const session = authService.getCurrentSession();
    const token = session ? session.token : null;
    return {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {})
    };
  }

  async getUploadHistory(): Promise<UploadHistoryItem[]> {
    try {
      const res = await fetch('/api/history', { headers: this.getHeaders() });
      const data = await res.json();
      return data.success ? data.data : [];
    } catch {
      return [];
    }
  }

  async saveUpload(fileName: string, transactions: TransactionRow[]): Promise<void> {
    try {
      await fetch('/api/history', {
        method: 'POST',
        headers: this.getHeaders(),
        body: JSON.stringify({ fileName, transactions }),
      });
    } catch (error) {
      console.error('Failed to save history', error);
    }
  }

  async deleteUpload(historyId: string): Promise<boolean> {
    try {
      const res = await fetch(`/api/history/${historyId}`, {
        method: 'DELETE',
        headers: this.getHeaders(),
      });
      const data = await res.json();
      return data.success;
    } catch {
      return false;
    }
  }
}

export const historyService = new HistoryService();
