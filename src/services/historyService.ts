import type { TransactionRow, ImportSession, SessionFileSummary } from '../types';
import { authService } from './authService';

const LOCAL_STORAGE_SESSIONS_KEY = 'statement_import_sessions';

class HistoryService {
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
      const raw = localStorage.getItem(LOCAL_STORAGE_SESSIONS_KEY);
      if (!raw) return [];
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }

  private saveLocalSessions(sessions: ImportSession[]) {
    try {
      localStorage.setItem(LOCAL_STORAGE_SESSIONS_KEY, JSON.stringify(sessions.slice(0, 50)));
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
   * Retrieves all saved import sessions (merging cloud & localStorage without duplicates)
   */
  async getSessions(): Promise<ImportSession[]> {
    const local = this.getLocalSessions();
    let remote: ImportSession[] = [];

    try {
      const session = authService.getCurrentSession();
      if (session?.token) {
        const res = await fetch('/api/history', { headers: this.getHeaders() });
        const data = await res.json();
        if (data.success && Array.isArray(data.data)) {
          remote = data.data;
        }
      }
    } catch (e) {
      console.warn('Backend session fetch skipped or failed, using local storage', e);
    }

    // Helper to determine if two session objects represent the same import session
    const isDuplicate = (a: ImportSession, b: ImportSession): boolean => {
      if (a.id && b.id && a.id === b.id) return true;

      const nameA = (a.name || a.fileName || '').trim().toLowerCase();
      const nameB = (b.name || b.fileName || '').trim().toLowerCase();
      const countA = a.transactionCount || a.transactions?.length || 0;
      const countB = b.transactionCount || b.transactions?.length || 0;

      if (countA > 0 && countA === countB) {
        // Compare first transaction if present
        const txA = a.transactions?.[0];
        const txB = b.transactions?.[0];
        if (txA && txB) {
          if (
            txA.date === txB.date &&
            txA.description === txB.description &&
            Math.abs((txA.pricePaid || 0) - (txB.pricePaid || 0)) < 0.01
          ) {
            return true;
          }
        }

        // Compare amounts & names
        const amtA = Math.round((a.totalAmount || 0) * 100);
        const amtB = Math.round((b.totalAmount || 0) * 100);
        if (amtA === amtB && nameA === nameB) {
          return true;
        }

        // Compare timestamps within 15 minutes and matching names
        const timeA = new Date(a.uploadDate || a.createdAt || 0).getTime();
        const timeB = new Date(b.uploadDate || b.createdAt || 0).getTime();
        if (Math.abs(timeA - timeB) < 15 * 60 * 1000 && nameA === nameB) {
          return true;
        }
      }

      return false;
    };

    let uniqueSessions: ImportSession[] = [];

    if (remote.length > 0) {
      // Remote cloud sessions are the authoritative source of truth for logged-in accounts
      uniqueSessions = [...remote];

      // Keep only local sessions that do not already exist on the server (e.g. offline/guest)
      const remainingLocal: ImportSession[] = [];
      for (const loc of local) {
        const alreadyInRemote = remote.some((rem) => isDuplicate(loc, rem));
        if (!alreadyInRemote) {
          remainingLocal.push(loc);
          uniqueSessions.push(loc);
        }
      }

      // Automatically purge the duplicate local sessions so localStorage stays clean
      if (remainingLocal.length !== local.length) {
        this.saveLocalSessions(uniqueSessions);
      }
    } else {
      // Offline / guest mode: deduplicate local list
      for (const loc of local) {
        if (!uniqueSessions.some((existing) => isDuplicate(existing, loc))) {
          uniqueSessions.push(loc);
        }
      }
    }

    return uniqueSessions.sort(
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

    const newSession: ImportSession = {
      id: tempId,
      userId: authService.getCurrentSession()?.user?.id || 'guest',
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

    // 1. Immediately persist to localStorage for instant UI response
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
   * Clears all sessions
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


