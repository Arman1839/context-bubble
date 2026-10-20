import { Suspense } from "react";
import { EndBubblePage } from "@/components/bubble/EndBubblePage";

export default function Page({ params }: { params: Promise<{ id: string }> }) {
  return (
    <Suspense fallback={<main className="grid min-h-screen place-items-center bg-[#0d0f1a] text-slate-300">Loading end options…</main>}>
      <EndBubbleRoute params={params} />
    </Suspense>
  );
}

async function EndBubbleRoute({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <EndBubblePage bubbleId={id} />;
}
