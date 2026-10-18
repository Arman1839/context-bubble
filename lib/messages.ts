"use client";

import {
  collection,
  addDoc,
  query,
  orderBy,
  onSnapshot,
  serverTimestamp,
  Timestamp,
} from "firebase/firestore";
import { db } from "@/lib/firebase";
import { getCurrentIdToken } from "@/lib/auth";
import type { Contribution } from "@/types";

export interface SendMessageParams {
  bubbleId: string;
  authorId: string;
  authorName: string;
  text: string;
  isAnonymous?: boolean;
}

/**
 * Sends a message to Firestore and notifies the backend intelligence pipeline.
 */
export async function sendMessageToFirestore({
  bubbleId,
  authorId,
  authorName,
  text,
  isAnonymous = false,
}: SendMessageParams): Promise<string> {
  const displayName = isAnonymous ? "Anonymous" : authorName;
  const messagesCol = collection(db, "bubbles", bubbleId, "messages");

  // 1. Write document directly to Firestore for real-time peer sync
  const docRef = await addDoc(messagesCol, {
    bubble_id: bubbleId,
    author_id: authorId,
    author_name: displayName,
    text: text.trim(),
    is_anonymous: isAnonymous,
    created_at: serverTimestamp(),
  });

  // 2. Notify backend API for AI synthesis, RAG embedding, and debouncing
  try {
    const token = await getCurrentIdToken();
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };
    if (token) {
      headers["Authorization"] = `Bearer ${token}`;
    }

    const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL || "http://localhost:8000";
    await fetch(`${backendUrl}/api/v1/bubbles/${bubbleId}/messages`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        text: text.trim(),
        is_anonymous: isAnonymous,
      }),
    });
  } catch (backendErr) {
    // Backend API warning is non-blocking since Firestore sync succeeded
    console.debug("Backend AI ingestion notification notice:", backendErr);
  }

  return docRef.id;
}

/**
 * Subscribes to real-time messages in a bubble from Firestore.
 */
export function subscribeToBubbleMessages(
  bubbleId: string,
  onMessages: (messages: Contribution[]) => void,
  onError?: (error: Error) => void
): () => void {
  const messagesCol = collection(db, "bubbles", bubbleId, "messages");
  const q = query(messagesCol, orderBy("created_at", "desc"));

  return onSnapshot(
    q,
    (snapshot) => {
      const contributions: Contribution[] = snapshot.docs.map((doc) => {
        const data = doc.data();
        const createdAt = data.created_at;
        const timestamp =
          createdAt instanceof Timestamp
            ? createdAt.toDate()
            : createdAt?.seconds
            ? new Date(createdAt.seconds * 1000)
            : new Date();

        const authorName = data.author_name || (data.is_anonymous ? "Anonymous" : "Participant");
        const isAnonymous = Boolean(data.is_anonymous);

        return {
          id: doc.id,
          authorId: data.author_id || "unknown",
          authorName,
          authorAvatar: isAnonymous
            ? undefined
            : `https://api.dicebear.com/9.x/notionists/svg?seed=${encodeURIComponent(authorName)}&backgroundColor=ffd5dc`,
          isAnonymous,
          text: data.text || "",
          timestamp,
        };
      });

      onMessages(contributions);
    },
    (err) => {
      console.warn("Firestore subscription error (falling back to local):", err);
      if (onError) onError(err);
    }
  );
}
