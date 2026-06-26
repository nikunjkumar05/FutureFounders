import { createContext, useContext, useEffect, useState, useCallback, useMemo } from 'react';
import {
  onAuthStateChanged,
  signInWithPopup,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut as firebaseSignOut,
  signInWithCredential,
  GoogleAuthProvider,
} from 'firebase/auth';
import { auth, googleProvider } from '../lib/firebase';
import { GoogleSignIn } from '@capawesome/capacitor-google-sign-in';

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
  const [user, setUser] = useState<SimpleUser | null>(null);
  const [loading, setLoading] = useState(true);

  // Initialize native Google Sign-In
  useEffect(() => {
    if (native) {
      const clientId = import.meta.env.VITE_GOOGLE_CLIENT_ID;
      if (clientId) {
        GoogleSignIn.initialize({ clientId }).catch((err) => {
          console.error('Failed to initialize Google Sign-In:', err);
        });
      } else {
        console.warn('VITE_GOOGLE_CLIENT_ID is not configured in .env');
      }
    }
  }, [native]);

  useEffect(() => {
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
  }, []);

  const signInWithGoogle = useCallback(async (): Promise<string | null> => {
    try {
      if (native) {
        const result = await GoogleSignIn.signIn();
        const idToken = result.idToken;
        if (!idToken) throw new Error('No Google ID Token returned');
        const credential = GoogleAuthProvider.credential(idToken);
        await signInWithCredential(auth, credential);
        return null;
      } else {
        await signInWithPopup(auth, googleProvider);
        return null;
      }
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
    if (native) {
      try {
        await GoogleSignIn.signOut();
      } catch (err) {
        console.error('Failed to sign out from Google natively:', err);
      }
    }
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
