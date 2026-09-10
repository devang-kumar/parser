import type { User, UserRole, ActivityLog, AuthResponse } from '../types';

class AuthService {
  private SESSION_KEY = 'statement_importer_session_v3';

  // Helper to get token
  private getToken() {
    const session = this.getCurrentSession();
    return session ? session.token : null;
  }

  // Get auth headers
  private getHeaders() {
    const token = this.getToken();
    return {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {})
    };
  }

  async login(email: string, password: string): Promise<AuthResponse> {
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });
      const data = await res.json();
      
      if (data.success && data.token && data.user) {
        localStorage.setItem(this.SESSION_KEY, JSON.stringify({ token: data.token, user: data.user }));
      }
      return data;
    } catch (error: any) {
      return { success: false, message: error.message || 'Network error' };
    }
  }

  async signup(name: string, email: string, password: string, role: UserRole): Promise<AuthResponse> {
    try {
      const res = await fetch('/api/auth/signup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, email, password, role }),
      });
      const data = await res.json();
      
      if (data.success && data.token && data.user) {
        localStorage.setItem(this.SESSION_KEY, JSON.stringify({ token: data.token, user: data.user }));
      }
      return data;
    } catch (error: any) {
      return { success: false, message: error.message || 'Network error' };
    }
  }

  logout(): void {
    localStorage.removeItem(this.SESSION_KEY);
  }

  getCurrentSession(): { user: User, token: string } | null {
    try {
      const raw = localStorage.getItem(this.SESSION_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  }

  // Admin Methods
  async getUsers(): Promise<User[]> {
    try {
      const res = await fetch('/api/auth/users', { headers: this.getHeaders() });
      const data = await res.json();
      return data.success ? data.users : [];
    } catch {
      return [];
    }
  }

  async addUser(userParams: Partial<User> & { password?: string }): Promise<{success: boolean, message: string}> {
    try {
      const res = await fetch('/api/auth/users', {
        method: 'POST',
        headers: this.getHeaders(),
        body: JSON.stringify(userParams),
      });
      return await res.json();
    } catch (error: any) {
      return { success: false, message: 'Network error' };
    }
  }

  async removeUser(id: string): Promise<{success: boolean, message: string}> {
    try {
      const res = await fetch(`/api/auth/users/${id}`, {
        method: 'DELETE',
        headers: this.getHeaders(),
      });
      return await res.json();
    } catch (error: any) {
      return { success: false, message: 'Network error' };
    }
  }

  async toggleUserStatus(id: string): Promise<{success: boolean, message: string}> {
    try {
      const res = await fetch(`/api/auth/users/${id}/status`, {
        method: 'PUT',
        headers: this.getHeaders(),
      });
      return await res.json();
    } catch (error: any) {
      return { success: false, message: 'Network error' };
    }
  }

  async updateUserRole(id: string, _newRole?: UserRole): Promise<{success: boolean, message: string}> {
    try {
      const res = await fetch(`/api/auth/users/${id}/role`, {
        method: 'PUT',
        headers: this.getHeaders(),
      });
      return await res.json();
    } catch (error: any) {
      return { success: false, message: 'Network error' };
    }
  }

  // Mock logging for frontend (since we didn't add logs API in the new backend)
  getLogs(): ActivityLog[] {
    return [];
  }
  clearLogs(): void {}
  exportLogsCSV(): void {}
}

export const authService = new AuthService();
