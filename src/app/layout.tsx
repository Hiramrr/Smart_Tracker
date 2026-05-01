import type { Metadata } from "next";
import { Space_Grotesk, Space_Mono } from "next/font/google";
import "./globals.css";
import QueryProvider from "@/providers/query-provider";

const spaceGrotesk = Space_Grotesk({
  variable: "--font-space-grotesk",
  subsets: ["latin"],
  display: "swap",
});

const spaceMono = Space_Mono({
  variable: "--font-space-mono",
  subsets: ["latin"],
  weight: ["400", "700"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "Miyu Tracker — Análisis de Fortnite & League of Legends",
  description:
    "Proyecto de análisis de datos competitivos para Fortnite y League of Legends. Extraemos, transformamos y visualizamos estadísticas que te ayudan a mejorar.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="es"
      className={`${spaceGrotesk.variable} ${spaceMono.variable} h-full antialiased`}
      style={{ fontFamily: "var(--font-space-grotesk), sans-serif" }}
    >
      <body className="min-h-full flex flex-col bg-miyu-bg text-miyu-text">
        <QueryProvider>{children}</QueryProvider>
      </body>
    </html>
  );
}
