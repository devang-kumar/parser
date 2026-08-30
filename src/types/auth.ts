export type UserRole = 'admin' | 'user';
export type UserStatus = 'active' | 'blocked';

export interface User {
  id: string;
  name: string;
  email: string;
  passwordHash: string; // Simulated secure hashed password
  role: UserRole;
  createdAt: string;
  lastLogin: string;
  status: UserStatus;
  avatarColor?: string;
}

export type ActionCategory = 
  | 'AUTH' 
  | 'FILE_UPLOAD' 
  | 'PARSE_DATA' 
  | 'SHEET_SYNC' 
  | 'USER_MANAGEMENT' 
  | 'SYSTEM';

export interface ActivityLog {
  id: string;
  userId: string;
  userName: string;
  userEmail: string;
  userRole: UserRole;
  category: ActionCategory;
  action: string;
  details: string;
  ipAddress: string;
  timestamp: string;
}

export interface AuthSession {
  user: User;
  token: string;
  expiresAt: number;
}
