"use client";

import { getCurrentIdToken } from "@/lib/auth";
import type {
  Bubble,
  BubbleMember,
  KnowledgeGraph,
  PopState,
  AITriggerMode,
  RetentionPolicy,
  ExportTarget,
  ExportRecord,
  Intelligence,
} from "@/types";

export const BACKEND_URL =
  process.env.NEXT_PUBLIC_BACKEND_URL || "http://localhost:8000";

async function getAuthHeaders(isJson = true): Promise<HeadersInit> {
  const headers: Record<string, string> = {};
  if (isJson) {
    headers["Content-Type"] = "application/json";
  }

  try {
    const token = await getCurrentIdToken();
    if (token) {
      headers["Authorization"] = `Bearer ${token}`;
    } else {
      // In local dev mode, the backend accepts Bearer dev-* tokens
      headers["Authorization"] = "Bearer dev-participant";
    }
  } catch {
    headers["Authorization"] = "Bearer dev-participant";
  }

  return headers;
}

export interface CreateBubblePayload {
  title: string;
  duration_minutes?: number;
  retention_policy?: RetentionPolicy;
  anonymous_mode_enabled?: boolean;
  trigger_mode?: AITriggerMode;
  token_budget?: number;
  e2ee_enabled?: boolean;
}

export interface BubbleResponseRaw {
  id: string;
  title: string;
  is_live: boolean;
  expires_at: string;
  member_count: number;
  members: Array<{
    id: string;
    name: string;
    avatar?: string;
    role?: "host" | "participant";
    joined_at?: string;
    last_seen_at?: string;
  }>;
  retention_policy: RetentionPolicy;
  anonymous_mode_enabled: boolean;
  host_id: string;
  pop_state: PopState;
  trigger_mode: AITriggerMode;
  e2ee_enabled: boolean;
  created_at: string;
}

export interface JoinBubblePayload {
  display_name: string;
  avatar_url?: string;
}

// ─── API Client Methods ───────────────────────────────────────────────────────

/**
 * Creates a new Context Bubble on the FastAPI backend.
 */
export async function createBubble(payload: CreateBubblePayload): Promise<BubbleResponseRaw> {
  const headers = await getAuthHeaders();
  const res = await fetch(`${BACKEND_URL}/api/v1/bubbles`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      title: payload.title,
      duration_minutes: payload.duration_minutes || 120,
      retention_policy: payload.retention_policy || "temporary",
      anonymous_mode_enabled: Boolean(payload.anonymous_mode_enabled),
      trigger_mode: payload.trigger_mode || "mention",
      token_budget: payload.token_budget || 250000,
      e2ee_enabled: Boolean(payload.e2ee_enabled),
    }),
  });

  if (!res.ok) {
    const errData = await res.json().catch(() => ({}));
    throw new Error(errData.detail || errData.error?.message || `Failed to create bubble (${res.status})`);
  }

  return res.json();
}

/**
 * Fetches bubble metadata and active participants from the backend.
 */
export async function getBubble(bubbleId: string): Promise<BubbleResponseRaw> {
  const headers = await getAuthHeaders();
  const res = await fetch(`${BACKEND_URL}/api/v1/bubbles/${bubbleId}`, {
    method: "GET",
    headers,
  });

  if (!res.ok) {
    const errData = await res.json().catch(() => ({}));
    throw new Error(errData.detail || errData.error?.message || `Bubble "${bubbleId}" not found (${res.status})`);
  }

  return res.json();
}

/**
 * Joins a bubble as a participant with a display name.
 */
export async function joinBubble(
  bubbleId: string,
  payload: JoinBubblePayload
): Promise<BubbleMember> {
  const headers = await getAuthHeaders();
  const res = await fetch(`${BACKEND_URL}/api/v1/bubbles/${bubbleId}/join`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      display_name: payload.display_name,
      avatar_url: payload.avatar_url,
    }),
  });

  if (!res.ok) {
    const errData = await res.json().catch(() => ({}));
    throw new Error(errData.detail || errData.error?.message || `Failed to join bubble (${res.status})`);
  }

  return res.json();
}

/**
 * Extends the expiry of an active bubble. Host action.
 */
export async function extendBubble(
  bubbleId: string,
  additionalMinutes: number
): Promise<{ status: string; new_expires_at: string }> {
  const headers = await getAuthHeaders();
  const res = await fetch(`${BACKEND_URL}/api/v1/bubbles/${bubbleId}/extend`, {
    method: "POST",
    headers,
    body: JSON.stringify({ additional_minutes: additionalMinutes }),
  });

  if (!res.ok) {
    const errData = await res.json().catch(() => ({}));
    throw new Error(errData.detail || errData.error?.message || `Failed to extend bubble (${res.status})`);
  }

  return res.json();
}

/**
 * Updates AI trigger mode ('mention' | 'auto' | 'always'). Host action.
 */
export async function updateTriggerMode(
  bubbleId: string,
  triggerMode: AITriggerMode
): Promise<{ status: string; trigger_mode: AITriggerMode }> {
  const headers = await getAuthHeaders();
  const res = await fetch(`${BACKEND_URL}/api/v1/bubbles/${bubbleId}/trigger-mode`, {
    method: "PATCH",
    headers,
    body: JSON.stringify({ trigger_mode: triggerMode }),
  });

  if (!res.ok) {
    const errData = await res.json().catch(() => ({}));
    throw new Error(errData.detail || errData.error?.message || `Failed to update trigger mode (${res.status})`);
  }

  return res.json();
}

/**
 * Initiates bubble destruction (pop), briefing generation, export, and crypto-shredding.
 */
export async function popBubble(
  bubbleId: string,
  req?: {
    force_shred_on_export_failure?: boolean;
    dry_run?: boolean;
    custom_briefing_prompt?: string;
  }
): Promise<{ status: string; pop_state: PopState }> {
  const headers = await getAuthHeaders();
  const res = await fetch(`${BACKEND_URL}/api/v1/bubbles/${bubbleId}/pop`, {
    method: "POST",
    headers,
    body: JSON.stringify(req || {}),
  });

  if (!res.ok) {
    const errData = await res.json().catch(() => ({}));
    throw new Error(errData.detail || errData.error?.message || `Failed to pop bubble (${res.status})`);
  }

  return res.json();
}

/**
 * Fetches the real executive briefing generated during bubble pop.
 */
export async function getBriefing(bubbleId: string): Promise<ExecutiveBriefing | null> {
  const headers = await getAuthHeaders(false);
  try {
    const res = await fetch(`${BACKEND_URL}/api/v1/bubbles/${bubbleId}/pop/briefing`, { headers });
    if (!res.ok) return null;
    return res.json();
  } catch {
    return null;
  }
}

/**
 * Fetches current pop status and list of external export records.
 */
export async function getPopStatus(
  bubbleId: string
): Promise<{
  bubble_id: string;
  pop_state: PopState;
  popped_at?: string;
  exports: ExportRecord[];
}> {
  const headers = await getAuthHeaders();
  const res = await fetch(`${BACKEND_URL}/api/v1/bubbles/${bubbleId}/pop/status`, {
    method: "GET",
    headers,
  });

  if (!res.ok) {
    const errData = await res.json().catch(() => ({}));
    throw new Error(errData.detail || errData.error?.message || `Failed to get pop status (${res.status})`);
  }

  return res.json();
}

/**
 * Configures an external export target (Slack, Notion, Linear, Jira). Host action.
 */
export async function configureExportTarget(
  bubbleId: string,
  config: {
    target: ExportTarget;
    enabled?: boolean;
    workspace_id?: string;
    target_channel_or_db?: string;
  }
): Promise<{ status: string; target: ExportTarget }> {
  const headers = await getAuthHeaders();
  const res = await fetch(`${BACKEND_URL}/api/v1/bubbles/${bubbleId}/pop/export-config`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      target: config.target,
      enabled: config.enabled !== undefined ? config.enabled : true,
      workspace_id: config.workspace_id,
      target_channel_or_db: config.target_channel_or_db,
    }),
  });

  if (!res.ok) {
    const errData = await res.json().catch(() => ({}));
    throw new Error(errData.detail || errData.error?.message || `Failed to configure export (${res.status})`);
  }

  return res.json();
}

/**
 * Fetches React Flow Knowledge Graph for the bubble.
 */
export async function getKnowledgeGraph(bubbleId: string): Promise<KnowledgeGraph> {
  const headers = await getAuthHeaders();
  const res = await fetch(`${BACKEND_URL}/api/v1/bubbles/${bubbleId}/graph`, {
    method: "GET",
    headers,
  });

  if (!res.ok) {
    const errData = await res.json().catch(() => ({}));
    throw new Error(errData.detail || errData.error?.message || `Failed to fetch knowledge graph (${res.status})`);
  }

  return res.json();
}

/**
 * Updates user typing status and online presence.
 */
export async function updatePresence(
  bubbleId: string,
  isTyping: boolean,
  status: "online" | "away" | "offline" = "online"
): Promise<{ status: string }> {
  const headers = await getAuthHeaders();
  const params = new URLSearchParams({
    is_typing: String(isTyping),
    status,
  });

  const res = await fetch(
    `${BACKEND_URL}/api/v1/bubbles/${bubbleId}/messages/presence?${params.toString()}`,
    {
      method: "POST",
      headers,
    }
  );

  if (!res.ok) {
    return { status: "ignored" };
  }

  return res.json();
}

/**
 * Handles direct file upload to the backend (which uploads to Cloudinary),
 * extracts text, indexes in RAG, and triggers AI document review.
 */
export async function uploadAndProcessFile(
  bubbleId: string,
  file: File
): Promise<{ file_id: string; filename: string; char_count: number; secure_url: string; upload_url: string }> {
  const token = await getCurrentIdToken().catch(() => null);
  const headers: Record<string, string> = {};
  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  } else {
    headers["Authorization"] = "Bearer dev-participant";
  }

  const formData = new FormData();
  formData.append("file", file, file.name);

  const res = await fetch(`${BACKEND_URL}/api/v1/bubbles/${bubbleId}/files/upload`, {
    method: "POST",
    headers, // No Content-Type — browser sets multipart boundary automatically
    body: formData,
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || `Upload failed (${res.status})`);
  }

  const data = await res.json();
  return {
    file_id: data.file_id,
    filename: data.filename,
    char_count: data.char_count || 0,
    secure_url: data.secure_url || "",
    upload_url: data.secure_url || "",
  };
}

// ─── SSE Stream Subscription ─────────────────────────────────────────────────

export interface SSECallbacks {
  onConnected?: (data: { status: string; bubble_id: string }) => void;
  onToken?: (token: string, seq?: number) => void;
  onAIToken?: (token: string) => void;
  onAIComplete?: (text: string) => void;
  onDelta?: (delta: Record<string, unknown>) => void;
  onComplete?: (intelligence: Intelligence) => void;
  onGraph?: (graph: KnowledgeGraph) => void;
  onPresence?: (presence: { user_id: string; display_name: string; is_typing: boolean; status: string }) => void;
  onPopState?: (state: PopState, receiptId?: string, popReason?: string, retentionPolicy?: string, message?: string) => void;
  onMessage?: (message: any) => void;
  onMemberJoined?: (member: any) => void;
  onError?: (error: Event) => void;
}

/**
 * Connects to the backend Server-Sent Events stream (/bubbles/{bubble_id}/stream).
 * Returns an unsubscribe teardown function.
 */
export function subscribeToBubbleStream(
  bubbleId: string,
  callbacks: SSECallbacks
): () => void {
  const url = `${BACKEND_URL}/api/v1/bubbles/${bubbleId}/stream`;
  const eventSource = new EventSource(url);

  eventSource.addEventListener("connected", (e) => {
    try {
      const data = JSON.parse(e.data);
      callbacks.onConnected?.(data);
    } catch {
      // Ignored
    }
  });

  eventSource.onmessage = (e) => {
    try {
      const data = JSON.parse(e.data);
      callbacks.onMessage?.(data);
    } catch {
      // Ignored
    }
  };

  eventSource.addEventListener("message", (e: any) => {
    try {
      const data = JSON.parse(e.data);
      callbacks.onMessage?.(data);
    } catch {
      // Ignored
    }
  });

  eventSource.addEventListener("member_joined", (e) => {
    try {
      const data = JSON.parse(e.data);
      callbacks.onMemberJoined?.(data);
    } catch {
      // Ignored
    }
  });

  eventSource.addEventListener("token", (e) => {
    try {
      const data = JSON.parse(e.data);
      callbacks.onToken?.(data.token, data.seq);
    } catch {
      // Ignored
    }
  });

  // AI participant tokens — routed to the intelligence panel, not the chat feed
  eventSource.addEventListener("ai_token", (e) => {
    try {
      const data = JSON.parse(e.data);
      callbacks.onAIToken?.(data.token);
    } catch {
      // Ignored
    }
  });

  // AI participant full reply — routed to the intelligence panel
  eventSource.addEventListener("ai_complete", (e) => {
    try {
      const data = JSON.parse(e.data);
      callbacks.onAIComplete?.(data.text || "");
    } catch {
      // Ignored
    }
  });

  eventSource.addEventListener("delta", (e) => {
    try {
      const data = JSON.parse(e.data);
      if (data.type === "pop_state_change") {
        callbacks.onPopState?.(
          data.status as PopState,
          data.receipt_id,
          data.pop_reason,
          data.retention_policy,
          data.message
        );
      } else {
        callbacks.onDelta?.(data);
      }
    } catch {
      // Ignored
    }
  });

  eventSource.addEventListener("complete", (e) => {
    try {
      const data = JSON.parse(e.data);
      callbacks.onComplete?.(data as Intelligence);
    } catch {
      // Ignored
    }
  });

  eventSource.addEventListener("graph", (e) => {
    try {
      const data = JSON.parse(e.data);
      callbacks.onGraph?.(data as KnowledgeGraph);
    } catch {
      // Ignored
    }
  });

  eventSource.addEventListener("presence", (e) => {
    try {
      const data = JSON.parse(e.data);
      callbacks.onPresence?.(data);
    } catch {
      // Ignored
    }
  });

  eventSource.onerror = (err) => {
    callbacks.onError?.(err);
  };

  return () => {
    eventSource.close();
  };
}
