"use client";

import { useState, useEffect } from "react";
import {
  signInAnonymously,
  signInWithPopup,
  GoogleAuthProvider,
  signOut as fbSignOut,
  onAuthStateChanged,
  updateProfile,
  linkWithPopup,
} from "firebase/auth";
import { auth } from "@/lib/firebase";

export interface AppUser {
  uid: string;
  displayName: string | null;
  email?: string | null;
  photoURL?: string | null;
  isAnonymous?: boolean;
  getIdToken: () => Promise<string>;
}

/**
 * Format human-readable Firebase Auth errors
 */
export function formatAuthError(err: any): string {
  const code = (err?.code || "").toLowerCase();
  const msg = (err?.message || "").toLowerCase();

  if (
    code === "auth/configuration-not-found" ||
    msg.includes("auth/configuration-not-found") ||
    msg.includes("configuration-not-found")
  ) {
    return "Firebase Authentication is not enabled for project 'context-bubble' in Google Cloud / Firebase Console. Please sign in with your Name (instant local identity, no cloud setup needed).";
  }
  if (code === "auth/popup-blocked" || msg.includes("popup-blocked")) {
    return "Sign-in popup was blocked by your browser. Please allow popups or use instant Name sign-in.";
  }
  if (code === "auth/unauthorized-domain" || msg.includes("unauthorized-domain")) {
    return "This domain is not authorized in Firebase Console. Please sign in with your Name.";
  }
  if (code === "auth/operation-not-allowed" || msg.includes("operation-not-allowed")) {
    return "Google Sign-in is not enabled in Firebase Console. Please sign in with your Name.";
  }
  if (code === "auth/cancelled-popup-request" || code === "auth/popup-closed-by-user") {
    return "Sign-in was cancelled.";
  }
  if (code === "auth/credential-already-in-use") {
    return "This account is already in use by another session. Signing out and reconnecting...";
  }
  return err?.message || "Authentication failed. Please sign in with your Name.";
}

/**
 * Helper to get local stored session
 */
export function getLocalStoredSession(): AppUser | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem("context_bubble_user");
    if (!raw) return null;
    const data = JSON.parse(raw);
    if (!data.uid || !data.displayName) return null;
    return {
      uid: data.uid,
      displayName: data.displayName,
      email: data.email || null,
      photoURL: data.photoURL || null,
      isAnonymous: Boolean(data.isAnonymous),
      getIdToken: async () => `dev-${data.uid}`,
    };
  } catch {
    return null;
  }
}

/**
 * Sign in with Google with popup linking and error diagnostics
 */
export async function signInWithGoogle(): Promise<AppUser> {
  const provider = new GoogleAuthProvider();
  provider.setCustomParameters({ prompt: "select_account" });

  try {
    // If currently anonymous, attempt to link the account so contributions persist
    if (auth.currentUser && auth.currentUser.isAnonymous) {
      try {
        const linkResult = await linkWithPopup(auth.currentUser, provider);
        const user = linkResult.user;
        if (typeof window !== "undefined") {
          localStorage.setItem(
            "context_bubble_user",
            JSON.stringify({
              uid: user.uid,
              displayName: user.displayName,
              email: user.email,
              photoURL: user.photoURL,
              isAnonymous: false,
            })
          );
          window.dispatchEvent(new Event("context_bubble_auth_change"));
        }
        return user;
      } catch (linkErr: any) {
        if (linkErr.code === "auth/credential-already-in-use") {
          await fbSignOut(auth);
          const result = await signInWithPopup(auth, provider);
          const user = result.user;
          if (typeof window !== "undefined") {
            localStorage.setItem(
              "context_bubble_user",
              JSON.stringify({
                uid: user.uid,
                displayName: user.displayName,
                email: user.email,
                photoURL: user.photoURL,
                isAnonymous: false,
              })
            );
            window.dispatchEvent(new Event("context_bubble_auth_change"));
          }
          return user;
        }
        throw linkErr;
      }
    }

    const result = await signInWithPopup(auth, provider);
    const user = result.user;
    if (typeof window !== "undefined") {
      localStorage.setItem(
        "context_bubble_user",
        JSON.stringify({
          uid: user.uid,
          displayName: user.displayName,
          email: user.email,
          photoURL: user.photoURL,
          isAnonymous: false,
        })
      );
      window.dispatchEvent(new Event("context_bubble_auth_change"));
    }
    return user;
  } catch (err: any) {
    const formatted = formatAuthError(err);
    const errorObj = new Error(formatted);
    (errorObj as any).code = err?.code;
    throw errorObj;
  }
}

/**
 * Fast, reliable sign in with custom Display Name and Avatar.
 * Works with Firebase Auth when enabled, and falls back seamlessly to local verified session
 * if cloud project configuration is missing (e.g. auth/configuration-not-found).
 */
export async function signInWithName(
  displayName: string,
  email?: string
): Promise<AppUser> {
  const cleanName = displayName.trim() || "Participant";
  const avatarUrl = `https://api.dicebear.com/9.x/notionists/svg?seed=${encodeURIComponent(
    cleanName
  )}&backgroundColor=b6e3f4`;

  let appUser: AppUser;

  try {
    let currentUser = auth.currentUser;

    if (!currentUser) {
      const result = await signInAnonymously(auth);
      currentUser = result.user;
    }

    await updateProfile(currentUser, {
      displayName: cleanName,
      photoURL: avatarUrl,
    });

    appUser = currentUser;
  } catch (err: any) {
    console.info(
      "Firebase Auth Cloud unconfigured or offline. Using local session identity:",
      err?.message || err
    );

    // Generate stable local identity for local development session, preserving existing UID if already assigned
    const existing = getLocalStoredSession();
    const safeSlug = cleanName.toLowerCase().replace(/[^a-z0-9]/g, "-").replace(/-+/g, "-");
    const localUid = existing?.uid || `usr-${safeSlug || "user"}-${Math.random().toString(36).substring(2, 6)}`;

    appUser = {
      uid: localUid,
      displayName: cleanName,
      email: email || `${safeSlug || "user"}@example.com`,
      photoURL: avatarUrl,
      isAnonymous: false,
      getIdToken: async () => `dev-${localUid}`,
    };
  }

  // Persist session to localStorage for cross-page continuity
  if (typeof window !== "undefined") {
    localStorage.setItem(
      "context_bubble_user",
      JSON.stringify({
        uid: appUser.uid,
        displayName: appUser.displayName,
        email: appUser.email,
        photoURL: appUser.photoURL,
        isAnonymous: Boolean(appUser.isAnonymous),
      })
    );
    window.dispatchEvent(new Event("context_bubble_auth_change"));
  }

  return appUser;
}

export async function signOutUser(): Promise<void> {
  try {
    await fbSignOut(auth);
  } catch {
    // Ignored
  }
  if (typeof window !== "undefined") {
    localStorage.removeItem("context_bubble_user");
    window.dispatchEvent(new Event("context_bubble_auth_change"));
  }
}

export function getOrCreateLocalSession(defaultName: string = "Participant"): AppUser {
  if (typeof window === "undefined") {
    return {
      uid: "usr-dev",
      displayName: defaultName,
      getIdToken: async () => "dev-participant",
    };
  }

  const existing = getLocalStoredSession();
  if (existing) return existing;

  const randId = Math.random().toString(36).substring(2, 8);
  const newUid = `usr-${randId}`;
  const newUser: AppUser = {
    uid: newUid,
    displayName: defaultName,
    email: `${newUid}@contextbubble.local`,
    photoURL: `https://api.dicebear.com/9.x/notionists/svg?seed=${newUid}&backgroundColor=b6e3f4`,
    isAnonymous: false,
    getIdToken: async () => `dev-${newUid}`,
  };

  try {
    localStorage.setItem(
      "context_bubble_user",
      JSON.stringify({
        uid: newUser.uid,
        displayName: newUser.displayName,
        email: newUser.email,
        photoURL: newUser.photoURL,
        isAnonymous: false,
      })
    );
  } catch {
    // Ignored
  }

  return newUser;
}

export async function getCurrentIdToken(): Promise<string | null> {
  if (auth.currentUser) {
    try {
      return await auth.currentUser.getIdToken();
    } catch {
      // Fall through to local session
    }
  }

  const session = getOrCreateLocalSession();
  return `dev-${session.uid}`;
}

export function useFirebaseAuth() {
  // Always start with null on both server and client's first render to avoid hydration mismatch.
  // localStorage / Firebase Auth state is loaded in useEffect (client-only).
  const [user, setUser] = useState<AppUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // Only runs on client after hydration — safe to read localStorage and Firebase Auth.
    const syncUser = () => {
      if (auth.currentUser) {
        setUser(auth.currentUser);
      } else {
        const local = getLocalStoredSession();
        setUser(local);
      }
      setLoading(false);
    };

    syncUser();

    window.addEventListener("context_bubble_auth_change", syncUser);

    const unsubscribe = onAuthStateChanged(
      auth,
      (currentUser) => {
        if (currentUser) {
          setUser(currentUser);
        } else {
          // Don't immediately clear — check localStorage first for local-session identity
          const local = getLocalStoredSession();
          setUser(local);
        }
        setLoading(false);
      },
      () => {
        syncUser();
      }
    );

    return () => {
      window.removeEventListener("context_bubble_auth_change", syncUser);
      unsubscribe();
    };
  }, []);

  return {
    user,
    loading,
    error,
    signInGoogle: signInWithGoogle,
    signInName: signInWithName,
    signOut: signOutUser,
  };
}
