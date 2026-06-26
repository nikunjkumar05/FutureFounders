import { useNavigate } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';

type Mode = 'signin' | 'signup';

function isNativePlatform(): boolean {
  try {
    // @ts-ignore
    return window?.Capacitor?.isNativePlatform?.() ?? false;
  } catch {
    return false;
  }
}

export default function Login() {
  const { user, loading, signInWithGoogle, signInWithEmail, signUpWithEmail } = useAuth();
  const [mode, setMode] = useState<Mode>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const navigate = useNavigate();
  const isNative = isNativePlatform();

  useEffect(() => {
    if (!loading && user) navigate('/', { replace: true });
  }, [user, loading, navigate]);

  if (loading) {
    return (
      <div className="min-h-screen bg-surface-50 dark:bg-surface-900 flex items-center justify-center">
        <div className="animate-spin w-6 h-6 border-2 border-navy-500 border-t-transparent rounded-full" />
      </div>
    );
  }

  if (user) return null;

  const handleGoogleSignIn = async () => {
    setError('');
    setSubmitting(true);
    const err = await signInWithGoogle();
    setSubmitting(false);
    if (err) setError(err);
  };

  const handleEmailSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (!email || !password) {
      setError('Email and password are required');
      return;
    }
    if (password.length < 6) {
      setError('Password must be at least 6 characters');
      return;
    }
    setSubmitting(true);
    const fn = mode === 'signin' ? signInWithEmail : signUpWithEmail;
    const err = await fn(email, password);
    setSubmitting(false);
    if (err) setError(err);
  };

  const toggleMode = () => {
    setMode(mode === 'signin' ? 'signup' : 'signin');
    setError('');
  };

  return (
    <div className="min-h-screen bg-surface-50 dark:bg-surface-900 flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        {/* Header */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 mb-4">
            <img src="/logo.png" alt="Logo" className="w-16 h-16 rounded-2xl object-contain" loading="lazy" />
          </div>
          <h1 className="text-display-md font-display text-navy-900 dark:text-surface-100">
            Operation Waterflow
          </h1>
          <p className="text-body-sm text-surface-500 dark:text-surface-400 mt-1">
            {mode === 'signin' ? 'Sign in to your account' : 'Create a new account'}
          </p>
        </div>

        {/* Card */}
        <div className="card-base p-6">
          {error && (
            <div className="bg-red-50 dark:bg-red-950/50 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-300 text-xs rounded-xl px-3 py-2 mb-4">{error}</div>
          )}

          <form onSubmit={handleEmailSubmit} className="space-y-3 mb-4">
            <input
              type="email"
              placeholder="Email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="input-base"
              required
            />
            <input
              type="password"
              placeholder="Password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="input-base"
              required
            />
            <button
              type="submit"
              disabled={submitting}
              className="btn-primary w-full"
            >
              {submitting ? 'Please wait...' : mode === 'signin' ? 'Sign in' : 'Sign up'}
            </button>
          </form>

          {!isNative && (
            <>
              <div className="relative mb-4">
                <div className="absolute inset-0 flex items-center">
                  <div className="w-full border-t border-surface-200 dark:border-surface-600" />
                </div>
                <div className="relative flex justify-center text-xs text-surface-400">
                  <span className="bg-white dark:bg-surface-800 px-2">or</span>
                </div>
              </div>

              <button
                onClick={handleGoogleSignIn}
                disabled={submitting}
                className="btn-secondary w-full"
              >
                <svg width="18" height="18" viewBox="0 0 48 48">
                  <path fill="#FFC107" d="M43.611 20.083H42V20H24v8h11.303c-1.649 4.657-6.08 8-11.303 8-6.627 0-12-5.373-12-12s5.373-12 12-12c3.059 0 5.842 1.154 7.961 3.039l5.657-5.657C34.046 6.053 29.268 4 24 4 12.955 4 4 12.955 4 24s8.955 20 20 20 20-8.955 20-20c0-1.341-.138-2.65-.389-3.917z" />
                  <path fill="#FF3D00" d="m6.306 14.691 6.571 4.819C14.655 15.108 18.961 12 24 12c3.059 0 5.842 1.154 7.961 3.039l5.657-5.657C34.046 6.053 29.268 4 24 4 16.318 4 9.656 8.337 6.306 14.691z" />
                  <path fill="#4CAF50" d="M24 44c5.166 0 9.86-1.977 13.409-5.192l-6.19-5.238A11.91 11.91 0 0 1 24 36c-5.202 0-9.619-3.317-11.283-7.946l-6.522 5.025C9.505 39.556 16.227 44 24 44z" />
                  <path fill="#1976D2" d="M43.611 20.083H42V20H24v8h11.303a12.04 12.04 0 0 1-4.087 5.571l.003-.002 6.19 5.238C36.971 39.205 44 34 44 24c0-1.341-.138-2.65-.389-3.917z" />
                </svg>
                {submitting ? 'Please wait...' : 'Sign in with Google'}
              </button>
            </>
          )}
        </div>

        {/* Footer */}
        <p className="text-body-xs text-surface-500 dark:text-surface-400 text-center mt-4">
          {mode === 'signin' ? (
            <>
              Don't have an account?{' '}
              <button onClick={toggleMode} className="text-navy-600 dark:text-cyan-400 hover:underline font-display font-medium">
                Sign up
              </button>
            </>
          ) : (
            <>
              Already have an account?{' '}
              <button onClick={toggleMode} className="text-navy-600 dark:text-cyan-400 hover:underline font-display font-medium">
                Sign in
              </button>
            </>
          )}
        </p>
      </div>
    </div>
  );
}
