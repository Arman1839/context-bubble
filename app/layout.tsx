import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Context Bubble",
  description:
    "A temporary shared space for teams. Everyone drops thoughts, links, images, voice. The system keeps a live summary and highlights contradictions or missing pieces.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased dark`}
      suppressHydrationWarning
    >
      <body
        className="h-full bg-[#0d0f1a] text-slate-100"
        suppressHydrationWarning
      >
        {children}
      </body>
    </html>
  );
}
