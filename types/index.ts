// ─── Core domain types ────────────────────────────────────────────────────────

export type Role = "participant" | "host";

export type RetentionPolicy = "temporary" | "temporary-plus-record" | "permanent" | "view-only";

export type PopState =
  | "ACTIVE"
  | "EXPIRY_PENDING"
  | "POPPING"
  | "EXPORTING"
  | "SHREDDING"
  | "POPPED"
  | "FAILED_EXPORT";

export type AITriggerMode = "mention" | "auto" | "always";

export type InsightType = "consensus" | "debate" | "blocker" | "action_item" | "decision";

// ─── Attachments & Contributions ──────────────────────────────────────────────

export interface Attachment {
  type: "link" | "image" | "audio" | "file";
  label: string;
  url?: string;
  file_id?: string;
  mime_type?: string;
  size_bytes?: number;
  preview_text?: string;
}

export interface Contribution {
  id: string;
  bubble_id?: string;
  authorId: string;
  authorName: string;
  authorAvatar?: string;
  authorAnimal?: string;
  isAnonymous: boolean;
  text: string;
  timestamp: Date;
  attachments?: Attachment[];
  extracted_text?: string;
  source_type?: "chat" | "voice_transcript" | "document_ocr" | "link_extract";
}

// ─── Intelligence & Insights ──────────────────────────────────────────────────

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

export interface Insight {
  insight_id: string;
  type: InsightType;
  text: string;
  confidence: number;
  supporting_contribution_ids: string[];
  created_at?: string;
  updated_at?: string;
}

export interface Intelligence {
  summary: string;
  disagreements: DisagreementItem[];
  missingPieces: MissingPiece[];
  nextSteps: string[];
  raw_insights?: Insight[];
  updated_at?: string | Date;
}

// ─── Knowledge Graph ──────────────────────────────────────────────────────────

export type NodeType = "topic" | "claim" | "consensus" | "blocker" | "decision" | "debate" | "action_item";
export type EdgeType = "supports" | "disputes" | "depends_on" | "resolves";
export type NodeStatus = "consensus" | "contested" | "unresolved";

export interface StanceCounts {
  agree_count: number;
  disagree_count: number;
  neutral_count: number;
  supporter_ids?: string[];
  challenger_ids?: string[];
}

export interface ReactFlowNodeData {
  label: string;
  node_type: NodeType;
  status: NodeStatus;
  stance: StanceCounts;
  supporting_contribution_ids: string[];
  confidence: number;
}

export interface ReactFlowNode {
  id: string;
  type?: string;
  data: ReactFlowNodeData;
  position: { x: number; y: number };
}

export interface ReactFlowEdge {
  id: string;
  source: string;
  target: string;
  label?: string;
  type?: EdgeType;
  animated?: boolean;
  style?: Record<string, string>;
}

export interface KnowledgeGraph {
  bubble_id: string;
  nodes: ReactFlowNode[];
  edges: ReactFlowEdge[];
  version: number;
}

// ─── Presence & Stream Events ─────────────────────────────────────────────────

export interface PresenceUser {
  user_id: string;
  display_name: string;
  status: "online" | "away" | "offline";
  is_typing: boolean;
  updated_at?: string;
}

export interface SSEStreamEvent {
  event_id: string;
  event_type: "token" | "delta" | "complete" | "graph" | "presence" | "pop_state" | "ping" | "error";
  data: Record<string, unknown>;
  timestamp?: string;
}

// ─── Pop, Briefing & Exports ──────────────────────────────────────────────────

export type ExportTarget = "notion" | "jira" | "linear" | "slack" | "markdown" | "pdf";
export type ExportStatus = "pending" | "in_progress" | "completed" | "failed" | "dry_run";

export interface ActionItem {
  task: string;
  owner?: string;
  priority: "low" | "medium" | "high" | "critical";
  deadline_hint?: string;
}

export interface DisagreementSummary {
  topic: string;
  perspective_a: string;
  perspective_b: string;
  unresolved_questions: string[];
}

export interface GraphRelationshipSummary {
  total_nodes: number;
  total_edges: number;
  key_relationships: string[];
}

export interface ExecutiveBriefing {
  bubble_id: string;
  bubble_title: string;
  generated_at?: string;
  executive_summary: string;
  decisions: string[];
  consensus_points: string[];
  disagreements: DisagreementSummary[];
  blockers: string[];
  action_items: ActionItem[];
  graph_summary?: GraphRelationshipSummary;
  markdown_content?: string;
}

export interface ExportRecord {
  id: string;
  bubble_id: string;
  target: ExportTarget;
  status: ExportStatus;
  idempotency_key?: string;
  external_url?: string;
  external_item_id?: string;
  error_message?: string;
  created_at?: string;
  completed_at?: string;
}

// ─── Bubble Meta ──────────────────────────────────────────────────────────────

export interface BubbleMember {
  id: string;
  name: string;
  avatar?: string;
  avatar_animal?: string;
  isOnline?: boolean;
  role?: Role;
  joined_at?: string | Date;
  last_seen_at?: string | Date;
}

export interface Bubble {
  id: string;
  joinCode?: string;
  title: string;
  isLive: boolean;
  expiresAt: Date;
  expiryDecisionDeadline?: Date;
  viewUntil?: Date;
  memberCount: number;
  members: BubbleMember[];
  retentionPolicy: RetentionPolicy;
  anonymousModeEnabled: boolean;
  hostId?: string;
  popState?: PopState;
  triggerMode?: AITriggerMode;
  tokenBudget?: number;
  tokensUsed?: number;
  e2eeEnabled?: boolean;
  contributions: Contribution[];
  intelligence: Intelligence;
  knowledgeGraph?: KnowledgeGraph;
  executiveBriefing?: ExecutiveBriefing;
  exports?: ExportRecord[];
}
