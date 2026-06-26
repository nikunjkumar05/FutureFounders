import { createContext, useContext, useEffect, useState, useCallback, useMemo } from 'react';
import {
  onAuthStateChanged,
  signInWithPopup,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut as firebaseSignOut,
} from 'firebase/auth';
import { auth, googleProvider } from '../lib/firebase';

interface SimpleUser {
  uid: string;
  email: string | null;
  displayName: string | null;
}

interface AuthContextType {
  user: SimpleUser | null;
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
  const native = isNativePlatform();
  const [user, setUser] = useState<SimpleUser | null>(
    native ? { uid: 'native-user', email: 'admin@aquatrak.app', displayName: 'Admin' } : null
  );
  const [loading, setLoading] = useState(!native);

  useEffect(() => {
    if (native) return;

    const unsubscribe = onAuthStateChanged(auth, (firebaseUser) => {
      if (firebaseUser) {
        setUser({
          uid: firebaseUser.uid,
          email: firebaseUser.email,
          displayName: firebaseUser.displayName,
        });
      } else {
        setUser(null);
      }
      setLoading(false);
    });
    return unsubscribe;
  }, [native]);

  const signInWithGoogle = useCallback(async (): Promise<string | null> => {
    if (native) return null;
    try {
      await signInWithPopup(auth, googleProvider);
      return null;
    } catch (err: unknown) {
      if (err instanceof Error) {
        const code = (err as { code?: string }).code;
        if (code === 'auth/popup-closed-by-user') return null;
        return err.message;
      }
      return 'Failed to sign in';
    }
  }, [native]);

  const signInWithEmail = useCallback(async (email: string, password: string): Promise<string | null> => {
    if (native) return null;
    try {
      await signInWithEmailAndPassword(auth, email, password);
      return null;
    } catch (err: unknown) {
      if (err instanceof Error) return err.message;
      return 'Failed to sign in';
    }
  }, [native]);

  const signUpWithEmail = useCallback(async (email: string, password: string): Promise<string | null> => {
    if (native) return null;
    try {
      await createUserWithEmailAndPassword(auth, email, password);
      return null;
    } catch (err: unknown) {
      if (err instanceof Error) return err.message;
      return 'Failed to sign up';
    }
  }, [native]);

  const signOut = useCallback(async () => {
    if (native) return;
    await firebaseSignOut(auth);
  }, [native]);

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
