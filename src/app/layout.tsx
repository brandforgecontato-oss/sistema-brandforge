import type { Metadata } from "next";
import Link from "next/link";
import { Inter, Playfair_Display } from "next/font/google";
import "./globals.css";

const playfair = Playfair_Display({ variable: "--font-playfair", subsets: ["latin"], weight: ["600", "700"] });
const inter = Inter({ variable: "--font-inter", subsets: ["latin"] });

export const metadata: Metadata = {
  title: "BrandForge — Central",
  description: "Painel único: tarefas, projetos e agentes, tendências e vídeos",
};

const NAV_LINKS = [
  { href: "/", label: "Painel" },
  { href: "/tarefas", label: "Tarefas" },
  { href: "/projetos", label: "Projetos" },
  { href: "/tendencias", label: "Tendências" },
  { href: "/videos", label: "Vídeos" },
];

function BrandMark() {
  return (
    <svg viewBox="0 0 32 32" className="h-7 w-7 shrink-0" aria-hidden="true" fill="none">
      <path d="M6 4 L18 11 L6 18 Z" fill="var(--color-gold)" />
      <path d="M6 18 L18 18 L11 26 L6 26 Z" fill="var(--color-gold)" />
      <path d="M20 4 L28 4 L22 11 L14 11 Z" fill="var(--color-gold)" opacity="0.85" />
    </svg>
  );
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR" className={`${playfair.variable} ${inter.variable} h-full antialiased`}>
      <body className="flex min-h-full flex-col bg-cream font-sans text-ink">
        <header className="bg-ink text-cream">
          <nav className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-8 gap-y-2 px-4 py-4 sm:px-6">
            <Link href="/" className="flex items-center gap-2">
              <BrandMark />
              <span className="font-display text-lg font-semibold tracking-tight">BrandForge</span>
              <span className="text-xs uppercase tracking-widest text-gold">Central</span>
            </Link>
            <div className="flex flex-wrap gap-x-6 gap-y-1 text-sm">
              {NAV_LINKS.map((link) => (
                <Link key={link.href} href={link.href} className="text-cream/70 transition-colors hover:text-gold">
                  {link.label}
                </Link>
              ))}
            </div>
          </nav>
        </header>
        <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col px-4 py-10 sm:px-6">{children}</main>
      </body>
    </html>
  );
}
