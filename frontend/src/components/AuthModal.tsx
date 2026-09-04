import React, { useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { X, Mail, Lock, User, MapPin, ChevronDown } from 'lucide-react';

interface AuthModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: () => void;
}

export const AuthModal: React.FC<AuthModalProps> = ({ isOpen, onClose, onSuccess }) => {
  const [isSignup, setIsSignup] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [city, setCity] = useState('');
  const [state, setState] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const { login, signup } = useAuth();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      if (isSignup) {
        await signup(email, password, displayName, 'citizen', city, state);
      } else {
        await login(email, password);
      }
      setEmail('');
      setPassword('');
      setDisplayName('');
      setCity('');
      setState('');
      onSuccess?.();
      onClose();
    } catch (err: any) {
      setError(err.message || 'Authentication failed');
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-slate-900 rounded-lg shadow-xl max-w-md w-full mx-4 border border-cyan-500/30">
        <div className="flex justify-between items-center p-6 border-b border-cyan-500/20">
          <h2 className="text-xl font-bold text-cyan-400">
            {isSignup ? 'Create Account' : 'Login'}
          </h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-white transition"
          >
            <X size={24} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {error && (
            <div className="bg-red-500/20 border border-red-500 text-red-300 px-4 py-2 rounded">
              {error}
            </div>
          )}

          {isSignup && (
            <>
              <div>
                <label className="block text-sm text-gray-300 mb-1">Display Name</label>
                <input
                  type="text"
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  className="w-full bg-slate-800 border border-cyan-500/30 rounded px-3 py-2 text-white focus:outline-none focus:border-cyan-400"
                  placeholder="Your name"
                  required={isSignup}
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm text-gray-300 mb-1">City</label>
                  <input
                    type="text"
                    value={city}
                    onChange={(e) => setCity(e.target.value)}
                    className="w-full bg-slate-800 border border-cyan-500/30 rounded px-3 py-2 text-white focus:outline-none focus:border-cyan-400"
                    placeholder="e.g., Mumbai"
                  />
                </div>
                <div>
                  <label className="block text-sm text-gray-300 mb-1">State</label>
                  <input
                    type="text"
                    value={state}
                    onChange={(e) => setState(e.target.value)}
                    className="w-full bg-slate-800 border border-cyan-500/30 rounded px-3 py-2 text-white focus:outline-none focus:border-cyan-400"
                    placeholder="e.g., Maharashtra"
                  />
                </div>
              </div>
            </>
          )}

          <div>
            <label className="block text-sm text-gray-300 mb-1">Email</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full bg-slate-800 border border-cyan-500/30 rounded px-3 py-2 text-white focus:outline-none focus:border-cyan-400"
              placeholder="your@email.com"
              required
            />
          </div>

          <div>
            <label className="block text-sm text-gray-300 mb-1">Password</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full bg-slate-800 border border-cyan-500/30 rounded px-3 py-2 text-white focus:outline-none focus:border-cyan-400"
              placeholder="••••••••"
              required
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-cyan-600 hover:bg-cyan-700 text-white font-semibold py-2 rounded transition disabled:opacity-50"
          >
            {loading ? 'Processing...' : isSignup ? 'Create Account' : 'Login'}
          </button>

          <button
            type="button"
            onClick={() => {
              setIsSignup(!isSignup);
              setError('');
            }}
            className="w-full text-cyan-400 hover:text-cyan-300 text-sm transition"
          >
            {isSignup ? 'Already have an account? Login' : "Don't have an account? Sign up"}
          </button>
        </form>
      </div>
    </div>
  );
};

export const AuthButton: React.FC<{ onClick: () => void }> = ({ onClick }) => {
  const { user, userProfile, logout } = useAuth();

  if (!user) {
    return (
      <button
        onClick={onClick}
        className="flex items-center gap-2 px-4 py-2 bg-cyan-600 hover:bg-cyan-700 text-white rounded transition"
      >
        <Lock size={18} />
        Login
      </button>
    );
  }

  return (
    <div className="flex items-center gap-4">
      <div className="text-sm">
        <p className="text-white font-semibold">{userProfile?.displayName}</p>
        <p className="text-gray-400 capitalize text-xs">{userProfile?.role}</p>
      </div>
      <button
        onClick={logout}
        className="px-3 py-1 bg-red-600/20 hover:bg-red-600/40 text-red-300 hover:text-red-200 text-sm rounded transition"
      >
        Logout
      </button>
    </div>
  );
};
