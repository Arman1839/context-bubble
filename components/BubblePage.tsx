"use client";

import React, { useState, useEffect, useCallback } from "react";
import type { Bubble, Role, Contribution } from "@/types";
import { Header } from "@/components/layout/Header";
import { ContributionFeed } from "@/components/participant/ContributionFeed";
import { LiveIntelligencePanel } from "@/components/intelligence/LiveIntelligencePanel";
import { ManageBubblePanel } from "@/components/host/ManageBubblePanel";

interface Props {
  initialBubble: Bubble;
  initialRole?: Role;
  initialUserName?: string;
}

export function BubblePage({ initialBubble, initialRole, initialUserName }: Props) {
  const [role, setRole] = useState<Role>(initialRole || "participant");
  const [bubble, setBubble] = useState<Bubble>(initialBubble);
  const [isManageOpen, setIsManageOpen] = useState(false);
  const [newCount, setNewCount] = useState(12);

  // Sync role if initialRole changes
  useEffect(() => {
    if (initialRole) {
      setRole(initialRole);
    }
  }, [initialRole]);

  // Initialize demo bubble's expiry to exactly two hours after initialization,
  // and dynamically set realistic timestamps for initial demo contributions.
  useEffect(() => {
    const now = Date.now();
    setBubble((prev) => ({
      ...prev,
      expiresAt: new Date(now + 2 * 60 * 60 * 1000), // Exactly 2 hours after initialization
      contributions: prev.contributions.map((c) => {
        const demoOffsets: Record<string, number> = {
          c1: 1 * 60 * 1000, // 1m ago
          c2: 3 * 60 * 1000, // 3m ago
          c3: 5 * 60 * 1000, // 5m ago
          c4: 7 * 60 * 1000, // 7m ago
          c5: 9 * 60 * 1000, // 9m ago
        };
        const offset = demoOffsets[c.id];
        return offset !== undefined
          ? { ...c, timestamp: new Date(now - offset) }
          : c;
      }),
    }));
  }, []);

  // Local: submit a new contribution
  const handleNewContribution = useCallback((text: string) => {
    const authorDisplayName = bubble.anonymousModeEnabled
      ? "Anonymous"
      : (initialUserName || "You");

    const newContribution: Contribution = {
      id: `c-${Date.now()}`,
      authorId: "current-user",
      authorName: authorDisplayName,
      authorAvatar: bubble.anonymousModeEnabled
        ? undefined
        : `https://api.dicebear.com/9.x/notionists/svg?seed=${encodeURIComponent(authorDisplayName)}&backgroundColor=ffd5dc`,
      isAnonymous: bubble.anonymousModeEnabled,
      text,
      timestamp: new Date(),
    };
    setBubble((prev) => ({
      ...prev,
      contributions: [newContribution, ...prev.contributions],
    }));
    setNewCount((n) => n + 1);
  }, [bubble.anonymousModeEnabled, initialUserName]);

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
