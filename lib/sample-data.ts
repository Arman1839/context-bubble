import type { Bubble } from "@/types";

// Static reference point: Oct 17 2026 00:00 UTC
// Safe fallback for SSR prerendering; client initializes dynamic 2-hour window.
const SESSION_BASE = new Date("2026-10-17T00:00:00Z").getTime();
const ago = (minutes: number) => new Date(SESSION_BASE - minutes * 60 * 1000);

export function formatExpiry(expiresAt: Date): string {
  const diff = Math.max(0, expiresAt.getTime() - Date.now());
  if (diff <= 0) return "0m";
  const h = Math.floor(diff / 3_600_000);
  const m = Math.floor((diff % 3_600_000) / 60_000);
  return `${h}h ${m}m`;
}

export const SAMPLE_BUBBLE: Bubble = {
  id: "demo",
  title: "Pivot Decision – Oct 2026",
  isLive: true,
  // 2h 14m after the session base
  expiresAt: new Date(SESSION_BASE + (2 * 60 + 14) * 60 * 1000),
  memberCount: 6,
  members: [
    { id: "priya",  name: "Priya",  avatar: "https://api.dicebear.com/9.x/notionists/svg?seed=priya&backgroundColor=b6e3f4" },
    { id: "arjun",  name: "Arjun",  avatar: "https://api.dicebear.com/9.x/notionists/svg?seed=arjun&backgroundColor=c0aede" },
    { id: "meera",  name: "Meera",  avatar: "https://api.dicebear.com/9.x/notionists/svg?seed=meera&backgroundColor=ffdfbf" },
    { id: "sara",   name: "Sara",   avatar: "https://api.dicebear.com/9.x/notionists/svg?seed=sara&backgroundColor=d1f4d9" },
    { id: "rahul",  name: "Rahul",  avatar: "https://api.dicebear.com/9.x/notionists/svg?seed=rahul&backgroundColor=ffd5dc" },
    { id: "ananya", name: "Ananya", avatar: "https://api.dicebear.com/9.x/notionists/svg?seed=ananya&backgroundColor=c9e9d2" },
  ],
  retentionPolicy: "temporary-plus-record",
  anonymousModeEnabled: false,
  contributions: [
    {
      id: "c1",
      authorId: "priya",
      authorName: "Priya",
      authorAvatar: "https://api.dicebear.com/9.x/notionists/svg?seed=priya&backgroundColor=b6e3f4",
      isAnonymous: false,
      text: "Retention dropped 18% after the last update. Users say onboarding is confusing.",
      timestamp: ago(1),
    },
    {
      id: "c2",
      authorId: "arjun",
      authorName: "Arjun",
      authorAvatar: "https://api.dicebear.com/9.x/notionists/svg?seed=arjun&backgroundColor=c0aede",
      isAnonymous: false,
      text: "I still think pricing is the real issue. Our competitor charges 40% less.",
      timestamp: ago(3),
      attachments: [
        { type: "link", label: "Competitor X - pricing - 40% less" },
      ],
    },
    {
      id: "c3",
      authorId: "meera",
      authorName: "Meera",
      authorAvatar: "https://api.dicebear.com/9.x/notionists/svg?seed=meera&backgroundColor=ffdfbf",
      isAnonymous: false,
      text: "We have only three weeks of runway left if we don't decide this week.",
      timestamp: ago(5),
    },
    {
      id: "c4",
      authorId: "anon-1",
      authorName: "Anonymous",
      authorAvatar: undefined,
      isAnonymous: true,
      text: "Customer quotes from the last 10 calls all mention too many steps to get value.",
      timestamp: ago(7),
    },
    {
      id: "c5",
      authorId: "sara",
      authorName: "Sara",
      authorAvatar: "https://api.dicebear.com/9.x/notionists/svg?seed=sara&backgroundColor=d1f4d9",
      isAnonymous: false,
      text: "I'm worried about team morale if we pivot again so soon.",
      timestamp: ago(9),
    },
  ],
  intelligence: {
    summary:
      "The team agrees retention is a major concern but remains divided over whether pricing, onboarding, or product value is the primary cause. Runway pressure makes the decision time-sensitive. Current churn data has not yet been shared.",
    disagreements: [
      {
        id: "d1",
        sideA: { count: 3, label: "retention and onboarding" },
        sideB: { count: 2, label: "pricing" },
      },
    ],
    missingPieces: [
      {
        id: "mp1",
        description: "Latest churn & retention data not uploaded",
        action: "request",
        actionLabel: "Request data",
      },
      {
        id: "mp2",
        description: "No agreed next experiment proposed",
        action: "suggest",
        actionLabel: "Suggest experiment",
      },
    ],
    nextSteps: [
      "Upload recent retention data",
      "Compare onboarding completion rates",
    ],
  },
};
