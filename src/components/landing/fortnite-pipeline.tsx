"use client";

import { useEffect, useRef, useState, useMemo } from "react";

/* ─── Text content for each side of the ribbon ───────────────────── */
const JSON_FRAGMENTS = [
  '"seasonLevels":[{"season":40,"level":152}]',
  '"kills":302,"matchesplayed":54',
  '"placetop1":12,"score":18090',
  '"trio":{"kills":220,"matchesplayed":52}',
  '"solo":{"kills":24,"score":1282}',
  '"divisionName":"Unreal"',
  '"currentPlayerRanking":3596',
  '"success":true',
];

const OUTPUT_FRAGMENTS = [
  "NIVEL 152",
  "K/D 4.82",
  "WIN RATE 28.8%",
  "38 VICTORIAS",
  "RANK UNREAL",
  "#3,596 GLOBAL",
  "132 PARTIDAS",
  "754 KILLS",
];

const jsonText = JSON_FRAGMENTS.join("  ·  ");
const fullJson = `${jsonText}  ·  ${jsonText}  ·  `;

const outputText = OUTPUT_FRAGMENTS.join("  ◆  ");
const fullOutput = `${outputText}  ◆  ${outputText}  ◆  `;

/* ─── Waveform capsule — pure CSS, reduced bar count ─────────────── */
function WaveformCapsule({ active, onReplay }: { active: boolean; onReplay?: () => void }) {
  /* Reduced from 18 → 10 bars. Same visual effect, ~45% fewer animations */
  const bars = 10;

  const barStyles = useMemo(
    () =>
      Array.from({ length: bars }).map((_, i) => {
        const peak =
          4 + Math.sin((i / (bars - 1)) * Math.PI) * 14 + (i % 3) * 2;
        return {
          "--bar-peak": `${peak / 2}`,
          animationDelay: `${i * 60}ms`,
          animationDuration: `${500 + (i % 3) * 100}ms`,
        } as React.CSSProperties;
      }),
    []
  );

  return (
    <div className="relative flex items-center justify-center z-20 group">
      {/* Subtle glow — CSS animation */}
      <div
        className={`absolute rounded-full pointer-events-none ${active ? "pipeline-glow-active" : ""}`}
        style={{
          width: 120,
          height: 120,
          background:
            "radial-gradient(circle, rgba(32,78,70,0.12) 0%, transparent 70%)",
          opacity: active ? undefined : 0.1,
        }}
      />

      {/* Pill shape - Now a button for replay */}
      <button 
        onClick={onReplay}
        disabled={active}
        aria-label="Replay animation"
        className="relative flex items-center justify-center px-6 py-3 rounded-full border-2 border-[#1E3932] bg-[#F5F0E8] shadow-[0_4px_24px_rgba(30,57,50,0.12)] transition-transform hover:scale-105 active:scale-95 disabled:hover:scale-100 disabled:cursor-default"
      >
        <div className={`flex items-center gap-[3px] h-5 transition-opacity ${!active ? "opacity-30 group-hover:opacity-0" : ""}`}>
          {barStyles.map((style, i) => (
            <div
              key={i}
              className={`w-[2px] rounded-full bg-[#1E3932] ${active ? "pipeline-bar-active" : ""}`}
              style={{
                height: active ? undefined : 2,
                transformOrigin: "center",
                ...style,
              }}
            />
          ))}
        </div>
        
        {/* Play icon visible only when not active and hovered */}
        {!active && (
          <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
            <svg viewBox="0 0 24 24" fill="currentColor" className="w-6 h-6 text-[#1E3932] ml-1">
              <path d="M8 5v14l11-7z" />
            </svg>
          </div>
        )}
      </button>
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════════ */
/*  FORTNITE PIPELINE — Curved Ribbon                               */
/* ══════════════════════════════════════════════════════════════════ */
export function FortnitePipeline() {
  const sectionRef = useRef<HTMLDivElement>(null);
  const [phase, setPhase] = useState<"idle" | "running" | "done">("idle");

  /* Track if tab is visible at all */
  const [tabVisible, setTabVisible] = useState(true);

  useEffect(() => {
    const handler = () => setTabVisible(document.visibilityState === "visible");
    document.addEventListener("visibilitychange", handler);
    return () => document.removeEventListener("visibilitychange", handler);
  }, []);

  /* Native IntersectionObserver instead of framer-motion useInView */
  useEffect(() => {
    const el = sectionRef.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setPhase((prev) => (prev === "idle" ? "running" : prev));
          obs.disconnect();
        }
      },
      { threshold: 0.15 }
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  useEffect(() => {
    if (phase === "running") {
      const t = setTimeout(() => setPhase("done"), 15000);
      return () => clearTimeout(t);
    }
  }, [phase]);

  const handleReplay = () => {
    if (phase === "done") {
      setPhase("running");
    }
  };

  /*
   * SVG textPath animation runs ONLY during the 3.5s "running" phase.
   * After that the text stays static — no more per-frame SVG relayout.
   * The waveform uses CSS and stays active when visible.
   */
  const textAnimating = phase === "running" && tabVisible;
  /* Stop waveform after done — no infinite animations */
  const waveformActive = phase === "running" && tabVisible;

  const leftPath = "M -400,10 C -50,10 100,200 600,200";
  const rightPath = "M 600,200 C 1100,200 1250,10 1600,10";
  const fullPath =
    "M -400,10 C -50,10 100,100 600,300 C 1100,200 1250,10 1600,10";

  /* CSS classes for fade-in instead of framer-motion */
  const ribbonVisible = phase !== "idle";

  return (
    <section
      ref={sectionRef}
      className="py-10 lg:py-14 relative overflow-hidden"
    >
      <style>{`
        @keyframes pipeline-bar-pulse {
          0%, 100% { transform: scaleY(1); }
          50%       { transform: scaleY(var(--bar-peak, 1)); }
        }
        .pipeline-bar-active {
          animation-name: pipeline-bar-pulse;
          animation-timing-function: ease-in-out;
          animation-iteration-count: infinite;
          height: 2px !important;
        }

        @keyframes pipeline-glow {
          0%, 100% { transform: scale(1); opacity: 0.3; }
          50%      { transform: scale(1.5); opacity: 0.6; }
        }
        .pipeline-glow-active {
          animation: pipeline-glow 2.5s ease-in-out infinite;
        }

        /* CSS fade-in replacements for framer-motion */
        .pipeline-fade-in {
          opacity: 0;
          transition: opacity 0.8s ease-out 0.2s;
        }
        .pipeline-fade-in.visible {
          opacity: 1;
        }

        @media (prefers-reduced-motion: reduce) {
          .pipeline-bar-active,
          .pipeline-glow-active {
            animation: none !important;
          }
          .pipeline-fade-in {
            transition: none !important;
            opacity: 1 !important;
            transform: none !important;
          }
        }
      `}</style>

      <div className="max-w-7xl mx-auto px-6">

        {/* ── Curved ribbon ─────────────────────────────────────── */}
        <div
          className={`relative pipeline-fade-in ${ribbonVisible ? "visible" : ""}`}
        >

          {/* SVG canvas */}
          <div
            className="relative w-full"
            style={{ aspectRatio: "1200 / 340" }}
          >
            <svg
              viewBox="0 0 1200 340"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
              className="absolute inset-0 w-full h-full"
              style={{ overflow: "visible" }}
            >
              <defs>
                <path id="fullCurve" d={fullPath} />
                <path id="leftCurve" d={leftPath} />
                <path id="rightCurve" d={rightPath} />

                <linearGradient
                  id="ribbonGradRight"
                  x1="0" y1="0" x2="1" y2="0"
                >
                  <stop offset="0%" stopColor="#1E3932" stopOpacity="1" />
                  <stop offset="85%" stopColor="#1E3932" stopOpacity="1" />
                </linearGradient>

                <linearGradient
                  id="ribbonGradLeft"
                  x1="0" y1="0" x2="1" y2="0"
                >
                  <stop offset="0%" stopColor="#1E3932" stopOpacity="0" />
                  <stop offset="15%" stopColor="#1E3932" stopOpacity="0.06" />
                  <stop offset="85%" stopColor="#1E3932" stopOpacity="0.06" />
                  <stop offset="100%" stopColor="#1E3932" stopOpacity="0.12" />
                </linearGradient>
              </defs>

              {/* ── LEFT HALF: transparent track ──────────────────── */}
              <use
                href="#leftCurve"
                stroke="url(#ribbonGradLeft)"
                strokeWidth="46"
                strokeLinecap="round"
              />
              <use
                href="#leftCurve"
                stroke="rgba(30,57,50,0.10)"
                strokeWidth="46"
                strokeLinecap="round"
                strokeDasharray="2 6"
              />

              {/* ── RIGHT HALF: dark solid ribbon ────────────────── */}
              <use
                href="#rightCurve"
                stroke="rgba(30,57,50,0.04)"
                strokeWidth="64"
                strokeLinecap="round"
              />
              <use
                href="#rightCurve"
                stroke="url(#ribbonGradRight)"
                strokeWidth="46"
                strokeLinecap="round"
              />

              {/* ── JSON text on left half ─────────────────────────
                   Animation only runs during the 3.5s "running" phase,
                   then the text is rendered static to save energy.    */}
              <text
                fill="rgba(30,57,50,0.35)"
                fontSize="13"
                fontFamily="monospace"
                letterSpacing="0.6"
              >
                <textPath href="#leftCurve">
                  {fullJson}
                  {textAnimating && (
                    <animate
                      attributeName="startOffset"
                      from="-100%"
                      to="0%"
                      dur="50s"
                      repeatCount="indefinite"
                    />
                  )}
                </textPath>
              </text>

              {/* ── Output text on right half ────────────────────── */}
              <text
                fill="rgba(255,255,255,0.85)"
                fontSize="13"
                fontFamily="monospace"
                letterSpacing="0.6"
              >
                <textPath href="#rightCurve">
                  {fullOutput}
                  {textAnimating && (
                    <animate
                      attributeName="startOffset"
                      from="-100%"
                      to="0%"
                      dur="45s"
                      repeatCount="indefinite"
                    />
                  )}
                </textPath>
              </text>
            </svg>

            {/* Waveform capsule */}
            <div
              className="absolute"
              style={{
                left: "50%",
                bottom: "4%",
                transform: "translateX(-50%)",
              }}
            >
              <div className="absolute top-0 left-1/2 -translate-x-1/2 -translate-y-38.5">
                <WaveformCapsule active={waveformActive} onReplay={handleReplay} />
              </div>
            </div>
          </div>
        </div>


      </div>
    </section>
  );
}
