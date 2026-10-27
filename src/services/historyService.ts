import type { TransactionRow, ImportSession, SessionFileSummary } from '../types';
import { authService } from './authService';

const LEGACY_STORAGE_KEY = 'statement_import_sessions';

class HistoryService {
  /**
   * Scopes the storage key to the currently logged in user ID so that
   * different accounts never see or share each other's sessions.
   */
  private getStorageKey(): string {
    const session = authService.getCurrentSession();
    const userId = session?.user?.id;
    return userId ? `statement_import_sessions_${userId}` : 'statement_import_sessions_guest';
  }

  private getHeaders() {
    const session = authService.getCurrentSession();
    const token = session ? session.token : null;
    return {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    };
  }

  private getLocalSessions(): ImportSession[] {
    try {
      // Clean up legacy unscoped key so it NEVER leaks between accounts
      localStorage.removeItem(LEGACY_STORAGE_KEY);

      const key = this.getStorageKey();
      const raw = localStorage.getItem(key);
      if (!raw) return [];
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) return [];

      const currentUserId = authService.getCurrentSession()?.user?.id;
      return parsed.filter((s: any) => {
        if (!currentUserId) return !s.userId || s.userId === 'guest';
        return s.userId === currentUserId || !s.userId;
      });
    } catch {
      return [];
    }
  }

  private saveLocalSessions(sessions: ImportSession[]) {
    try {
      const key = this.getStorageKey();
      localStorage.setItem(key, JSON.stringify(sessions.slice(0, 50)));
    } catch (e) {
      console.warn('Failed to save sessions to localStorage', e);
    }
  }

  /**
   * Generates a descriptive session name from the files processed in that batch
   */
  generateSessionName(files: SessionFileSummary[]): string {
    if (!files || files.length === 0) return 'Import Session';
    const firstClean = files[0].name.replace(/\.[^/.]+$/, '');
    if (files.length === 1) return firstClean;
    return `${firstClean} + ${files.length - 1} other${files.length > 2 ? 's' : ''}`;
  }

  /**
   * Retrieves all saved import sessions strictly for the active account
   */
  async getSessions(): Promise<ImportSession[]> {
    const session = authService.getCurrentSession();
    const currentUserId = session?.user?.id;
    const local = this.getLocalSessions();

    // 1. If authenticated, cloud MongoDB is the single source of truth for this user account
    if (session?.token && currentUserId) {
      try {
        const res = await fetch('/api/history', { headers: this.getHeaders() });
        const data = await res.json();
        if (data.success && Array.isArray(data.data)) {
          const remoteSessions: ImportSession[] = data.data.map((item: any) => ({
            ...item,
            userId: currentUserId,
          }));

          // Cache this user's cloud sessions into their scoped localStorage key
          this.saveLocalSessions(remoteSessions);
          return remoteSessions.sort(
            (a, b) => new Date(b.uploadDate || b.createdAt || 0).getTime() - new Date(a.uploadDate || a.createdAt || 0).getTime()
          );
        }
      } catch (e) {
        console.warn('Backend session fetch failed, falling back to account local cache', e);
      }

      // If backend was unreachable, return this specific user's cached sessions only
      return local.sort(
        (a, b) => new Date(b.uploadDate || b.createdAt || 0).getTime() - new Date(a.uploadDate || a.createdAt || 0).getTime()
      );
    }

    // 2. Guest / unauthenticated mode: only return guest sessions
    return local.sort(
      (a, b) => new Date(b.uploadDate || b.createdAt || 0).getTime() - new Date(a.uploadDate || a.createdAt || 0).getTime()
    );
  }

  /**
   * Saves an entire import session containing all batch files and combined transactions
   */
  async saveSession(sessionData: {
    name?: string;
    files: SessionFileSummary[];
    transactions: TransactionRow[];
    sheetUrl?: string;
  }): Promise<ImportSession> {
    const isCredit = (t: TransactionRow) =>
      t.pricePaid < 0 ||
      t.type === 'CREDIT' ||
      t.type === 'PAYMENT' ||
      (t.pricePaidFormatted && t.pricePaidFormatted.includes('-'));

    const totalAmount = sessionData.transactions.reduce((sum, t) => {
      const val = isCredit(t) ? -Math.abs(t.pricePaid || 0) : Math.abs(t.pricePaid || 0);
      return sum + val;
    }, 0);
    const sessionName = sessionData.name || this.generateSessionName(sessionData.files);
    const tempId = `session-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`;
    const currentUserId = authService.getCurrentSession()?.user?.id || 'guest';

    const newSession: ImportSession = {
      id: tempId,
      userId: currentUserId,
      name: sessionName,
      fileName: sessionName,
      uploadDate: new Date().toISOString(),
      createdAt: new Date().toISOString(),
      fileCount: sessionData.files.length,
      files: sessionData.files,
      transactionCount: sessionData.transactions.length,
      totalAmount,
      transactions: sessionData.transactions,
      sheetUrl: sessionData.sheetUrl,
    };

    // 1. Immediately persist to current user's local cache
    const local = this.getLocalSessions();
    this.saveLocalSessions([newSession, ...local]);

    // 2. Persist to backend if authenticated
    try {
      const session = authService.getCurrentSession();
      if (session?.token) {
        const res = await fetch('/api/history', {
          method: 'POST',
          headers: this.getHeaders(),
          body: JSON.stringify({
            name: sessionName,
            files: sessionData.files,
            transactions: sessionData.transactions,
            totalAmount,
          }),
        });
        const data = await res.json();
        if (data.success && data.id) {
          // Sync backend MongoDB ID back to localStorage so local and remote IDs match
          newSession.id = data.id;
          const currentLocal = this.getLocalSessions();
          const updatedLocal = currentLocal.map((s) => (s.id === tempId ? { ...s, id: data.id } : s));
          this.saveLocalSessions(updatedLocal);
        }
      }
    } catch (error) {
      console.warn('Remote session save skipped or failed', error);
    }

    return newSession;
  }

  /**
   * Renames a session
   */
  async renameSession(sessionId: string, newName: string): Promise<boolean> {
    const trimmed = newName.trim();
    if (!trimmed) return false;

    // Local
    const local = this.getLocalSessions();
    const updated = local.map((s) => (s.id === sessionId ? { ...s, name: trimmed, fileName: trimmed } : s));
    this.saveLocalSessions(updated);

    // Remote
    try {
      const session = authService.getCurrentSession();
      if (session?.token) {
        await fetch(`/api/history/${sessionId}`, {
          method: 'PUT',
          headers: this.getHeaders(),
          body: JSON.stringify({ name: trimmed }),
        });
      }
    } catch {}

    return true;
  }

  /**
   * Deletes a session
   */
  async deleteSession(sessionId: string): Promise<boolean> {
    const local = this.getLocalSessions();
    this.saveLocalSessions(local.filter((item) => item.id !== sessionId));

    try {
      const session = authService.getCurrentSession();
      if (session?.token) {
        await fetch(`/api/history/${sessionId}`, {
          method: 'DELETE',
          headers: this.getHeaders(),
        });
      }
    } catch {}

    return true;
  }

  /**
   * Clears all sessions for the active user account
   */
  async clearAllSessions(): Promise<boolean> {
    this.saveLocalSessions([]);
    try {
      const session = authService.getCurrentSession();
      if (session?.token) {
        await fetch('/api/history', {
          method: 'DELETE',
          headers: this.getHeaders(),
        });
      }
    } catch {}
    return true;
  }

  // Backward compatibility methods
  async getUploadHistory(): Promise<ImportSession[]> {
    return this.getSessions();
  }

  async saveUpload(fileName: string, transactions: TransactionRow[]): Promise<void> {
    await this.saveSession({
      name: fileName.replace(/\.[^/.]+$/, ''),
      files: [{ name: fileName, transactionCount: transactions.length }],
      transactions,
    });
  }

  async deleteUpload(historyId: string): Promise<boolean> {
    return this.deleteSession(historyId);
  }

  async clearAllHistory(): Promise<boolean> {
    return this.clearAllSessions();
  }
}

export const historyService = new HistoryService();
