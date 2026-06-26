import { createContext, useContext, useEffect, useState, useCallback, useMemo } from 'react';
import {
  onAuthStateChanged,
  signInWithPopup,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut as firebaseSignOut,
  User,
} from 'firebase/auth';
import { auth, googleProvider } from '../lib/firebase';
import posthog from 'posthog-js';

interface AuthContextType {
  user: User | null;
  loading: boolean;
  signInWithGoogle: () => Promise<string | null>;
  signInWithEmail: (email: string, password: string) => Promise<string | null>;
  signUpWithEmail: (email: string, password: string) => Promise<string | null>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | null>(null);

function isNativePlatform(): boolean {
  try {
    // @ts-ignore
    return window?.Capacitor?.isNativePlatform?.() ?? false;
  } catch {
    return false;
  }
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (firebaseUser) => {
      setUser(firebaseUser);
      setLoading(false);
      if (firebaseUser) {
        try {
          posthog.identify(firebaseUser.uid, {
            email: firebaseUser.email,
            name: firebaseUser.displayName,
          });
        } catch { /* ignore */ }
      }
    });
    return unsubscribe;
  }, []);

  const signInWithGoogle = useCallback(async (): Promise<string | null> => {
    if (isNativePlatform()) {
      return 'Google sign-in is not available in the mobile app. Please use email/password login.';
    }
    try {
      await signInWithPopup(auth, googleProvider);
      return null;
    } catch (err: unknown) {
      if (err instanceof Error) {
        const code = (err as { code?: string }).code;
        if (code === 'auth/popup-closed-by-user') return null;
        if (code === 'auth/cancelled-popup-request') return null;
        return err.message;
      }
      return 'Failed to sign in';
    }
  }, []);

  const signInWithEmail = useCallback(async (email: string, password: string): Promise<string | null> => {
    try {
      await signInWithEmailAndPassword(auth, email, password);
      return null;
    } catch (err: unknown) {
      if (err instanceof Error) return err.message;
      return 'Failed to sign in';
    }
  }, []);

  const signUpWithEmail = useCallback(async (email: string, password: string): Promise<string | null> => {
    try {
      await createUserWithEmailAndPassword(auth, email, password);
      return null;
    } catch (err: unknown) {
      if (err instanceof Error) return err.message;
      return 'Failed to sign up';
    }
  }, []);

  const signOut = useCallback(async () => {
    await firebaseSignOut(auth);
  }, []);

  const value = useMemo(() => ({
    user,
    loading,
    signInWithGoogle,
    signInWithEmail,
    signUpWithEmail,
    signOut,
  }), [user, loading, signInWithGoogle, signInWithEmail, signUpWithEmail, signOut]);

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
