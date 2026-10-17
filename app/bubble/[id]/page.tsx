import { Suspense } from "react";
import { SAMPLE_BUBBLE } from "@/lib/sample-data";
import { BubblePage } from "@/components/BubblePage";

import type { Role } from "@/types";

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

  const bubbleData = {
    ...SAMPLE_BUBBLE,
    id: id,
    title: titleParam || (id === "demo" ? SAMPLE_BUBBLE.title : `Bubble: ${id}`),
  };

  return (
    <BubblePage
      initialBubble={bubbleData}
      initialRole={roleParam}
      initialUserName={userParam}
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
