"use client";

import { getCurrentIdToken } from "@/lib/auth";
import type { Contribution, Attachment } from "@/types";

export interface SendMessageParams {
  bubbleId: string;
  authorId: string;
  authorName: string;
  text: string;
  isAnonymous?: boolean;
  attachments?: Attachment[];
}

/**
 * Sends a message to the backend API (and mirrors to Firestore if available).
 */
export async function sendMessageToFirestore({
  bubbleId,
  authorId,
  authorName,
  text,
  isAnonymous = false,
  attachments,
}: SendMessageParams): Promise<string> {
  const displayName = isAnonymous ? "Anonymous" : authorName;
  let docId = `msg-${Date.now()}`;

  try {
    const token = await getCurrentIdToken();
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (token) {
      headers["Authorization"] = `Bearer ${token}`;
    } else {
      headers["Authorization"] = `Bearer dev-${encodeURIComponent(authorId)}`;
    }

    const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL || "http://localhost:8000";
    const res = await fetch(`${backendUrl}/api/v1/bubbles/${bubbleId}/messages`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        text: text.trim(),
        is_anonymous: isAnonymous,
        attachments: attachments || undefined,
      }),
    });

    if (res.ok) {
      const data = await res.json();
      if (data.id) docId = data.id;
    }
  } catch (backendErr) {
    console.debug("Backend message POST notice:", backendErr);
  }

  return docId;
}

/**
 * Subscribes to real-time messages using backend polling only.
 * Returns { unsubscribe, refresh } — call refresh() to immediately re-fetch.
 */
export function subscribeToBubbleMessages(
  bubbleId: string,
  onMessages: (messages: Contribution[]) => void,
  onError?: (error: Error) => void
): { unsubscribe: () => void; refresh: () => void } {
  let isSubscribed = true;

  const fetchAndUpdate = async () => {
    if (!isSubscribed) return;
    try {
      const msgs = await fetchMessagesFromBackend(bubbleId);
      if (isSubscribed) onMessages(msgs);
    } catch {
      // Ignored
    }
  };

  // Fetch immediately on subscribe
  fetchAndUpdate();

  // Poll every 3s as fallback
  const pollInterval = setInterval(fetchAndUpdate, 3000);

  return {
    unsubscribe: () => {
      isSubscribed = false;
      clearInterval(pollInterval);
    },
    refresh: () => {
      fetchAndUpdate();
    },
  };
}

/**
 * Fetch message history directly from FastAPI backend
 */
export async function fetchMessagesFromBackend(bubbleId: string): Promise<Contribution[]> {
  try {
    const token = await getCurrentIdToken();
    const headers: Record<string, string> = {};
    if (token) {
      headers["Authorization"] = `Bearer ${token}`;
    } else {
      headers["Authorization"] = "Bearer dev-participant";
    }

    const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL || "http://localhost:8000";
    const res = await fetch(`${backendUrl}/api/v1/bubbles/${bubbleId}/messages`, {
      headers,
    });
    if (!res.ok) return [];
    const list = await res.json();
    // Return oldest-first so the feed renders top→bottom like WhatsApp
    return list.map((m: any) => ({
      id: m.id,
      bubble_id: m.bubble_id,
      authorId: m.author_id,
      authorName: m.author_name,
      authorAvatar: m.is_anonymous
        ? undefined
        : `https://api.dicebear.com/9.x/notionists/svg?seed=${encodeURIComponent(m.author_name)}&backgroundColor=ffd5dc`,
      isAnonymous: m.is_anonymous,
      text: m.text,
      timestamp: m.created_at ? new Date(m.created_at) : new Date(),
      attachments: m.attachments,
    }));
  } catch {
    return [];
  }
}
