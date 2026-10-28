"use client";

import Link from "next/link";
import { useState } from "react";
import { Menu, X, Github, Sun, Moon, Boxes } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ThemeToggle } from "@/components/theme-toggle";

const NAV_LINKS = [
  { href: "/#formats", label: "Formatos" },
  { href: "/#tools", label: "Herramientas" },
  { href: "/#faq", label: "Preguntas" },
  { href: "/#about", label: "Acerca" },
];

export function SiteHeader() {
  const [open, setOpen] = useState(false);

  return (
    <header className="sticky top-0 z-50 border-b border-border/60 bg-background/80 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="container mx-auto flex h-16 items-center justify-between px-4">
        <Link href="/" className="flex items-center gap-2 group">
          <span className="relative inline-block h-8 w-8 clip-pixel bg-primary shadow-block-primary animate-block-bob">
            <span className="absolute inset-[2px] bg-primary-foreground/90" />
            <span className="absolute left-1 top-1 h-2 w-2 bg-primary" />
            <span className="absolute right-1 top-1 h-2 w-2 bg-primary" />
            <span className="absolute left-1 bottom-1 h-2 w-2 bg-primary" />
            <span className="absolute right-1 bottom-1 h-2 w-2 bg-primary" />
          </span>
          <span className="text-xl font-extrabold tracking-tight">
            <span className="text-primary">z</span>
            <span>Descompiler</span>
            <span className="text-primary">.</span>
          </span>
          <span className="hidden sm:inline-block text-[10px] font-mono uppercase tracking-widest text-muted-foreground ml-2 px-1.5 py-0.5 rounded-sm bg-muted">
            v1.0
          </span>
        </Link>

        <nav className="hidden md:flex items-center gap-1">
          {NAV_LINKS.map((l) => (
            <Button key={l.href} asChild variant="ghost" size="sm">
              <Link href={l.href}>{l.label}</Link>
            </Button>
          ))}
          <ThemeToggle />
          <Button asChild variant="outline" size="sm" className="ml-2">
            <a
              href="https://github.com/zdescompiler/zdescompiler"
              target="_blank"
              rel="noopener noreferrer"
            >
              <Github className="h-4 w-4 mr-1.5" /> Source
            </a>
          </Button>
        </nav>

        <div className="flex items-center gap-2 md:hidden">
          <ThemeToggle />
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setOpen((v) => !v)}
            aria-label="Toggle menu"
          >
            {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </Button>
        </div>
      </div>

      {/* Mobile drawer */}
      {open && (
        <div className="md:hidden border-t border-border/60 bg-background">
          <nav className="container mx-auto flex flex-col gap-1 px-4 py-3">
            {NAV_LINKS.map((l) => (
              <Button
                key={l.href}
                asChild
                variant="ghost"
                size="sm"
                className="justify-start"
                onClick={() => setOpen(false)}
              >
                <Link href={l.href}>{l.label}</Link>
              </Button>
            ))}
            <div className="flex items-center gap-2 pt-2 border-t border-border/60 mt-1">
              <Button asChild variant="outline" size="sm" className="flex-1">
                <a
                  href="https://github.com/zdescompiler/zdescompiler"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  <Github className="h-4 w-4 mr-1.5" /> Source
                </a>
              </Button>
              <Button asChild size="sm" className="flex-1">
                <Link href="/#upload">
                  <Boxes className="h-4 w-4 mr-1.5" /> Subir archivo
                </Link>
              </Button>
            </div>
          </nav>
        </div>
      )}
    </header>
  );
}
