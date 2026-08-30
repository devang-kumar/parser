import type { User, UserRole, ActivityLog, AuthSession, ActionCategory } from '../types/auth';

const STORAGE_USERS_KEY = 'statement_importer_users_v2';
const STORAGE_SESSION_KEY = 'statement_importer_session_v2';
const STORAGE_LOGS_KEY = 'statement_importer_logs_v2';

// Simple hashing simulation for client-side persistence security
const hashPassword = (password: string): string => {
  let hash = 0;
  for (let i = 0; i < password.length; i++) {
    const char = password.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash = hash & hash;
  }
  return `hash_${Math.abs(hash).toString(16)}_${btoa(password).substring(0, 10)}`;
};

// Initial Seed Users
const INITIAL_USERS: User[] = [
  {
    id: 'user-admin-1',
    name: 'System Admin',
    email: 'admin@statementimporter.com',
    passwordHash: hashPassword('Admin123!'),
    role: 'admin',
    createdAt: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString(),
    lastLogin: new Date().toISOString(),
    status: 'active',
    avatarColor: 'bg-indigo-600',
  },
  {
    id: 'user-demo-2',
    name: 'Sarah Connor (Demo User)',
    email: 'user@statementimporter.com',
    passwordHash: hashPassword('User123!'),
    role: 'user',
    createdAt: new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString(),
    lastLogin: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString(),
    status: 'active',
    avatarColor: 'bg-emerald-600',
  },
  {
    id: 'user-sample-3',
    name: 'Michael Scott',
    email: 'michael@dundermifflin.com',
    passwordHash: hashPassword('Paper123!'),
    role: 'user',
    createdAt: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString(),
    lastLogin: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString(),
    status: 'active',
    avatarColor: 'bg-blue-600',
  },
];

// Initial Seed Activity Audit Trail
const INITIAL_LOGS: ActivityLog[] = [
  {
    id: 'log-1',
    userId: 'user-admin-1',
    userName: 'System Admin',
    userEmail: 'admin@statementimporter.com',
    userRole: 'admin',
    category: 'SYSTEM',
    action: 'SYSTEM_INITIALIZED',
    details: 'Statement Importer Security & Auth System initialized successfully.',
    ipAddress: '192.168.1.1',
    timestamp: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
  },
  {
    id: 'log-2',
    userId: 'user-demo-2',
    userName: 'Sarah Connor (Demo User)',
    userEmail: 'user@statementimporter.com',
    userRole: 'user',
    category: 'AUTH',
    action: 'USER_LOGIN',
    details: 'User authenticated via email/password.',
    ipAddress: '192.168.1.104',
    timestamp: new Date(Date.now() - 12 * 60 * 60 * 1000).toISOString(),
  },
  {
    id: 'log-3',
    userId: 'user-demo-2',
    userName: 'Sarah Connor (Demo User)',
    userEmail: 'user@statementimporter.com',
    userRole: 'user',
    category: 'FILE_UPLOAD',
    action: 'STATEMENT_UPLOADED',
    details: 'Uploaded Chase_Sapphire_July2026.pdf (184.2 KB) for Group A.',
    ipAddress: '192.168.1.104',
    timestamp: new Date(Date.now() - 10 * 60 * 60 * 1000).toISOString(),
  },
  {
    id: 'log-4',
    userId: 'user-demo-2',
    userName: 'Sarah Connor (Demo User)',
    userEmail: 'user@statementimporter.com',
    userRole: 'user',
    category: 'SHEET_SYNC',
    action: 'EXPORT_TO_SHEETS',
    details: 'Successfully synced 38 records to Google Sheet X (Sheet1).',
    ipAddress: '192.168.1.104',
    timestamp: new Date(Date.now() - 9 * 60 * 60 * 1000).toISOString(),
  },
];

class AuthService {
  private getUsersFromStorage(): User[] {
    const raw = localStorage.getItem(STORAGE_USERS_KEY);
    if (!raw) {
      localStorage.setItem(STORAGE_USERS_KEY, JSON.stringify(INITIAL_USERS));
      return INITIAL_USERS;
    }
    try {
      return JSON.parse(raw);
    } catch {
      return INITIAL_USERS;
    }
  }

  private saveUsersToStorage(users: User[]): void {
    localStorage.setItem(STORAGE_USERS_KEY, JSON.stringify(users));
  }

  public getLogs(): ActivityLog[] {
    const raw = localStorage.getItem(STORAGE_LOGS_KEY);
    if (!raw) {
      localStorage.setItem(STORAGE_LOGS_KEY, JSON.stringify(INITIAL_LOGS));
      return INITIAL_LOGS;
    }
    try {
      return JSON.parse(raw);
    } catch {
      return INITIAL_LOGS;
    }
  }

  public logActivity(
    action: string,
    details: string,
    category: ActionCategory = 'SYSTEM',
    overrideUser?: User
  ): void {
    const session = this.getCurrentSession();
    const user = overrideUser || session?.user || {
      id: 'system',
      name: 'System Guest',
      email: 'guest@system.local',
      role: 'user' as UserRole,
    };

    const newLog: ActivityLog = {
      id: `log-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
      userId: user.id,
      userName: user.name,
      userEmail: user.email,
      userRole: user.role,
      category,
      action,
      details,
      ipAddress: '127.0.0.1',
      timestamp: new Date().toISOString(),
    };

    const logs = this.getLogs();
    const updated = [newLog, ...logs];
    localStorage.setItem(STORAGE_LOGS_KEY, JSON.stringify(updated));
  }

  public getCurrentSession(): AuthSession | null {
    const raw = localStorage.getItem(STORAGE_SESSION_KEY);
    if (!raw) return null;
    try {
      const session: AuthSession = JSON.parse(raw);
      if (session.expiresAt < Date.now()) {
        this.logout();
        return null;
      }
      return session;
    } catch {
      return null;
    }
  }

  public login(email: string, password: string): { success: boolean; message: string; user?: User } {
    const users = this.getUsersFromStorage();
    const normalizedEmail = email.trim().toLowerCase();
    const user = users.find((u) => u.email.toLowerCase() === normalizedEmail);

    if (!user) {
      return { success: false, message: 'No account found with this email address.' };
    }

    if (user.status === 'blocked') {
      this.logActivity('LOGIN_BLOCKED_ATTEMPT', `Blocked user (${user.email}) attempted login.`, 'AUTH', user);
      return { success: false, message: 'Your account has been deactivated by an Administrator.' };
    }

    const hashedInput = hashPassword(password);
    if (user.passwordHash !== hashedInput) {
      this.logActivity('LOGIN_FAILED', `Invalid password attempt for ${email}.`, 'AUTH', user);
      return { success: false, message: 'Invalid password. Please check your credentials.' };
    }

    // Update last login
    user.lastLogin = new Date().toISOString();
    this.saveUsersToStorage(users);

    // Create session (24h expiry)
    const session: AuthSession = {
      user,
      token: `token_${user.id}_${Date.now()}`,
      expiresAt: Date.now() + 24 * 60 * 60 * 1000,
    };
    localStorage.setItem(STORAGE_SESSION_KEY, JSON.stringify(session));

    this.logActivity('USER_LOGIN', `User ${user.name} logged in successfully.`, 'AUTH', user);

    return { success: true, message: 'Login successful!', user };
  }

  public signup(name: string, email: string, password: string, role: UserRole = 'user'): { success: boolean; message: string; user?: User } {
    const users = this.getUsersFromStorage();
    const normalizedEmail = email.trim().toLowerCase();

    if (!name.trim()) {
      return { success: false, message: 'Full name is required.' };
    }

    if (!normalizedEmail || !normalizedEmail.includes('@')) {
      return { success: false, message: 'Please enter a valid email address.' };
    }

    if (password.length < 6) {
      return { success: false, message: 'Password must be at least 6 characters long.' };
    }

    if (users.some((u) => u.email.toLowerCase() === normalizedEmail)) {
      return { success: false, message: 'An account with this email address already exists.' };
    }

    const avatarColors = ['bg-indigo-600', 'bg-blue-600', 'bg-emerald-600', 'bg-purple-600', 'bg-amber-600', 'bg-rose-600'];
    const randomAvatarColor = avatarColors[Math.floor(Math.random() * avatarColors.length)];

    const newUser: User = {
      id: `user-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      name: name.trim(),
      email: normalizedEmail,
      passwordHash: hashPassword(password),
      role,
      createdAt: new Date().toISOString(),
      lastLogin: new Date().toISOString(),
      status: 'active',
      avatarColor: randomAvatarColor,
    };

    users.push(newUser);
    this.saveUsersToStorage(users);

    // Log in newly registered user automatically
    const session: AuthSession = {
      user: newUser,
      token: `token_${newUser.id}_${Date.now()}`,
      expiresAt: Date.now() + 24 * 60 * 60 * 1000,
    };
    localStorage.setItem(STORAGE_SESSION_KEY, JSON.stringify(session));

    this.logActivity('USER_SIGNUP', `New user registered: ${newUser.name} (${newUser.email}) as ${newUser.role.toUpperCase()}`, 'AUTH', newUser);

    return { success: true, message: 'Account created successfully!', user: newUser };
  }

  public logout(): void {
    const session = this.getCurrentSession();
    if (session) {
      this.logActivity('USER_LOGOUT', `User ${session.user.name} logged out.`, 'AUTH');
    }
    localStorage.removeItem(STORAGE_SESSION_KEY);
  }

  // Admin APIs
  public getUsers(): User[] {
    return this.getUsersFromStorage();
  }

  public removeUser(userId: string): { success: boolean; message: string } {
    const currentSession = this.getCurrentSession();
    if (!currentSession || currentSession.user.role !== 'admin') {
      return { success: false, message: 'Unauthorized action. Only Administrators can remove users.' };
    }

    if (currentSession.user.id === userId) {
      return { success: false, message: 'You cannot remove your own active administrator account.' };
    }

    let users = this.getUsersFromStorage();
    const targetUser = users.find((u) => u.id === userId);

    if (!targetUser) {
      return { success: false, message: 'User not found.' };
    }

    users = users.filter((u) => u.id !== userId);
    this.saveUsersToStorage(users);

    this.logActivity(
      'USER_REMOVED',
      `Admin (${currentSession.user.email}) permanently removed user ${targetUser.name} (${targetUser.email}).`,
      'USER_MANAGEMENT',
      currentSession.user
    );

    return { success: true, message: `User ${targetUser.name} removed successfully.` };
  }

  public addUser(userData: { name: string; email: string; password: string; role: UserRole }): { success: boolean; message: string; user?: User } {
    const currentSession = this.getCurrentSession();
    if (!currentSession || currentSession.user.role !== 'admin') {
      return { success: false, message: 'Unauthorized action. Admin access required.' };
    }

    const res = this.signup(userData.name, userData.email, userData.password, userData.role);
    if (res.success && res.user) {
      // Re-establish original admin session instead of switching to new user
      localStorage.setItem(STORAGE_SESSION_KEY, JSON.stringify(currentSession));
      this.logActivity(
        'USER_CREATED_BY_ADMIN',
        `Admin created new user ${res.user.name} (${res.user.email}) as ${res.user.role.toUpperCase()}`,
        'USER_MANAGEMENT',
        currentSession.user
      );
    }
    return res;
  }

  public updateUserRole(userId: string, newRole: UserRole): { success: boolean; message: string } {
    const currentSession = this.getCurrentSession();
    if (!currentSession || currentSession.user.role !== 'admin') {
      return { success: false, message: 'Unauthorized action. Admin access required.' };
    }

    const users = this.getUsersFromStorage();
    const user = users.find((u) => u.id === userId);
    if (!user) return { success: false, message: 'User not found.' };

    user.role = newRole;
    this.saveUsersToStorage(users);

    this.logActivity(
      'USER_ROLE_UPDATED',
      `Updated ${user.name}'s role to ${newRole.toUpperCase()}`,
      'USER_MANAGEMENT',
      currentSession.user
    );

    return { success: true, message: `Updated role to ${newRole}` };
  }

  public toggleUserStatus(userId: string): { success: boolean; message: string; newStatus?: string } {
    const currentSession = this.getCurrentSession();
    if (!currentSession || currentSession.user.role !== 'admin') {
      return { success: false, message: 'Unauthorized action. Admin access required.' };
    }

    if (currentSession.user.id === userId) {
      return { success: false, message: 'You cannot block your own active administrator account.' };
    }

    const users = this.getUsersFromStorage();
    const user = users.find((u) => u.id === userId);
    if (!user) return { success: false, message: 'User not found.' };

    user.status = user.status === 'active' ? 'blocked' : 'active';
    this.saveUsersToStorage(users);

    this.logActivity(
      'USER_STATUS_CHANGED',
      `Admin set ${user.name}'s account status to ${user.status.toUpperCase()}`,
      'USER_MANAGEMENT',
      currentSession.user
    );

    return { success: true, message: `Account status updated to ${user.status}`, newStatus: user.status };
  }

  public clearLogs(): void {
    const currentSession = this.getCurrentSession();
    if (currentSession?.user.role === 'admin') {
      localStorage.setItem(STORAGE_LOGS_KEY, JSON.stringify([]));
      this.logActivity('AUDIT_LOGS_CLEARED', 'Admin cleared all activity audit trail history.', 'SYSTEM');
    }
  }

  public exportLogsCSV(): void {
    const logs = this.getLogs();
    const headers = ['ID', 'Timestamp', 'User Name', 'User Email', 'Role', 'Category', 'Action', 'Details', 'IP Address'];
    const rows = logs.map((l) => [
      l.id,
      `"${new Date(l.timestamp).toLocaleString()}"`,
      `"${l.userName.replace(/"/g, '""')}"`,
      `"${l.userEmail}"`,
      l.userRole,
      l.category,
      l.action,
      `"${l.details.replace(/"/g, '""')}"`,
      l.ipAddress,
    ]);

    const csvContent = [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', `activity_audit_logs_${Date.now()}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }
}

export const authService = new AuthService();
