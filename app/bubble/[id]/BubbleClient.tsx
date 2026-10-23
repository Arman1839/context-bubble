"use client";

import { useState, useEffect } from "react";
import { useSearchParams, usePathname } from "next/navigation";
import { getSampleBubble } from "@/lib/sample-data";
import { BubblePage } from "@/components/BubblePage";
import type { Role, Bubble } from "@/types";

function extractBubbleIdFromUrl(pathname?: string | null, fallbackId?: string): string {
  if (typeof window !== "undefined" && window.location.pathname) {
    const match = window.location.pathname.match(/^\/bubble\/([^/?#]+)/);
    if (match && match[1] && match[1] !== "create") {
      return decodeURIComponent(match[1]);
    }
  }
  if (pathname) {
    const match = pathname.match(/^\/bubble\/([^/?#]+)/);
    if (match && match[1] && match[1] !== "create") {
      return decodeURIComponent(match[1]);
    }
  }
  return fallbackId || "demo";
}

export function BubbleClient({ id }: { id: string }) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) {
    return (
      <div className="min-h-screen bg-[#0d0f1a] flex items-center justify-center text-slate-400">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 rounded-full border-2 border-violet-500 border-t-transparent animate-spin" />
          <p className="text-sm">Connecting to Context Bubble...</p>
        </div>
      </div>
    );
  }

  const effectiveId = extractBubbleIdFromUrl(pathname, id);
  const roleParam = searchParams.get("role") === "host" ? ("host" as Role) : ("participant" as Role);
  const titleParam = searchParams.get("title")?.trim() || undefined;
  const userParam = searchParams.get("user")?.trim() || undefined;
  const joinCodeParam = searchParams.get("join_code")?.trim() || undefined;
  const viewOnly = searchParams.get("mode") === "view";

  const isDemo = effectiveId === "demo";
  const demoData = isDemo ? getSampleBubble() : null;
  const bubbleData: Bubble = isDemo && demoData
    ? {
        ...demoData,
        title: titleParam || demoData.title,
      }
    : {
        id: effectiveId,
        title: titleParam || `Bubble: ${effectiveId}`,
        isLive: true,
        expiresAt: new Date(Date.now() + 2 * 3600 * 1000),
        memberCount: 1,
        members: [],
        retentionPolicy: "temporary-plus-record",
        anonymousModeEnabled: false,
        contributions: [],
        intelligence: {
          summary: "",
          disagreements: [],
          missingPieces: [],
          nextSteps: [],
          raw_insights: [],
        },
        popState: "ACTIVE",
        triggerMode: "mention",
        tokenBudget: 250000,
        tokensUsed: 0,
        e2eeEnabled: false,
      };

  return (
    <BubblePage
      key={effectiveId}
      initialBubble={bubbleData}
      initialRole={roleParam}
      initialUserName={userParam}
      joinCode={joinCodeParam}
      readOnly={viewOnly}
    />
  );
}

