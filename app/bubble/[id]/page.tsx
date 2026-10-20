import { Suspense } from "react";
import { SAMPLE_BUBBLE } from "@/lib/sample-data";
import { BubblePage } from "@/components/BubblePage";

import type { Role, Bubble } from "@/types";

interface PageProps {
  params: Promise<{ id: string }>;
  searchParams?: Promise<{ [key: string]: string | string[] | undefined }>;
}

async function BubbleContent({ params, searchParams }: PageProps) {
  const { id } = await params;
  const sp = searchParams ? await searchParams : {};

  const roleParam = sp.role === "host" ? ("host" as Role) : ("participant" as Role);
  const titleParam = typeof sp.title === "string" && sp.title.trim() ? sp.title.trim() : undefined;
  const userParam = typeof sp.user === "string" && sp.user.trim() ? sp.user.trim() : undefined;
  const viewOnly = sp.mode === "view";

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
        // Use a far-future deterministic date at prerender time; BubblePage will
        // refresh this with the real backend-supplied expiresAt on the client.
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
      readOnly={viewOnly}
    />
  );
}

export default function BubbleRoute(props: PageProps) {
  return (
    <Suspense fallback={<div className="h-screen bg-[#0d0f1a]" />}>
      <BubbleContent {...props} />
    </Suspense>
  );
}

export async function generateStaticParams() {
  return [{ id: "demo" }];
}
