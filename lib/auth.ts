"use client";

import { useState, useEffect } from "react";
import {
  signInAnonymously,
  signInWithPopup,
  GoogleAuthProvider,
  signOut as fbSignOut,
  onAuthStateChanged,
  User,
} from "firebase/auth";
import { auth } from "@/lib/firebase";

export async function signInAnonymousUser(): Promise<User> {
  const result = await signInAnonymously(auth);
  return result.user;
}

export async function signInWithGoogle(): Promise<User> {
  const provider = new GoogleAuthProvider();
  const result = await signInWithPopup(auth, provider);
  return result.user;
}

export async function signOutUser(): Promise<void> {
  await fbSignOut(auth);
}

export async function getCurrentIdToken(): Promise<string | null> {
  if (!auth.currentUser) return null;
  return auth.currentUser.getIdToken();
}

export function useFirebaseAuth() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // Listen to Firebase auth state changes
    const unsubscribe = onAuthStateChanged(
      auth,
      async (currentUser) => {
        if (currentUser) {
          setUser(currentUser);
          setLoading(false);
        } else {
          // Auto-sign-in anonymously for frictionless, zero-friction ephemeral bubble collaboration
          try {
            const anonUser = await signInAnonymousUser();
            setUser(anonUser);
          } catch (err: unknown) {
            console.warn("Anonymous auto-sign-in notice:", err);
            setUser(null);
            setError(err instanceof Error ? err.message : "Auth error");
          } finally {
            setLoading(false);
          }
        }
      },
      (err) => {
        console.error("Firebase auth state error:", err);
        setError(err.message);
        setLoading(false);
      }
    );

    return () => unsubscribe();
  }, []);

  return {
    user,
    loading,
    error,
    signInAnonymous: signInAnonymousUser,
    signInGoogle: signInWithGoogle,
    signOut: signOutUser,
  };
}
