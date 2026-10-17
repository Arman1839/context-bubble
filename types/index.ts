// ─── Core domain types ────────────────────────────────────────────────────────

export type Role = "participant" | "host";

export type RetentionPolicy = "temporary" | "temporary-plus-record" | "permanent";

// ─── Contribution ─────────────────────────────────────────────────────────────

export interface Attachment {
  type: "link" | "image" | "audio";
  label: string;
  url?: string;
}

export interface Contribution {
  id: string;
  authorId: string;
  authorName: string;
  authorAvatar?: string;    // URL or null for anonymous
  isAnonymous: boolean;
  text: string;
  timestamp: Date;
  attachments?: Attachment[];
}

// ─── Intelligence panel ───────────────────────────────────────────────────────

export interface DisagreementItem {
  id: string;
  sideA: { count: number; label: string };
  sideB: { count: number; label: string };
}

export interface MissingPiece {
  id: string;
  description: string;
  action: "request" | "suggest";
  actionLabel: string;
}

export interface Intelligence {
  summary: string;
  disagreements: DisagreementItem[];
  missingPieces: MissingPiece[];
  nextSteps: string[];
}

// ─── Bubble meta ──────────────────────────────────────────────────────────────

export interface BubbleMember {
  id: string;
  name: string;
  avatar?: string;
}

export interface Bubble {
  id: string;
  title: string;
  isLive: boolean;
  expiresAt: Date;
  memberCount: number;
  members: BubbleMember[];
  retentionPolicy: RetentionPolicy;
  anonymousModeEnabled: boolean;
  contributions: Contribution[];
  intelligence: Intelligence;
}
