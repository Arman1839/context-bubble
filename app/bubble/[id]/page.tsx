import { Suspense } from "react";
import { BubbleClient } from "./BubbleClient";

interface PageProps {
  params: Promise<{ id: string }>;
}

export async function generateStaticParams() {
  return [{ id: "demo" }];
}

export default async function BubbleRoute({ params }: PageProps) {
  const { id } = await params;
  return (
    <Suspense fallback={<div className="h-screen bg-[#0d0f1a]" />}>
      <BubbleClient id={id} />
    </Suspense>
  );
}
