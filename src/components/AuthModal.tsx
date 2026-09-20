import React, { useState } from 'react';
import { 
  FileSpreadsheet, 
  Lock, 
  Mail, 
  User as UserIcon, 
  Eye, 
  EyeOff, 
  ArrowRight, 
  AlertCircle,
  UserPlus,
  LogIn,
  X
} from 'lucide-react';
import { authService } from '../services/authService';
import { requestGoogleAccessToken, getGoogleUserProfile } from '../utils/googleAuth';
import type { User } from '../types';

interface AuthModalProps {
  onSuccess: (user: User) => void;
  onClose: () => void;
}

export const AuthModal: React.FC<AuthModalProps> = ({ onSuccess, onClose }) => {
  const [mode, setMode] = useState<'login' | 'signup'>('login');
  
  // Form fields
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  
  // UI states
  const [showPassword, setShowPassword] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);

  const handleGoogleAuth = async () => {
    setErrorMessage('');
    setGoogleLoading(true);
    try {
      const googleToken = await requestGoogleAccessToken();
      const profile = await getGoogleUserProfile(googleToken);
      const res = await authService.googleAuth(googleToken, profile);
      if (res.success && res.user) {
        localStorage.setItem('google_oauth_connected', 'true');
        onSuccess(res.user);
      } else {
        setErrorMessage(res.message || 'Failed to authenticate with Google.');
      }
    } catch (err: any) {
      setErrorMessage(err.message || 'Google sign-in was cancelled or failed.');
    } finally {
      setGoogleLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage('');

    if (mode === 'login') {
      if (!email.trim() || !password) {
        setErrorMessage('Please fill in both email and password.');
        return;
      }

      setLoading(true);
      const res = await authService.login(email, password);
      setLoading(false);
      if (res.success && res.user) {
          onSuccess(res.user);
      } else {
        setErrorMessage(res.message || 'Failed to sign in. Please check your credentials.');
      }

    } else {
      // Signup Mode Validation
      if (!name.trim()) {
        setErrorMessage('Full name is required.');
        return;
      }

      if (!email.trim() || !email.includes('@')) {
        setErrorMessage('Please enter a valid email address.');
        return;
      }

      if (password.length < 6) {
        setErrorMessage('Password must be at least 6 characters long.');
        return;
      }

      if (password !== confirmPassword) {
        setErrorMessage('Passwords do not match.');
        return;
      }

      setLoading(true);
      const res = await authService.signup(name, email, password, 'user');
      setLoading(false);
      if (res.success && res.user) {
        onSuccess(res.user);
      } else {
        setErrorMessage(res.message || 'Failed to register account.');
      }
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-md">
      <div className="w-full max-w-md bg-white rounded-3xl shadow-2xl overflow-hidden border border-slate-200 relative animate-in fade-in zoom-in-95 duration-200">
        
        {/* Close Button */}
        <button 
          onClick={onClose}
          className="absolute top-5 right-5 p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-full transition-all cursor-pointer"
        >
          <X className="h-5 w-5" />
        </button>

        <div className="p-8">
          {/* Header Icon */}
          <div className="flex justify-center mb-6">
            <div className="h-12 w-12 rounded-2xl bg-gradient-to-tr from-blue-500 to-indigo-500 p-0.5 shadow-lg shadow-blue-500/30">
              <div className="h-full w-full bg-slate-900 rounded-[14px] flex items-center justify-center">
                <FileSpreadsheet className="h-7 w-7 text-blue-400" />
              </div>
            </div>
          </div>

          <div className="flex items-center justify-center mb-6 border-b border-slate-100 pb-2">
            <div className="flex bg-slate-100 p-1 rounded-2xl border border-slate-200 text-xs font-semibold">
              <button
                type="button"
                onClick={() => { setMode('login'); setErrorMessage(''); }}
                className={`flex items-center gap-2 px-5 py-2.5 rounded-xl transition-all cursor-pointer ${
                  mode === 'login' 
                    ? 'bg-white text-slate-900 shadow-sm font-bold' 
                    : 'text-slate-500 hover:text-slate-900'
                }`}
              >
                <LogIn className="h-4 w-4 text-blue-600" />
                <span>Log In</span>
              </button>
              <button
                type="button"
                onClick={() => { setMode('signup'); setErrorMessage(''); }}
                className={`flex items-center gap-2 px-5 py-2.5 rounded-xl transition-all cursor-pointer ${
                  mode === 'signup' 
                    ? 'bg-white text-slate-900 shadow-sm font-bold' 
                    : 'text-slate-500 hover:text-slate-900'
                }`}
              >
                <UserPlus className="h-4 w-4 text-emerald-600" />
                <span>Sign Up</span>
              </button>
            </div>
          </div>

          <div className="mb-6 text-center space-y-1">
            <h2 className="text-xl font-bold text-slate-900 tracking-tight">
              {mode === 'login' ? 'Welcome Back' : 'Create an Account'}
            </h2>
            <p className="text-xs text-slate-500">
              {mode === 'login' 
                ? 'Please enter your credentials or continue with Google.' 
                : 'Join us to start managing your statements with Google.'}
            </p>
          </div>

          {/* 1-Click Google Login / Signup Button */}
          <button
            type="button"
            onClick={handleGoogleAuth}
            disabled={googleLoading || loading}
            className="w-full mb-4 py-2.5 px-4 bg-white hover:bg-slate-50 text-slate-700 font-semibold rounded-xl text-xs border border-slate-200 shadow-2xs transition-all flex items-center justify-center gap-3 cursor-pointer disabled:opacity-50"
          >
            {googleLoading ? (
              <div className="h-4 w-4 border-2 border-slate-400 border-t-blue-600 rounded-full animate-spin"></div>
            ) : (
              <>
                <svg className="w-4 h-4" viewBox="0 0 24 24">
                  <path
                    fill="#4285F4"
                    d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                  />
                  <path
                    fill="#34A853"
                    d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                  />
                  <path
                    fill="#FBBC05"
                    d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
                  />
                  <path
                    fill="#EA4335"
                    d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
                  />
                </svg>
                <span>{mode === 'login' ? 'Sign in with Google' : 'Sign up with Google'}</span>
              </>
            )}
          </button>

          <div className="relative flex py-2 items-center mb-4">
            <div className="flex-grow border-t border-slate-200"></div>
            <span className="flex-shrink mx-3 text-[11px] font-medium text-slate-400 uppercase tracking-wider">or with email</span>
            <div className="flex-grow border-t border-slate-200"></div>
          </div>

          {errorMessage && (
            <div className="mb-5 p-3 bg-rose-50 border border-rose-200 rounded-xl flex items-start gap-2 text-xs text-rose-700">
              <AlertCircle className="h-4 w-4 text-rose-600 shrink-0 mt-0.5" />
              <span className="font-medium">{errorMessage}</span>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            
            {mode === 'signup' && (
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1.5">Full Name</label>
                <div className="relative">
                  <UserIcon className="absolute left-3.5 top-3 h-4 w-4 text-slate-400" />
                  <input
                    type="text"
                    required
                    placeholder="e.g. Alex Morgan"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    className="w-full pl-10 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-600"
                  />
                </div>
              </div>
            )}

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1.5">Email Address</label>
              <div className="relative">
                <Mail className="absolute left-3.5 top-3 h-4 w-4 text-slate-400" />
                <input
                  type="email"
                  required
                  placeholder="name@company.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full pl-10 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-600"
                />
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="block text-xs font-semibold text-slate-700">Password</label>
              </div>
              <div className="relative">
                <Lock className="absolute left-3.5 top-3 h-4 w-4 text-slate-400" />
                <input
                  type={showPassword ? 'text' : 'password'}
                  required
                  placeholder="••••••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full pl-10 pr-10 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-600"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3.5 top-3 text-slate-400 hover:text-slate-600 cursor-pointer"
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>

            {mode === 'signup' && (
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1.5">Confirm Password</label>
                <div className="relative">
                  <Lock className="absolute left-3.5 top-3 h-4 w-4 text-slate-400" />
                  <input
                    type={showPassword ? 'text' : 'password'}
                    required
                    placeholder="••••••••••••"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    className="w-full pl-10 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-600"
                  />
                </div>
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full mt-4 py-3 px-4 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl text-xs shadow-md transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-70"
            >
              {loading ? (
                <div className="h-4 w-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
              ) : (
                <>
                  <span>{mode === 'login' ? 'Sign In' : 'Create Account'}</span>
                  <ArrowRight className="h-4 w-4" />
                </>
              )}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
};
