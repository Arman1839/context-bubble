import Link from "next/link";

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-[#0d0f1a] text-slate-100 flex flex-col selection:bg-violet-500/30">
      {/* Navigation Header */}
      <header className="border-b border-white/10 bg-[#111827]/80 backdrop-blur-md sticky top-0 z-50">
        <div className="max-w-6xl mx-auto px-5 py-3.5 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2.5 group">
            <div className="w-8 h-8 rounded-full bg-gradient-to-br from-violet-500 to-indigo-600 flex items-center justify-center text-white font-bold text-sm shadow-md group-hover:scale-105 transition-transform">
              C
            </div>
            <span className="font-semibold text-white text-base tracking-wide">Context Bubble</span>
          </Link>

          <nav className="flex items-center gap-3">
            <Link
              href="/bubble/demo"
              className="text-xs text-slate-300 hover:text-white px-3 py-1.5 rounded-lg hover:bg-white/5 transition-colors hidden sm:inline-flex items-center gap-1.5"
            >
              <span className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />
              Live Demo
            </Link>
            <Link
              href="/join"
              className="text-xs font-medium text-slate-200 hover:text-white px-3 py-1.5 rounded-lg border border-white/10 hover:bg-[#1a2236] transition-colors"
            >
              Join Bubble
            </Link>
            <Link
              href="/bubble/create"
              className="text-xs font-semibold text-white px-3.5 py-1.5 rounded-lg bg-violet-600 hover:bg-violet-500 shadow-md shadow-violet-900/30 transition-colors"
            >
              Create Bubble
            </Link>
          </nav>
        </div>
      </header>

      {/* Hero Section */}
      <main className="flex-1 max-w-6xl mx-auto px-5 py-16 sm:py-24 flex flex-col items-center text-center">
        {/* Badge */}
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-violet-500/10 border border-violet-500/20 text-violet-300 text-xs font-medium mb-6">
          <span className="w-2 h-2 rounded-full bg-violet-400 animate-pulse" />
          Real-time Collaborative Intelligence
        </div>

        {/* Main Headline */}
        <h1 className="text-4xl sm:text-6xl font-extrabold tracking-tight text-white max-w-3xl leading-[1.15]">
          Make high-stakes team decisions{" "}
          <span className="bg-gradient-to-r from-violet-400 via-indigo-300 to-purple-400 bg-clip-text text-transparent">
            without losing context
          </span>
        </h1>

        {/* Subtitle */}
        <p className="mt-6 text-base sm:text-lg text-slate-300 max-w-2xl leading-relaxed">
          Context Bubble is a temporary, focused space for 3–8 people. Drop thoughts, links, and concerns while live intelligence maps agreements, pinpoints contradictions, and suggests clear next steps.
        </p>

        {/* Call to Actions */}
        <div className="mt-8 flex flex-col sm:flex-row items-center gap-3 w-full max-w-md">
          <Link
            href="/bubble/create"
            className="w-full sm:w-auto flex-1 flex items-center justify-center gap-2 px-6 py-3 rounded-xl bg-violet-600 hover:bg-violet-500 text-white font-medium text-sm shadow-lg shadow-violet-900/40 hover:shadow-violet-800/50 transition-all"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4v16m8-8H4" />
            </svg>
            Create a Bubble
          </Link>
          <Link
            href="/join"
            className="w-full sm:w-auto flex-1 flex items-center justify-center gap-2 px-6 py-3 rounded-xl bg-[#161d2e] hover:bg-[#1f2942] border border-white/10 text-slate-200 font-medium text-sm transition-all"
          >
            <svg className="w-4 h-4 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M11 16l-4-4m0 0l4-4m-4 4h14m-5 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h7a3 3 0 013 3v1" />
            </svg>
            Join a Bubble
          </Link>
        </div>

        {/* Direct Link to Demo */}
        <div className="mt-4 text-xs text-slate-400">
          Want to see it in action first?{" "}
          <Link href="/bubble/demo" className="text-violet-400 hover:text-violet-300 font-medium underline underline-offset-4">
            Explore the live sample bubble &rarr;
          </Link>
        </div>

        {/* Visual Preview Card */}
        <div className="mt-14 w-full rounded-2xl border border-white/10 bg-[#0f1525] p-5 sm:p-6 shadow-2xl relative overflow-hidden text-left">
          <div className="flex flex-wrap items-center justify-between gap-3 pb-4 mb-4 border-b border-white/10">
            <div className="flex items-center gap-2.5">
              <span className="w-2.5 h-2.5 rounded-full bg-green-400 animate-pulse" />
              <span className="text-white text-sm font-semibold">Active Session: Pivot Decision – Oct 2026</span>
              <span className="text-xs px-2 py-0.5 rounded bg-violet-900/40 border border-violet-500/30 text-violet-300 font-medium">Demo Room</span>
            </div>
            <div className="text-xs text-slate-400 flex items-center gap-1.5">
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <circle cx="12" cy="12" r="10" strokeWidth="2" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 6v6l4 2" />
              </svg>
              Auto-expires in 2h 00m
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Live Contributions snippet */}
            <div className="rounded-xl border border-white/5 bg-[#161d2e] p-3.5 flex flex-col gap-2.5">
              <div className="flex items-center justify-between text-xs font-semibold text-slate-300">
                <span className="flex items-center gap-1.5">
                  <span className="text-violet-400">⚡</span> Live Stream
                </span>
                <span className="text-slate-500 text-[11px]">1m ago</span>
              </div>
              <p className="text-xs text-slate-300">
                &ldquo;Retention dropped 18% after the last update. Users say onboarding is confusing.&rdquo;
              </p>
              <div className="text-[11px] text-slate-400 flex items-center gap-1.5 pt-1 border-t border-white/5">
                <span className="w-4 h-4 rounded-full bg-slate-700 flex items-center justify-center text-[10px]">P</span>
                <span>Priya &bull; Product Lead</span>
              </div>
            </div>

            {/* Live Intelligence snippet */}
            <div className="rounded-xl border border-violet-500/30 bg-violet-900/10 p-3.5 flex flex-col gap-2.5">
              <div className="flex items-center justify-between text-xs font-semibold text-violet-300">
                <span className="flex items-center gap-1.5">
                  <span>✨</span> Live Summary &amp; Tension Analysis
                </span>
                <span className="text-slate-400 text-[10px]">Auto-updating</span>
              </div>
              <p className="text-xs text-slate-300 leading-relaxed">
                The team agrees retention is urgent, but remains divided: 3 members point to onboarding friction vs 2 members suspect pricing pressure.
              </p>
              <div className="text-[11px] text-amber-300/90 flex items-center gap-1.5 pt-1 border-t border-violet-500/10 font-medium">
                <span>⚠️ Missing:</span> Latest cohort churn data not yet shared
              </div>
            </div>
          </div>
        </div>

        {/* Feature Highlights Section */}
        <section className="mt-20 w-full">
          <div className="text-center mb-10">
            <h2 className="text-2xl sm:text-3xl font-bold text-white">Designed for high-velocity alignment</h2>
            <p className="text-slate-400 text-sm mt-2 max-w-xl mx-auto">
              Everything teams need to collaborate quickly without fragmented chat threads and endless meetings.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 text-left">
            {/* Feature 1 */}
            <div className="rounded-2xl border border-white/10 bg-[#0f1525] p-6 hover:border-white/20 transition-all">
              <div className="w-10 h-10 rounded-xl bg-violet-600/20 border border-violet-500/30 flex items-center justify-center text-violet-400 text-lg mb-4">
                ✨
              </div>
              <h3 className="text-white font-semibold text-base mb-2">Live Evolving Intelligence</h3>
              <p className="text-slate-400 text-sm leading-relaxed">
                As messages and evidence flow in, AI continuously synthesizes consensus, isolates disagreements, highlights missing data, and suggests concrete action items.
              </p>
            </div>

            {/* Feature 2 */}
            <div className="rounded-2xl border border-white/10 bg-[#0f1525] p-6 hover:border-white/20 transition-all">
              <div className="w-10 h-10 rounded-xl bg-indigo-600/20 border border-indigo-500/30 flex items-center justify-center text-indigo-400 text-lg mb-4">
                👥
              </div>
              <h3 className="text-white font-semibold text-base mb-2">Anonymous Contribution Mode</h3>
              <p className="text-slate-400 text-sm leading-relaxed">
                Remove hierarchy biases with host-controlled anonymous mode. Encourage candid, radical truth-telling during critical architectural or pivot debates.
              </p>
            </div>

            {/* Feature 3 */}
            <div className="rounded-2xl border border-white/10 bg-[#0f1525] p-6 hover:border-white/20 transition-all">
              <div className="w-10 h-10 rounded-xl bg-amber-600/20 border border-amber-500/30 flex items-center justify-center text-amber-400 text-lg mb-4">
                ⏳
              </div>
              <h3 className="text-white font-semibold text-base mb-2">Flexible Auto-Expiry</h3>
              <p className="text-slate-400 text-sm leading-relaxed">
                Temporary bubbles vanish automatically after your decision window closes, or retain an approved Decision Record summary for permanent documentation.
              </p>
            </div>
          </div>
        </section>

        {/* Footer */}
        <footer className="mt-24 pt-8 border-t border-white/10 w-full flex flex-col sm:flex-row items-center justify-between text-xs text-slate-500 gap-4">
          <div className="flex items-center gap-2">
            <span className="font-semibold text-slate-400">Context Bubble</span>
            <span>&bull;</span>
            <span>Hackathon Frontend Prototype</span>
          </div>
          <div className="flex items-center gap-4">
            <Link href="/bubble/create" className="hover:text-slate-300 transition-colors">Create Bubble</Link>
            <Link href="/join" className="hover:text-slate-300 transition-colors">Join Bubble</Link>
            <Link href="/bubble/demo" className="hover:text-slate-300 transition-colors">Sample Workspace</Link>
          </div>
        </footer>
      </main>
    </div>
  );
}
