"use client";

import { useSearchParams } from "next/navigation";
import { SAMPLE_BUBBLE } from "@/lib/sample-data";
import { BubblePage } from "@/components/BubblePage";
import type { Role, Bubble } from "@/types";

export function BubbleClient({ id }: { id: string }) {
  const searchParams = useSearchParams();

  const roleParam = searchParams.get("role") === "host" ? ("host" as Role) : ("participant" as Role);
  const titleParam = searchParams.get("title")?.trim() || undefined;
  const userParam = searchParams.get("user")?.trim() || undefined;
  const joinCodeParam = searchParams.get("join_code")?.trim() || undefined;
  const viewOnly = searchParams.get("mode") === "view";

  const isDemo = id === "demo";
  const bubbleData: Bubble = isDemo
    ? {
        ...SAMPLE_BUBBLE,
        title: titleParam || SAMPLE_BUBBLE.title,
      }
    : {
        id,
        title: titleParam || `Bubble: ${id}`,
        isLive: true,
        expiresAt: new Date("2099-12-31T23:59:59Z"),
        memberCount: 1,
        members: [],
        retentionPolicy: "temporary",
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
      initialBubble={bubbleData}
      initialRole={roleParam}
      initialUserName={userParam}
      joinCode={joinCodeParam}
      readOnly={viewOnly}
    />
  );
}
