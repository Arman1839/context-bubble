"use client";

import React, { useState, useCallback, useEffect } from "react";
import type { Bubble, Role, Contribution } from "@/types";
import { Header } from "@/components/layout/Header";
import { ContributionFeed } from "@/components/participant/ContributionFeed";
import { LiveIntelligencePanel } from "@/components/intelligence/LiveIntelligencePanel";
import { ManageBubblePanel } from "@/components/host/ManageBubblePanel";
import { useFirebaseAuth } from "@/lib/auth";
import { subscribeToBubbleMessages, sendMessageToFirestore } from "@/lib/messages";

interface Props {
  initialBubble: Bubble;
  initialRole?: Role;
  initialUserName?: string;
}

export function BubblePage({ initialBubble, initialRole, initialUserName }: Props) {
  const [role, setRole] = useState<Role>(initialRole || "participant");
  const [prevRole, setPrevRole] = useState(initialRole);
  if (initialRole && initialRole !== prevRole) {
    setPrevRole(initialRole);
    setRole(initialRole);
  }

  // Firebase Auth state
  const { user, signInGoogle, signOut } = useFirebaseAuth();

  // Initialize demo bubble state
  const [bubble, setBubble] = useState<Bubble>(() => {
    const now = Date.now();
    return {
      ...initialBubble,
      expiresAt: new Date(now + 2 * 60 * 60 * 1000), // Exactly 2 hours after initialization
      contributions: initialBubble.contributions.map((c) => {
        const demoOffsets: Record<string, number> = {
          c1: 1 * 60 * 1000,
          c2: 3 * 60 * 1000,
          c3: 5 * 60 * 1000,
          c4: 7 * 60 * 1000,
          c5: 9 * 60 * 1000,
        };
        const offset = demoOffsets[c.id];
        return offset !== undefined
          ? { ...c, timestamp: new Date(now - offset) }
          : c;
      }),
    };
  });
  const [isManageOpen, setIsManageOpen] = useState(false);
  const [newCount, setNewCount] = useState(12);

  // Subscribe to real-time messages in Firestore
  useEffect(() => {
    if (!bubble.id) return;
    const unsubscribe = subscribeToBubbleMessages(
      bubble.id,
      (firestoreMsgs) => {
        if (firestoreMsgs && firestoreMsgs.length > 0) {
          setBubble((prev) => ({
            ...prev,
            contributions: firestoreMsgs,
          }));
        }
      },
      (err) => {
        console.debug("Firestore live messages sync status:", err);
      }
    );

    return () => unsubscribe();
  }, [bubble.id]);

  // Submit a new contribution to Firestore & optimistic local UI
  const handleNewContribution = useCallback((text: string) => {
    const authorDisplayName = bubble.anonymousModeEnabled
      ? "Anonymous"
      : (user?.displayName || initialUserName || "You");

    const authorUid = user?.uid || `anon-${Date.now()}`;
    const authorAvatar = bubble.anonymousModeEnabled
      ? undefined
      : (user?.photoURL || `https://api.dicebear.com/9.x/notionists/svg?seed=${encodeURIComponent(authorDisplayName)}&backgroundColor=ffd5dc`);

    // 1. Optimistic UI update
    const newContribution: Contribution = {
      id: `c-${Date.now()}`,
      authorId: authorUid,
      authorName: authorDisplayName,
      authorAvatar,
      isAnonymous: bubble.anonymousModeEnabled,
      text,
      timestamp: new Date(),
    };
    setBubble((prev) => ({
      ...prev,
      contributions: [newContribution, ...prev.contributions],
    }));
    setNewCount((n) => n + 1);

    // 2. Persist to Firestore & notify backend AI
    sendMessageToFirestore({
      bubbleId: bubble.id,
      authorId: authorUid,
      authorName: authorDisplayName,
      text,
      isAnonymous: bubble.anonymousModeEnabled,
    }).catch((err) => {
      console.warn("Failed to write message to Firestore:", err);
    });
  }, [bubble.id, bubble.anonymousModeEnabled, initialUserName, user]);

  // Local: toggle anonymous mode
  const handleToggleAnonymous = useCallback(() => {
    setBubble((prev) => ({
      ...prev,
      anonymousModeEnabled: !prev.anonymousModeEnabled,
    }));
  }, []);

  // Local: extend expiry by 30 minutes
  const handleExtendExpiry = useCallback(() => {
    setBubble((prev) => ({
      ...prev,
      expiresAt: new Date(prev.expiresAt.getTime() + 30 * 60 * 1000),
    }));
  }, []);

  return (
    <div className="flex flex-col h-screen bg-[#0d0f1a] text-slate-100 overflow-hidden">
      <Header
        bubble={bubble}
        role={role}
        onToggleRole={() => setRole((r) => (r === "participant" ? "host" : "participant"))}
        onOpenManage={() => setIsManageOpen(true)}
        currentUser={user}
        onSignInGoogle={signInGoogle}
        onSignOut={signOut}
      />

      {/* Main two-column layout */}
      <main className="flex-1 flex gap-0 overflow-hidden px-4 py-4 min-h-0">
        {/* Left: Live Contributions */}
        <div className="flex-1 min-w-0 flex flex-col bg-[#0f1525] rounded-2xl border border-white/5 p-4 mr-3 overflow-hidden">
          <ContributionFeed
            contributions={bubble.contributions}
            isAnonymous={bubble.anonymousModeEnabled}
            onToggleAnonymous={role === "host" ? handleToggleAnonymous : undefined}
            newCount={newCount}
            onNewContribution={handleNewContribution}
          />
        </div>

        {/* Right: Live Intelligence */}
        <div className="w-[420px] shrink-0 flex flex-col bg-[#0f1525] rounded-2xl border border-white/5 p-4 overflow-hidden">
          <LiveIntelligencePanel intelligence={bubble.intelligence} />
        </div>
      </main>

      {/* Host-only: Manage Bubble overlay */}
      {role === "host" && isManageOpen && (
        <ManageBubblePanel
          bubble={bubble}
          onClose={() => setIsManageOpen(false)}
          onToggleAnonymous={handleToggleAnonymous}
          onExtendExpiry={handleExtendExpiry}
        />
      )}
    </div>
  );
}

