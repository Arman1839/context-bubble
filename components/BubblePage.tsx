"use client";

import React, { useState, useCallback, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import type { Bubble, Role, Contribution, Attachment, KnowledgeGraph, PopState, ExecutiveBriefing } from "@/types";
import { Header } from "@/components/layout/Header";
import { ContributionFeed } from "@/components/participant/ContributionFeed";
import { LiveIntelligencePanel } from "@/components/intelligence/LiveIntelligencePanel";
import { ManageBubblePanel } from "@/components/host/ManageBubblePanel";
import { useFirebaseAuth } from "@/lib/auth";
import { subscribeToBubbleMessages, sendMessageToFirestore } from "@/lib/messages";
import { getBubble, getKnowledgeGraph, subscribeToBubbleStream, getPopStatus, joinBubble, getBriefing } from "@/lib/api";
import { AuthModal } from "@/components/auth/AuthModal";

interface Props {
  initialBubble: Bubble;
  initialRole?: Role;
  initialUserName?: string;
}

export function BubblePage({ initialBubble, initialRole, initialUserName }: Props) {
  // Firebase Auth state
  const { user, loading: authLoading, signOut } = useFirebaseAuth();
  const [isAuthModalOpen, setIsAuthModalOpen] = useState(false);
  const router = useRouter();

  // Bubble state
  const [bubble, setBubble] = useState<Bubble>(() => {
    return {
      ...initialBubble,
      expiresAt: initialBubble.expiresAt,
      popState: "ACTIVE",
    };
  });

  // Role: genuinely determined by whether user.uid matches bubble.hostId or initialRole
  const [role, setRole] = useState<Role>(() => {
    if (initialRole) return initialRole;
    if (bubble.hostId && user?.uid && bubble.hostId === user.uid) return "host";
    return "participant";
  });

  const [isManageOpen, setIsManageOpen] = useState(false);
  const [newCount, setNewCount] = useState(0);

  // Live SSE stream state
  const [streamingToken, setStreamingToken] = useState<string>("");
  const [isSynthesizing, setIsSynthesizing] = useState<boolean>(false);
  const [knowledgeGraph, setKnowledgeGraph] = useState<KnowledgeGraph | null>(null);
  const [typingUsers, setTypingUsers] = useState<string[]>([]);

  // AI participant response — shown in the intelligence panel, never in the chat feed
  const [aiResponse, setAiResponse] = useState<string>("");
  const [isAIResponding, setIsAIResponding] = useState<boolean>(false);

  // Popped / Executive Briefing Modal State
  const [showBriefingModal, setShowBriefingModal] = useState<boolean>(false);
  const [briefing, setBriefing] = useState<ExecutiveBriefing | null>(null);
  const [copiedBriefing, setCopiedBriefing] = useState<boolean>(false);

  // Pop notification state — set from SSE pop_state_change events
  const [popReason, setPopReason] = useState<string>("");
  const [popMessage, setPopMessage] = useState<string>("");
  const [retentionPolicy, setRetentionPolicy] = useState<string>(bubble.retentionPolicy || "temporary");

  // 1. Fetch live Bubble metadata from backend & auto-register participant
  useEffect(() => {
    if (!bubble.id) return;
    let isMounted = true;

    // If user is authenticated, ensure they are registered in the backend participant roster
    if (user && user.displayName) {
      joinBubble(bubble.id, {
        display_name: user.displayName,
        avatar_url: user.photoURL || undefined,
      }).catch((err) => {
        console.debug("Participant join check notice:", err);
      });
    }

    getBubble(bubble.id)
      .then((data) => {
        if (!isMounted) return;
        setBubble((prev) => ({
          ...prev,
          title: data.title || prev.title,
          expiresAt: data.expires_at ? new Date(data.expires_at) : prev.expiresAt,
          memberCount: data.member_count || prev.memberCount,
          members: data.members && data.members.length > 0 ? (data.members as any) : prev.members,
          retentionPolicy: data.retention_policy || prev.retentionPolicy,
          anonymousModeEnabled: data.anonymous_mode_enabled ?? prev.anonymousModeEnabled,
          triggerMode: data.trigger_mode || prev.triggerMode,
          popState: data.pop_state || prev.popState,
          hostId: data.host_id || prev.hostId,
        }));
        if (data.retention_policy) setRetentionPolicy(data.retention_policy);

        // Dynamically compute authentic role based on hostId
        if (data.host_id && user?.uid) {
          if (data.host_id === user.uid) {
            setRole("host");
          } else if (initialRole !== "host") {
            setRole("participant");
          }
        }
      })
      .catch((err) => {
        console.debug("Backend bubble fetch status:", err);
      });

    // Fetch initial knowledge graph
    getKnowledgeGraph(bubble.id)
      .then((g) => {
        if (isMounted && g && g.nodes) {
          setKnowledgeGraph(g);
        }
      })
      .catch(() => {});

    return () => {
      isMounted = false;
    };
  }, [bubble.id, user?.uid, user?.displayName]);

  // When bubble is popped: fetch real briefing, show modal briefly, then redirect
  const loadBriefingModal = useCallback(async () => {
    try {
      // Fetch the real generated briefing from backend
      const realBriefing = await getBriefing(bubble.id);
      if (realBriefing) {
        setBriefing(realBriefing as any);
      }
    } catch {
      // Non-fatal — we'll still redirect
    }
    setShowBriefingModal(true);

    // After 8 seconds redirect to home — session is over
    setTimeout(() => {
      router.push(`/?popped=${encodeURIComponent(bubble.title)}`);
    }, 8000);
  }, [bubble.id, bubble.title, router]);

  // fetchMessages ref — used by SSE onMessage to trigger an immediate poll
  const fetchMessagesRef = useRef<(() => void) | null>(null);

  // 2. Connect to Backend SSE Stream (/bubbles/{id}/stream)
  useEffect(() => {
    if (!bubble.id) return;

    const unsubscribeSSE = subscribeToBubbleStream(bubble.id, {
      onConnected: () => {
        console.info(`Connected to live SSE stream for bubble ${bubble.id}`);
      },
      onMessage: () => {
        // New message arrived — trigger immediate poll instead of adding directly
        // (prevents duplicates: polling is the single source of truth)
        fetchMessagesRef.current?.();
      },
      onMemberJoined: (member) => {
        if (!member) return;
        setBubble((prev) => {
          const exists = prev.members.some((m) => m.id === member.id);
          const updatedMembers = exists
            ? prev.members.map((m) => (m.id === member.id ? { ...m, ...member } : m))
            : [...prev.members, member];
          return {
            ...prev,
            memberCount: member.member_count || updatedMembers.length,
            members: updatedMembers,
          };
        });
      },
      onToken: (token) => {
        setIsSynthesizing(true);
        setStreamingToken(token);
      },
      onAIToken: (token) => {
        setIsAIResponding(true);
        setAiResponse((prev) => prev + token);
      },
      onAIComplete: (text) => {
        setIsAIResponding(false);
        setAiResponse(text);
      },
      onComplete: (intel) => {
        setIsSynthesizing(false);
        setStreamingToken("");
        if (intel && intel.summary) {
          setBubble((prev) => ({ ...prev, intelligence: intel }));
        }
      },
      onGraph: (graph) => {
        if (graph && graph.nodes) setKnowledgeGraph(graph);
      },
      onPresence: (pres) => {
        if (pres.is_typing) {
          setTypingUsers((prev) => (prev.includes(pres.display_name) ? prev : [...prev, pres.display_name]));
        } else {
          setTypingUsers((prev) => prev.filter((name) => name !== pres.display_name));
        }
      },
      onPopState: (state, receiptId, reason, policy, message) => {
        setBubble((prev) => ({ ...prev, popState: state, isLive: state === "ACTIVE" }));
        if (reason) setPopReason(reason);
        if (policy) setRetentionPolicy(policy);
        if (message) setPopMessage(message);
        if (state === "POPPED" || state === "EXPORTING" || state === "POPPING" || state === "SHREDDING") {
          loadBriefingModal();
        }
      },
    });

    return () => { unsubscribeSSE(); };
  }, [bubble.id, loadBriefingModal]);

  // 3. Subscribe to messages — backend is the single source of truth
  useEffect(() => {
    if (!bubble.id) return;

    const sub = subscribeToBubbleMessages(
      bubble.id,
      (backendMsgs) => {
        setBubble((prev) => {
          if (bubble.id === "demo" && backendMsgs.length === 0) return prev;
          const confirmedIds = new Set(backendMsgs.map((m) => m.id));
          const stillPending = prev.contributions.filter(
            (c) => c.id.startsWith("c-") && !confirmedIds.has(c.id)
          );
          return {
            ...prev,
            contributions: [...backendMsgs, ...stillPending],
          };
        });
      },
      (err) => { console.debug("Messages sync error:", err); }
    );

    // Expose refresh so SSE onMessage can trigger an immediate poll
    fetchMessagesRef.current = sub.refresh;

    return () => {
      sub.unsubscribe();
      fetchMessagesRef.current = null;
    };
  }, [bubble.id]);


  // Submit a new contribution
  const handleNewContribution = useCallback(
    (text: string, attachments?: Attachment[]) => {
      // If user is not authenticated yet, open Auth Modal
      if (!user || !user.displayName) {
        setIsAuthModalOpen(true);
        return;
      }

      const authorDisplayName = bubble.anonymousModeEnabled
        ? "Anonymous"
        : user.displayName || initialUserName || "You";

      const authorUid = user.uid;
      const authorAvatar = bubble.anonymousModeEnabled
        ? undefined
        : user.photoURL ||
          `https://api.dicebear.com/9.x/notionists/svg?seed=${encodeURIComponent(authorDisplayName)}&backgroundColor=ffd5dc`;

      // 1. Optimistic UI update — append to end (newest at bottom, like WhatsApp)
      const newContribution: Contribution = {
        id: `c-${Date.now()}`,
        authorId: authorUid,
        authorName: authorDisplayName,
        authorAvatar,
        isAnonymous: bubble.anonymousModeEnabled,
        text,
        attachments,
        timestamp: new Date(),
      };

      setBubble((prev) => ({
        ...prev,
        contributions: [...prev.contributions, newContribution],
      }));
      setNewCount((n) => n + 1);

      // 2. Persist to Firestore & notify backend AI pipeline
      sendMessageToFirestore({
        bubbleId: bubble.id,
        authorId: authorUid,
        authorName: authorDisplayName,
        text,
        isAnonymous: bubble.anonymousModeEnabled,
        attachments,
      }).catch((err) => {
        console.warn("Failed to write message:", err);
      });
    },
    [bubble.id, bubble.anonymousModeEnabled, initialUserName, user]
  );

  // Refresh knowledge graph
  const handleRefreshGraph = useCallback(() => {
    getKnowledgeGraph(bubble.id)
      .then((g) => {
        if (g && g.nodes) setKnowledgeGraph(g);
      })
      .catch(() => {});
  }, [bubble.id]);

  // Local: toggle anonymous mode
  const handleToggleAnonymous = useCallback(() => {
    setBubble((prev) => ({
      ...prev,
      anonymousModeEnabled: !prev.anonymousModeEnabled,
    }));
  }, []);

  // Copy Executive Briefing Markdown
  const handleCopyBriefingMarkdown = () => {
    if (!briefing?.markdown_content) return;
    navigator.clipboard.writeText(briefing.markdown_content).then(() => {
      setCopiedBriefing(true);
      setTimeout(() => setCopiedBriefing(false), 2000);
    });
  };

  const isPopped = bubble.popState === "POPPED" || bubble.popState === "SHREDDING" || bubble.popState === "POPPING" || bubble.popState === "EXPORTING";

  // Build the appropriate notification message based on pop state, reason, and retention
  const popBanner = (() => {
    if (!isPopped) return null;

    const isTimer = popReason === "timer_expired";
    const isPermanent = retentionPolicy === "permanent";
    const isPlusRecord = retentionPolicy === "temporary-plus-record";

    let icon = "⏱️";
    let title = "";
    let detail = popMessage || "";
    let color = "amber";

    if (bubble.popState === "POPPING") {
      icon = "⏱️";
      title = isTimer ? "Time's up — popping bubble..." : "Host initiated pop...";
      detail = "Generating executive briefing and exporting records. Please wait.";
      color = "amber";
    } else if (bubble.popState === "EXPORTING") {
      icon = "📤";
      title = "Exporting executive briefing...";
      detail = "Delivering records to configured destinations (Slack, Notion, Linear, Jira).";
      color = "blue";
    } else if (bubble.popState === "SHREDDING") {
      icon = "🔐";
      title = "Crypto-shredding session data...";
      detail = isPermanent ? "Not shredding — permanent retention." : "All session content is being permanently destroyed.";
      color = "rose";
    } else if (bubble.popState === "POPPED") {
      icon = isTimer ? "⏱️" : "💥";
      title = isTimer ? "This bubble's timer has expired" : "This bubble has been popped";
      if (!detail) {
        if (isPermanent) {
          detail = "All session data is retained for permanent reference.";
        } else if (isPlusRecord) {
          detail = "Session data has been crypto-shredded. Executive briefing and export records are retained.";
        } else {
          detail = "All session data has been permanently crypto-shredded. Executive records have been exported.";
        }
      }
      color = "rose";
    }

    const colorClasses: Record<string, { bg: string; border: string; text: string; button: string }> = {
      amber: { bg: "bg-amber-950/80", border: "border-amber-500/40", text: "text-amber-200", button: "bg-amber-600 hover:bg-amber-500" },
      blue:  { bg: "bg-blue-950/80",  border: "border-blue-500/40",  text: "text-blue-200",  button: "bg-blue-600 hover:bg-blue-500" },
      rose:  { bg: "bg-rose-950/80",  border: "border-rose-500/40",  text: "text-rose-200",  button: "bg-rose-600 hover:bg-rose-500" },
    };
    const c = colorClasses[color] || colorClasses.rose;

    return (
      <div className={`${c.bg} ${c.border} border-b px-5 py-2.5 flex items-center justify-between text-xs ${c.text} shrink-0`}>
        <div className="flex items-center gap-2.5 min-w-0">
          <span className="text-base shrink-0">{icon}</span>
          <div className="min-w-0">
            <strong className="block">{title}</strong>
            <span className="opacity-90 text-[11px]">{detail}</span>
          </div>
        </div>
        {bubble.popState === "POPPED" && (
          <button
            onClick={() => setShowBriefingModal(true)}
            className={`px-3 py-1 rounded-lg ${c.button} text-white font-semibold transition-colors shrink-0 ml-3`}
          >
            View Briefing Record
          </button>
        )}
      </div>
    );
  })();

  return (
    <div className="flex flex-col h-screen bg-[#0d0f1a] text-slate-100 overflow-hidden selection:bg-violet-500/30">
      <Header
        bubble={bubble}
        role={role}
        onOpenManage={() => setIsManageOpen(true)}
        currentUser={user}
        onOpenAuthModal={() => setIsAuthModalOpen(true)}
        onSignOut={signOut}
      />

      {/* Upfront Auth Gate if not signed in */}
      {!authLoading && (!user || !user.displayName) && (
        <AuthModal
          isOpen={true}
          title="Sign In to Enter Bubble"
          subtitle={`Please sign in beforehand to join deliberation in "${bubble.title}".`}
          onSuccess={(signedInUser) => {
            setIsAuthModalOpen(false);
            if (bubble.hostId && bubble.hostId === signedInUser.uid) {
              setRole("host");
            } else {
              setRole("participant");
              // Register participant with backend
              joinBubble(bubble.id, {
                display_name: signedInUser.displayName || "Participant",
                avatar_url: signedInUser.photoURL || undefined,
              }).catch(() => {});
            }
          }}
        />
      )}

      {/* Auth Modal Triggered from Header */}
      {isAuthModalOpen && (
        <AuthModal
          isOpen={true}
          onClose={() => setIsAuthModalOpen(false)}
          title="Switch Account / Identity"
          subtitle="Change your active profile to test Host vs Participant workflows."
          onSuccess={(signedInUser) => {
            setIsAuthModalOpen(false);
            if (bubble.hostId && bubble.hostId === signedInUser.uid) {
              setRole("host");
            } else {
              setRole("participant");
            }
          }}
        />
      )}

      {/* Pop State Banner — shown during all pop stages with appropriate message */}
      {popBanner}

      {/* Main two-column layout */}
      <main className="flex-1 flex gap-0 overflow-hidden px-4 py-4 min-h-0">
        {/* Left: Live Deliberation Feed */}
        <div className="flex-1 min-w-0 flex flex-col bg-[#0f1525] rounded-2xl border border-white/5 p-4 mr-3 overflow-hidden shadow-xl">
          <ContributionFeed
            bubbleId={bubble.id}
            userId={user?.uid || "guest"}
            userName={user?.displayName || initialUserName || "Participant"}
            contributions={bubble.contributions}
            isAnonymous={bubble.anonymousModeEnabled}
            onToggleAnonymous={role === "host" ? handleToggleAnonymous : undefined}
            newCount={newCount}
            typingUsers={typingUsers}
            onNewContribution={handleNewContribution}
          />
        </div>

        {/* Right: Live Intelligence & Knowledge Graph */}
        <div className="w-[450px] shrink-0 flex flex-col bg-[#0f1525] rounded-2xl border border-white/5 p-4 overflow-hidden shadow-xl">
          <LiveIntelligencePanel
            intelligence={bubble.intelligence}
            knowledgeGraph={knowledgeGraph}
            streamingToken={streamingToken}
            isSynthesizing={isSynthesizing}
            aiResponse={aiResponse}
            isAIResponding={isAIResponding}
            onRefreshGraph={handleRefreshGraph}
          />
        </div>
      </main>

      {/* Host-only: Manage Bubble overlay */}
      {role === "host" && isManageOpen && (
        <ManageBubblePanel
          bubble={bubble}
          onClose={() => setIsManageOpen(false)}
          onToggleAnonymous={handleToggleAnonymous}
          onBubbleUpdated={(updated) => setBubble((prev) => ({ ...prev, ...updated }))}
          onBubblePopped={(state) => {
            setBubble((prev) => ({ ...prev, popState: state, isLive: false }));
            loadBriefingModal();
          }}
        />
      )}

      {/* Executive Briefing Record Modal */}
      {showBriefingModal && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-md z-50 flex items-center justify-center p-4">
          <div className="bg-[#111827] border border-violet-500/30 rounded-2xl max-w-2xl w-full max-h-[85vh] overflow-y-auto p-6 shadow-2xl flex flex-col gap-5">
            <div className="flex items-center justify-between pb-3 border-b border-white/10">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-violet-600/20 border border-violet-500/30 flex items-center justify-center text-violet-400 text-xl">
                  📋
                </div>
                <div>
                  <h3 className="text-white font-bold text-lg">Executive Decision Briefing</h3>
                  <p className="text-slate-400 text-xs">Generated upon session pop and exported to destinations</p>
                </div>
              </div>
              <div className="flex flex-col items-end gap-1">
                <button
                  onClick={() => {
                    setShowBriefingModal(false);
                    router.push("/");
                  }}
                  className="text-slate-400 hover:text-white text-sm"
                >
                  ✕
                </button>
                <span className="text-[10px] text-slate-500 animate-pulse">Redirecting to home…</span>
              </div>
            </div>

            {/* Summary — real data from backend */}
            <div className="rounded-xl bg-[#161d2e] border border-white/10 p-4">
              <h4 className="text-xs font-semibold uppercase tracking-wider text-violet-300 mb-1.5">
                Executive Synthesis
              </h4>
              <p className="text-sm text-slate-200 leading-relaxed">
                {briefing?.executive_summary || bubble.intelligence.summary || "Session deliberation completed and exported."}
              </p>
            </div>

            {/* Decisions */}
            {briefing?.decisions && briefing.decisions.length > 0 && (
              <div className="flex flex-col gap-2">
                <h4 className="text-xs font-semibold uppercase tracking-wider text-emerald-300">Decisions Made</h4>
                <ul className="flex flex-col gap-1.5">
                  {briefing.decisions.map((d, i) => (
                    <li key={i} className="flex items-start gap-2 text-xs text-slate-200 bg-[#161d2e] rounded-lg p-2.5 border border-white/5">
                      <span className="text-emerald-400 font-bold shrink-0">✓</span>
                      <span>{d}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Action Items */}
            {briefing?.action_items && briefing.action_items.length > 0 && (
              <div className="flex flex-col gap-2">
                <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-300">
                  Action Items
                </h4>
                <div className="flex flex-col gap-2">
                  {briefing.action_items.map((item, idx) => (
                    <div
                      key={idx}
                      className="flex items-center justify-between rounded-xl bg-[#161d2e] border border-white/5 p-3 text-xs"
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="text-emerald-400 font-bold shrink-0">✓</span>
                        <span className="text-slate-200 truncate">{item.task}</span>
                      </div>
                      <div className="flex items-center gap-2 shrink-0 ml-2">
                        {item.owner && (
                          <span className="px-2 py-0.5 rounded bg-violet-900/40 text-violet-300 font-medium">
                            {item.owner}
                          </span>
                        )}
                        <span className={`text-[10px] uppercase font-bold px-1.5 py-0.5 rounded border ${
                          item.priority === "high" || item.priority === "critical"
                            ? "text-rose-400 bg-rose-950/40 border-rose-500/20"
                            : "text-amber-400 bg-amber-950/40 border-amber-500/20"
                        }`}>
                          {item.priority}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Disagreements */}
            {briefing?.disagreements && briefing.disagreements.length > 0 && (
              <div className="flex flex-col gap-2">
                <h4 className="text-xs font-semibold uppercase tracking-wider text-amber-300">
                  Unresolved Disagreements
                </h4>
                <div className="flex flex-col gap-2">
                  {briefing.disagreements.map((dis, idx) => (
                    <div
                      key={idx}
                      className="rounded-xl bg-amber-950/20 border border-amber-500/20 p-3 text-xs flex flex-col gap-1"
                    >
                      <span className="font-semibold text-amber-300">{dis.topic}</span>
                      <p className="text-slate-300">
                        {dis.perspective_a} <em>vs</em> {dis.perspective_b}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Actions */}
            <div className="flex items-center justify-between pt-3 border-t border-white/10">
              <span className="text-xs text-slate-500">
                Cryptographically shredded &amp; exported
              </span>
              <div className="flex items-center gap-2">
                {briefing?.markdown_content && (
                  <button
                    onClick={handleCopyBriefingMarkdown}
                    className="px-3.5 py-2 rounded-xl bg-[#161d2e] hover:bg-[#1a2236] border border-white/10 text-xs font-medium text-slate-200 transition-colors"
                  >
                    {copiedBriefing ? "✓ Copied!" : "Copy Markdown"}
                  </button>
                )}
                <button
                  onClick={() => {
                    setShowBriefingModal(false);
                    router.push("/");
                  }}
                  className="px-4 py-2 rounded-xl bg-violet-600 hover:bg-violet-500 text-xs font-semibold text-white transition-colors"
                >
                  Go Home
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
