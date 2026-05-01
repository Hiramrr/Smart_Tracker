"use client";

import Link from "next/link";
import { useState, useEffect, useRef } from "react";
import { FortniteLlama } from "@/components/landing/fortnite-llama";
import { LolLogo } from "@/components/landing/lol-logo";
import {
  CurvedLine,
  DottedCircle,
  PlusDecorator,
  Sparkle,
  Diamond,
  Ring,
  SmallDot,
  LightSparkle,
  LightRing,
} from "@/components/landing/decorators";
import { FortnitePipeline } from "@/components/landing/fortnite-pipeline";

function GithubIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className}>
      <path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0024 12c0-6.63-5.37-12-12-12z" />
    </svg>
  );
}

/* Inline Menu icon (replaces lucide-react Menu) */
function MenuIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className={className}>
      <path d="M4 12h16M4 6h16M4 18h16" />
    </svg>
  );
}

/* Inline X icon (replaces lucide-react X) */
function XIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className={className}>
      <path d="M18 6L6 18M6 6l12 12" />
    </svg>
  );
}

/* ─── CSS IntersectionObserver hook (replaces framer-motion whileInView) ── */
function useInViewOnce(threshold = 0.2) {
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      ([e]) => { if (e.isIntersecting) { setVisible(true); obs.disconnect(); } },
      { threshold }
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, [threshold]);
  return { ref, visible };
}

/* ─── Data ───────────────────────────────────────────────────────── */
const navLinks = [
  { label: "proyecto", href: "#hero", active: true },
  { label: "fuentes", href: "#sources" },
  { label: "dashboard", href: "#features" },
  { label: "docs", href: "#cta" },
];

const featureStrip = [
  {
    icon: (
      <svg viewBox="0 0 24 24" fill="none" className="w-5 h-5" stroke="#204E46" strokeWidth="2" strokeLinecap="round">
        <path d="M12 5V19M5 12H19" />
      </svg>
    ),
    title: null,
    description: (
      <>
        Enfocado en rendimiento.
        <br />
        Impulsado por <span className="text-miyu-accent font-semibold">datos</span>.
      </>
    ),
  },
  {
    icon: (
      <svg viewBox="0 0 24 24" fill="none" className="w-5 h-5">
        <path d="M3 20V4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        <path d="M3 20h18" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        <path d="M7 14l3-6 4 3 4-5" stroke="#204E46" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        <circle cx="7" cy="14" r="1.5" fill="#204E46" />
        <circle cx="10" cy="8" r="1.5" fill="#204E46" />
        <circle cx="14" cy="11" r="1.5" fill="#204E46" />
        <circle cx="18" cy="6" r="1.5" fill="#204E46" />
      </svg>
    ),
    title: "métricas clave",
    description: "Win rate, KDA, daño, visión, posiciones y más.",
  },
  {
    icon: (
      <svg viewBox="0 0 24 24" fill="none" className="w-5 h-5">
        <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
        <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" fill="#204E46" opacity="0.08" />
        <path d="M9 12l2 2 4-4" stroke="#204E46" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    ),
    title: "análisis competitivo",
    description: "Comparativas, leaderboards y seguimiento de rendimiento.",
  },
  {
    icon: (
      <svg viewBox="0 0 24 24" fill="none" className="w-5 h-5">
        <path d="M21 2v6h-6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M3 12a9 9 0 0115.36-6.36L21 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M3 22v-6h6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M21 12a9 9 0 01-15.36 6.36L3 16" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        <circle cx="12" cy="12" r="2" fill="#204E46" opacity="0.3" />
      </svg>
    ),
    title: "actualizaciones constantes",
    description: "Datos actualizados desde APIs oficiales y especializadas.",
  },
];

const fortniteFeatures = [
  "Estadísticas de jugadores",
  "Torneos y leaderboards",
  "Historial de partidas",
  "Objetos y cosméticos",
];

const lolFeatures = [
  "Ranked y leaderboards",
  "Historial de partidas",
  "Datos de campeones",
  "Partidas en tiempo real",
];

const capabilities = [
  {
    icon: (
      <svg viewBox="0 0 32 32" fill="none" className="w-8 h-8">
        <rect x="2" y="2" width="28" height="28" rx="8" fill="#204E46" opacity="0.08" />
        <path d="M20 23v-1.5a3 3 0 00-3-3h-4a3 3 0 00-3 3V23" stroke="#204E46" strokeWidth="1.5" strokeLinecap="round" />
        <circle cx="15" cy="13" r="2.5" stroke="#204E46" strokeWidth="1.5" />
        <path d="M24 23v-1.5a3 3 0 00-2.5-2.96" stroke="#204E46" strokeWidth="1.5" strokeLinecap="round" />
        <circle cx="21" cy="13" r="2.5" stroke="#204E46" strokeWidth="1.5" />
      </svg>
    ),
    title: "compara jugadores",
    description:
      "Compara rendimiento entre jugadores, equipos o regiones con métricas clave.",
  },
  {
    icon: (
      <svg viewBox="0 0 32 32" fill="none" className="w-8 h-8">
        <rect x="2" y="2" width="28" height="28" rx="8" fill="#204E46" opacity="0.08" />
        <path d="M8 16h3l2.5 6 5-12 2.5 6H24" stroke="#204E46" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    ),
    title: "sigue tu evolución",
    description:
      "Visualiza tu progreso a lo largo del tiempo y detecta patrones de mejora.",
  },
  {
    icon: (
      <svg viewBox="0 0 32 32" fill="none" className="w-8 h-8">
        <rect x="2" y="2" width="28" height="28" rx="8" fill="#204E46" opacity="0.08" />
        <path d="M16 8l2 4h4l-3 3 1 4-4-2-4 2 1-4-3-3h4l2-4z" stroke="#204E46" strokeWidth="1.5" strokeLinejoin="round" />
        <path d="M16 8l2 4h4l-3 3 1 4-4-2-4 2 1-4-3-3h4l2-4z" fill="#204E46" opacity="0.12" />
        <path d="M10 24h12" stroke="#204E46" strokeWidth="1.5" strokeLinecap="round" />
      </svg>
    ),
    title: "torneos y rankings",
    description:
      "Explora torneos, rankings y estadísticas competitivas actualizadas.",
  },
  {
    icon: (
      <svg viewBox="0 0 32 32" fill="none" className="w-8 h-8">
        <rect x="2" y="2" width="28" height="28" rx="8" fill="#204E46" opacity="0.08" />
        <circle cx="16" cy="16" r="7" stroke="#204E46" strokeWidth="1.5" />
        <circle cx="16" cy="16" r="7" fill="#204E46" opacity="0.06" />
        <circle cx="16" cy="14" r="1.2" fill="#204E46" />
        <path d="M16 17v3" stroke="#204E46" strokeWidth="1.5" strokeLinecap="round" />
      </svg>
    ),
    title: "decisiones informadas",
    description:
      "Usa datos reales para tomar mejores decisiones dentro y fuera del juego.",
  },
];

/* ─── Check icon ─────────────────────────────────────────────────── */
function Check() {
  return (
    <svg
      viewBox="0 0 18 18"
      fill="none"
      className="w-4 h-4 flex-shrink-0 mt-0.5"
    >
      <circle cx="9" cy="9" r="8" fill="#204E46" opacity="0.12" />
      <path
        d="M5.5 9.5L7.8 11.8L12.5 6.5"
        stroke="#204E46"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/* ═════════════════════════════════════════════════════════════════ */
/*  LANDING PAGE                                                    */
/* ═════════════════════════════════════════════════════════════════ */
export default function LandingPage() {
  const [menuOpen, setMenuOpen] = useState(false);
  const strip = useInViewOnce(0.3);
  const sources = useInViewOnce(0.2);
  const features = useInViewOnce(0.2);
  const cta = useInViewOnce(0.3);

  return (
    <>
      {/* CSS-only animations replacing framer-motion */}
      <style>{`
        .fade-up {
          opacity: 0;
          transform: translateY(24px);
          transition: opacity 0.5s ease-out, transform 0.5s ease-out;
        }
        .fade-up.visible { opacity: 1; transform: translateY(0); }
        .fade-up-d1 { transition-delay: 0.08s; }
        .fade-up-d2 { transition-delay: 0.16s; }
        .fade-up-d3 { transition-delay: 0.24s; }
        .fade-up-d4 { transition-delay: 0.32s; }
        .fade-in {
          opacity: 0;
          transition: opacity 0.8s ease-out;
        }
        .fade-in.visible { opacity: 1; }
        .fade-in-d1 { transition-delay: 0.4s; }
        
        /* Stagger utilities for children */
        .stagger-children.visible > *:nth-child(1) { transition-delay: 0.08s; }
        .stagger-children.visible > *:nth-child(2) { transition-delay: 0.16s; }
        .stagger-children.visible > *:nth-child(3) { transition-delay: 0.24s; }
        .stagger-children.visible > *:nth-child(4) { transition-delay: 0.32s; }

        @media (prefers-reduced-motion: reduce) {
          .fade-up, .fade-in {
            transition: none !important;
            opacity: 1 !important;
            transform: none !important;
          }
        }
      `}</style>
      {/* ─── 1. NAV ──────────────────────────────────────────── */}
      <nav
        id="nav"
        className="sticky top-0 z-50 bg-miyu-bg border-b border-miyu-border/50"
      >
        <div className="max-w-7xl mx-auto flex items-center justify-between px-6 py-4">
          {/* Logo */}
          <Link
            href="/"
            className="font-mono text-sm font-bold tracking-tight select-none"
            style={{ fontFamily: "var(--font-space-mono), monospace" }}
          >
            {">"}_&nbsp;smart.
          </Link>

          {/* Desktop links */}
          <div className="hidden md:flex items-center gap-8">
            {navLinks.map((l) => (
              <Link
                key={l.label}
                href={l.href!}
                className={`text-sm transition-colors hover:text-miyu-accent ${l.active
                    ? "text-miyu-text border-b-2 border-miyu-accent pb-0.5"
                    : "text-miyu-text-muted"
                  }`}
              >
                {l.label}
              </Link>
            ))}
          </div>

          {/* GitHub pill + mobile hamburger */}
          <div className="flex items-center gap-3">
            <a
              href="https://github.com/smart"
              target="_blank"
              rel="noopener noreferrer"
              className="hidden md:inline-flex items-center gap-2 border border-miyu-text rounded-full px-4 py-1.5 text-sm font-medium hover:bg-miyu-text hover:text-white transition-all"
            >
              <GithubIcon className="w-4 h-4" />
              GitHub
            </a>
            <button
              className="md:hidden p-1"
              onClick={() => setMenuOpen((v) => !v)}
              aria-label="Toggle menu"
            >
              {menuOpen ? <XIcon className="w-5 h-5" /> : <MenuIcon className="w-5 h-5" />}
            </button>
          </div>
        </div>

        {/* Mobile menu */}
        {menuOpen && (
          <div
            className="md:hidden border-t border-miyu-border bg-miyu-bg px-6 pb-4"
          >
            {navLinks.map((l) => (
              <Link
                key={l.label}
                href={l.href!}
                onClick={() => setMenuOpen(false)}
                className="block py-2 text-sm text-miyu-text-muted hover:text-miyu-accent"
              >
                {l.label}
              </Link>
            ))}
            <a
              href="https://github.com/smart"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 border border-miyu-text rounded-full px-4 py-1.5 text-sm font-medium mt-2 hover:bg-miyu-text hover:text-white transition-all"
            >
              <GithubIcon className="w-4 h-4" />
              GitHub
            </a>
          </div>
        )}
      </nav>

      {/* ─── 2. HERO ─────────────────────────────────────────── */}
      <section id="hero" className="relative overflow-hidden">
        {/* CSS float animations — GPU-composited, finite iterations */}
        <style>{`
          @keyframes hero-float {
            0%, 100% { transform: translateY(0); }
            50%      { transform: translateY(-14px); }
          }
          @keyframes hero-float-delayed {
            0%, 100% { transform: translateY(0); }
            50%      { transform: translateY(-10px); }
          }
          .hero-float {
            animation: hero-float 6s ease-in-out 3;
          }
          .hero-float-delayed {
            animation: hero-float-delayed 6s ease-in-out 1s 3;
          }
        `}</style>
        {/* Background decorators */}
        <CurvedLine className="absolute top-0 right-0 w-[500px] h-[500px] opacity-30 pointer-events-none hidden lg:block -z-10" />
        <DottedCircle className="absolute -top-10 right-[15%] w-[300px] h-[300px] opacity-20 pointer-events-none hidden lg:block -z-10" />
        <SmallDot className="absolute top-[30%] left-[5%] w-3 h-3 opacity-40 pointer-events-none hidden lg:block -z-10" />
        <PlusDecorator className="absolute bottom-[10%] left-[10%] w-5 h-5 opacity-30 pointer-events-none hidden lg:block -z-10" />
        <LightRing className="absolute top-[25%] left-[25%] w-24 h-24 pointer-events-none hidden lg:block -z-10" />
        <LightSparkle className="absolute bottom-[20%] left-[30%] w-8 h-8 pointer-events-none hidden lg:block -z-10" />

        <div className="max-w-7xl mx-auto px-6 pt-16 pb-24 lg:pt-20 lg:pb-32">
          <div className="grid grid-cols-1 lg:grid-cols-5 gap-12 items-center">
            {/* Left column (3/5) — CSS stagger on mount */}
            <div className={`lg:col-span-3 space-y-6 stagger-children visible`}>
              <p
                className="fade-up visible text-[13px] text-miyu-text-muted tracking-wide"
                style={{ fontFamily: "var(--font-space-mono), monospace" }}
              >
                [ fortnite &amp; league of legends stats ]
              </p>

              <h1
                className="fade-up visible text-[clamp(40px,6vw,72px)] font-bold leading-[1.05] tracking-tight"
              >
                analizamos partidas.
                <br />
                entendemos{" "}
                <span className="text-miyu-accent">el juego.</span>
              </h1>

              <p
                className="fade-up visible text-base text-miyu-text-muted max-w-[380px] leading-relaxed"
              >
                Proyecto de análisis de datos competitivos para Fortnite y
                League of Legends. Extraemos, transformamos y visualizamos
                estadísticas que te ayudan a mejorar.
              </p>

              <div className="fade-up visible flex flex-wrap items-center gap-4 pt-2">
                <Link
                  href="#features"
                  className="inline-flex items-center justify-center gap-2 bg-miyu-btn text-miyu-text border-2 border-miyu-text px-8 py-3.5 rounded-full text-sm font-bold hover:bg-miyu-btn-hover transition-colors text-center"
                >
                  Conoce el proyecto
                  <span className="ml-1">→</span>
                </Link>
                <Link
                  href="#sources"
                  className="text-sm font-medium text-miyu-text relative group"
                >
                  ver fuentes
                  <span className="absolute -bottom-0.5 left-0 w-0 h-[1.5px] bg-miyu-accent transition-all duration-300 group-hover:w-full" />
                </Link>
              </div>
            </div>

            {/* Right column (2/5) — floating graphics, CSS fade-in */}
            <div
              className="lg:col-span-2 relative hidden lg:flex items-center justify-center min-h-[350px] fade-in fade-in-d1 visible"
            >
              {/* Decorators */}
              <PlusDecorator className="absolute top-2 right-12 w-5 h-5 opacity-60" />
              <PlusDecorator className="absolute bottom-20 left-2 w-4 h-4 opacity-40" />
              <Sparkle className="absolute top-16 right-0 w-6 h-6 opacity-50" />
              <Diamond className="absolute bottom-8 right-20 w-4 h-4 opacity-40" />
              <Ring className="absolute top-28 left-12 w-10 h-10 opacity-30" />

              {/* Llama — pure CSS float, finite */}
              <div className="absolute left-2 top-4 hero-float">
                <FortniteLlama className="w-52 h-52" />
              </div>

              {/* LoL — pure CSS float with delay, finite */}
              <div className="absolute right-0 bottom-4 hero-float-delayed">
                <LolLogo className="w-52 h-20" />
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ─── 3. FORTNITE PIPELINE ───────────────────────────── */}
      <FortnitePipeline />

      {/* ─── 4. FEATURE STRIP ────────────────────────────────── */}
      <section ref={strip.ref} className="border-y border-miyu-border bg-miyu-surface relative overflow-hidden">
        <Sparkle className="absolute top-1/2 left-[5%] -translate-y-1/2 w-6 h-6 opacity-10 pointer-events-none hidden lg:block -z-10" />
        <LightRing className="absolute top-[-10px] right-[5%] w-16 h-16 pointer-events-none hidden lg:block -z-10" />
        <div className="max-w-7xl mx-auto">
          <div
            className={`grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 stagger-children ${strip.visible ? "visible" : ""}`}
          >
            {featureStrip.map((item, i) => (
              <div
                key={i}
                className={`fade-up ${strip.visible ? "visible" : ""} px-8 py-8 lg:px-10 lg:py-10 ${i < featureStrip.length - 1
                    ? "lg:border-r border-miyu-border"
                    : ""
                  } ${i < 2 ? "sm:border-b lg:border-b-0 border-miyu-border" : ""} ${i === 2 ? "sm:border-b lg:border-b-0 border-miyu-border" : ""
                  }`}
              >
                <div className="flex items-start gap-3">
                  <span className="text-miyu-text-muted mt-0.5">{item.icon}</span>
                  <div>
                    {item.title && (
                      <p className="font-semibold text-sm text-miyu-text mb-1">
                        {item.title}
                      </p>
                    )}
                    <p className="text-sm text-miyu-text-muted leading-relaxed">
                      {item.description}
                    </p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ─── 5. DATA SOURCES ─────────────────────────────────── */}
      <section id="sources" ref={sources.ref} className="py-16 lg:py-20 relative overflow-hidden">
        <Ring className="absolute top-20 left-[2%] w-32 h-32 opacity-10 pointer-events-none hidden lg:block -z-10" />
        <PlusDecorator className="absolute bottom-32 right-[5%] w-6 h-6 opacity-40 pointer-events-none hidden lg:block -z-10" />
        <SmallDot className="absolute top-1/3 right-[10%] w-3 h-3 opacity-50 pointer-events-none hidden lg:block -z-10" />
        <LightSparkle className="absolute top-1/2 left-[8%] w-12 h-12 pointer-events-none hidden lg:block -z-10" />
        <LightRing className="absolute bottom-10 left-[5%] w-20 h-20 pointer-events-none hidden lg:block -z-10" />
        <div className="max-w-7xl mx-auto px-6">
          <div
            className={`grid grid-cols-1 lg:grid-cols-2 gap-16 items-start stagger-children ${sources.visible ? "visible" : ""}`}
          >
            {/* Left text */}
            <div className={`space-y-5 fade-up ${sources.visible ? "visible" : ""}`}>
              <p
                className="text-[13px] text-miyu-text-muted tracking-wide"
                style={{ fontFamily: "var(--font-space-mono), monospace" }}
              >
                [ fuentes de datos ]
              </p>
              <h2 className="text-3xl lg:text-4xl font-bold leading-tight">
                múltiples fuentes,
                <br />
                datos confiables.
              </h2>
              <p className="text-[15px] text-miyu-text-muted leading-relaxed max-w-md">
                Integramos APIs oficiales y especializadas para ofrecerte
                información completa y actualizada de los juegos más
                competitivos.
              </p>
              <Link
                href="#"
                className="inline-flex items-center gap-1 text-miyu-accent text-sm font-medium group"
              >
                ver todas las fuentes
                <span className="transition-transform group-hover:translate-x-1">
                  →
                </span>
              </Link>
            </div>

            {/* Right cards */}
            <div className={`grid grid-cols-1 sm:grid-cols-2 gap-5 fade-up ${sources.visible ? "visible" : ""}`}>
              {/* Fortnite card */}
              <div className="bg-miyu-surface border border-miyu-border rounded-xl p-6 hover:shadow-[0_8px_32px_rgba(123,94,167,0.12)] hover:-translate-y-1 transition-all duration-300">
                <div className="flex items-center gap-3 mb-5">
                  <div className="w-10 h-10 rounded-full bg-miyu-accent flex items-center justify-center">
                    <svg fill="currentColor" className="w-5 h-5 text-white" role="img" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                      <title>Fortnite</title>
                      <path d="m15.767 14.171.097-5.05H12.4V5.197h3.99L16.872 0H7.128v24l5.271-.985V14.17z"/>
                    </svg>
                  </div>
                  <span className="text-xs font-semibold tracking-widest uppercase text-miyu-text">
                    FORTNITE
                  </span>
                </div>
                <ul className="space-y-2.5 mb-6">
                  {fortniteFeatures.map((f) => (
                    <li key={f} className="flex items-start gap-2 text-sm text-miyu-text-muted">
                      <Check />
                      {f}
                    </li>
                  ))}
                </ul>
                <span className="inline-block border border-miyu-border rounded-full px-3 py-1 text-xs text-miyu-text-muted">
                  + 4 fuentes
                </span>
              </div>

              {/* LoL card */}
              <div className="bg-miyu-surface border border-miyu-border rounded-xl p-6 hover:shadow-[0_8px_32px_rgba(123,94,167,0.12)] hover:-translate-y-1 transition-all duration-300">
                <div className="flex items-center gap-3 mb-5">
                  <div className="w-10 h-10 rounded-full bg-miyu-accent flex items-center justify-center">
                    <svg fill="#C28F2C" className="w-5 h-5" role="img" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                      <title>League of Legends</title>
                      <path d="m1.912 0 1.212 2.474v19.053L1.912 24h14.73l1.337-4.682H8.33V0ZM12 1.516c-.913 0-1.798.112-2.648.312v1.74a9.738 9.738 0 0 1 2.648-.368c5.267 0 9.536 4.184 9.536 9.348a9.203 9.203 0 0 1-2.3 6.086l-.273.954-.602 2.112c2.952-1.993 4.89-5.335 4.89-9.122C23.25 6.468 18.213 1.516 12 1.516Zm0 2.673c-.924 0-1.814.148-2.648.414v13.713h8.817a8.246 8.246 0 0 0 2.36-5.768c0-4.617-3.818-8.359-8.529-8.359zM2.104 7.312A10.858 10.858 0 0 0 .75 12.576c0 1.906.492 3.7 1.355 5.266z"/>
                    </svg>
                  </div>
                  <span className="text-xs font-semibold tracking-widest uppercase text-miyu-text">
                    LEAGUE OF LEGENDS
                  </span>
                </div>
                <ul className="space-y-2.5 mb-6">
                  {lolFeatures.map((f) => (
                    <li key={f} className="flex items-start gap-2 text-sm text-miyu-text-muted">
                      <Check />
                      {f}
                    </li>
                  ))}
                </ul>
                <span className="inline-block border border-miyu-border rounded-full px-3 py-1 text-xs text-miyu-text-muted">
                  Riot Games API
                </span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ─── 5. WHAT YOU CAN DO ──────────────────────────────── */}
      <section id="features" ref={features.ref} className="py-24 lg:py-32 border-t border-miyu-border relative overflow-hidden">
        <Sparkle className="absolute top-32 left-[5%] w-8 h-8 opacity-20 pointer-events-none hidden lg:block -z-10" />
        <DottedCircle className="absolute -bottom-20 -right-20 w-[400px] h-[400px] opacity-10 pointer-events-none hidden lg:block -z-10" />
        <Diamond className="absolute top-1/2 left-[10%] w-5 h-5 opacity-20 pointer-events-none hidden lg:block -z-10" />
        <LightRing className="absolute top-[10%] right-[10%] w-32 h-32 pointer-events-none hidden lg:block -z-10" />
        <LightSparkle className="absolute bottom-[15%] left-[15%] w-10 h-10 pointer-events-none hidden lg:block -z-10" />
        <div className="max-w-7xl mx-auto px-6">
          <div
            className={`space-y-16 stagger-children ${features.visible ? "visible" : ""}`}
          >
            {/* Header */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
              <div className={`lg:col-span-1 space-y-4 fade-up ${features.visible ? "visible" : ""}`}>
                <p
                  className="text-[13px] text-miyu-text-muted tracking-wide"
                  style={{ fontFamily: "var(--font-space-mono), monospace" }}
                >
                  [ qué puedes hacer ]
                </p>
                <h2 className="text-3xl lg:text-4xl font-bold leading-tight">
                  convierte datos
                  <br />
                  en <span className="text-miyu-accent">ventaja.</span>
                </h2>
                <p className="text-[15px] text-miyu-text-muted leading-relaxed max-w-sm">
                  Herramientas y visualizaciones pensadas para jugadores,
                  analistas y equipos que buscan mejorar su rendimiento.
                </p>
                <Link
                  href="#"
                  className="inline-flex items-center gap-1 text-miyu-accent text-sm font-medium group"
                >
                  explorar dashboard
                  <span className="transition-transform group-hover:translate-x-1">
                    →
                  </span>
                </Link>
              </div>

              {/* Feature grid */}
              <div
                className={`lg:col-span-2 grid grid-cols-1 sm:grid-cols-2 gap-8 fade-up ${features.visible ? "visible" : ""}`}
              >
                {capabilities.map((cap) => (
                  <div key={cap.title} className="space-y-3">
                    <span className="text-miyu-text-muted">{cap.icon}</span>
                    <p className="font-semibold text-sm text-miyu-text">
                      {cap.title}
                    </p>
                    <p className="text-sm text-miyu-text-muted leading-relaxed">
                      {cap.description}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ─── 6. CTA FINAL ────────────────────────────────────── */}
      <section id="cta" ref={cta.ref} className="relative overflow-hidden">
        <CurvedLine className="absolute bottom-0 left-0 w-[400px] h-[400px] opacity-20 pointer-events-none rotate-180 hidden lg:block -z-10" />
        <Diamond className="absolute top-20 right-[5%] w-5 h-5 opacity-30 pointer-events-none hidden md:block -z-10" />
        <PlusDecorator className="absolute bottom-10 right-[15%] w-4 h-4 opacity-40 pointer-events-none hidden md:block -z-10" />
        <LightSparkle className="absolute top-10 left-[10%] w-8 h-8 pointer-events-none hidden md:block -z-10" />
        <LightRing className="absolute bottom-1/4 right-[5%] w-24 h-24 pointer-events-none hidden lg:block -z-10" />

        <div className="max-w-7xl mx-auto px-6 py-20 lg:py-28">
          <div
            className={`bg-miyu-surface border border-miyu-border rounded-2xl p-10 lg:p-16 grid grid-cols-1 lg:grid-cols-2 gap-10 items-center stagger-children ${cta.visible ? "visible" : ""}`}
          >
            <div className={`fade-up ${cta.visible ? "visible" : ""}`}>
              <h2 className="text-3xl lg:text-4xl font-bold leading-tight">
                hecho por jugadores,
                <br />
                para{" "}
                <span className="text-miyu-accent font-bold">jugadores.</span>
              </h2>
            </div>

            <div className={`space-y-5 fade-up ${cta.visible ? "visible" : ""}`}>
              <p className="text-[15px] text-miyu-text-muted leading-relaxed">
                Este proyecto es open source y está en constante desarrollo.
                Únete, aporta o úsalo para llevar tu análisis al siguiente
                nivel.
              </p>
              <a
                href="https://github.com/smart"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center justify-center gap-2 bg-miyu-btn text-miyu-text border-2 border-miyu-text px-8 py-3.5 rounded-full text-sm font-bold hover:bg-miyu-btn-hover transition-colors text-center"
              >
                Ver en GitHub
                <span>→</span>
              </a>
            </div>
          </div>
        </div>
      </section>

      {/* ─── 7. FOOTER ───────────────────────────────────────── */}
      <footer className="border-t border-miyu-border py-8">
        <div className="max-w-7xl mx-auto px-6 flex flex-col sm:flex-row items-center justify-between gap-4 text-sm text-miyu-text-muted">
          <div className="flex items-center gap-3">
            <span
              className="font-bold text-miyu-text"
              style={{ fontFamily: "var(--font-space-mono), monospace" }}
            >
              {">"}_&nbsp;smart.
            </span>
            <span className="hidden sm:inline">
              © 2024 smart. todos los derechos reservados.
            </span>
          </div>
          <div className="flex items-center gap-6">
            <Link href="#" className="hover:text-miyu-accent transition-colors">
              docs
            </Link>
            <Link href="#" className="hover:text-miyu-accent transition-colors">
              privacidad
            </Link>
            <Link href="#" className="hover:text-miyu-accent transition-colors">
              contacto
            </Link>
          </div>
        </div>
      </footer>
    </>
  );
}
