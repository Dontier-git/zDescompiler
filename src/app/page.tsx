"use client";

import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { HeroUpload } from "@/components/hero-upload";
import { FeatureGrid } from "@/components/feature-grid";
import { ToolsSection } from "@/components/tools-section";
import { FaqSection } from "@/components/faq-section";
import { AboutSection } from "@/components/about-section";
import { FormatTicker } from "@/components/format-ticker";
import { LicenseViewerSection } from "@/components/license-viewer";

export default function Home() {
  return (
    <div className="min-h-screen flex flex-col bg-background text-foreground">
      <SiteHeader />

      <main className="flex-1">
        {/* Hero */}
        <section className="relative overflow-hidden border-b border-border">
          {/* Pixel grid background */}
          <div className="absolute inset-0 bg-pixel-grid opacity-30 pointer-events-none" />
          <div className="absolute inset-0 bg-gradient-to-b from-primary/5 via-transparent to-background pointer-events-none" />

          <div className="relative container mx-auto px-4 py-12 md:py-16">
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
              {/* Heading column */}
              <div className="lg:col-span-5">
                <div className="inline-flex items-center gap-2 px-2.5 py-1 rounded-full border border-primary/30 bg-primary/10 text-[11px] font-mono uppercase tracking-wider text-primary">
                  <span className="h-1.5 w-1.5 rounded-full bg-primary animate-pulse" />
                  El descompilador de plugins Java
                </div>

                <h1 className="mt-4 text-4xl md:text-5xl font-extrabold tracking-tight leading-[1.05]">
                  <span className="text-primary">z</span>
                  Descompiler
                  <span className="text-primary">.</span>
                </h1>

                <p className="mt-3 text-lg md:text-xl text-foreground/80 font-medium">
                  Decompila y extrae cualquier plugin Java{" "}
                  <span className="text-primary">— en tu navegador.</span>
                </p>

                <p className="mt-4 text-sm text-muted-foreground leading-relaxed max-w-md">
                  Arrastra tu <code className="text-primary font-mono">.jar</code> de
                  plugin (Bukkit, Spigot, Paper, BungeeCord, Forge, Fabric, NeoForge,
                  Quilt) o cualquier <code className="text-primary font-mono">.class</code>{" "}
                  y mira su contenido real: carpetas <code className="text-primary font-mono">com/</code>,
                  {" "}<code className="text-primary font-mono">plugin.yml</code>,
                  {" "}<code className="text-primary font-mono">fabric.mod.json</code>,
                  {" "}<code className="text-primary font-mono">mods.toml</code> y el
                  bytecode real desensamblado de cada método. Sin upload, sin
                  registro, sin marca de agua. 100% gratis.
                </p>

                <div className="mt-6 flex flex-wrap items-center gap-2">
                  <a
                    href="#upload"
                    className="inline-flex items-center gap-1.5 px-4 py-2 rounded-md bg-primary text-primary-foreground font-semibold text-sm shadow-block-primary hover:translate-x-[2px] hover:translate-y-[2px] hover:shadow-none transition-all"
                  >
                    Subir archivo
                  </a>
                  <a
                    href="#formats"
                    className="inline-flex items-center gap-1.5 px-4 py-2 rounded-md border border-border bg-card text-sm hover:border-primary/40 transition-colors"
                  >
                    Ver formatos
                  </a>
                </div>

                <dl className="mt-8 grid grid-cols-3 gap-4 max-w-md">
                  {[
                    { v: "22", l: "formatos cubiertos" },
                    { v: "0", l: "archivos subidos" },
                    { v: "∞", l: "tamaño / día" },
                  ].map((s) => (
                    <div key={s.l} className="border-l-2 border-primary/40 pl-3">
                      <dt className="text-2xl font-extrabold text-primary">{s.v}</dt>
                      <dd className="text-[11px] text-muted-foreground uppercase tracking-wider">
                        {s.l}
                      </dd>
                    </div>
                  ))}
                </dl>
              </div>

              {/* Drop zone + side card */}
              <div className="lg:col-span-7">
                <HeroUpload />
              </div>
            </div>
          </div>
        </section>

        {/* Ticker */}
        <section className="container mx-auto px-4 py-6">
          <FormatTicker />
        </section>

        {/* Format grid */}
        <section className="container mx-auto px-4 py-10">
          <FeatureGrid />
        </section>

        {/* Tools */}
        <section className="container mx-auto px-4 py-10 border-t border-border">
          <ToolsSection />
        </section>

        {/* License Info Viewer */}
        <section className="container mx-auto px-4 py-10 border-t border-border">
          <LicenseViewerSection />
        </section>

        {/* About */}
        <section className="container mx-auto px-4 py-10 border-t border-border">
          <AboutSection />
        </section>

        {/* FAQ */}
        <section className="container mx-auto px-4 py-10 border-t border-border">
          <FaqSection />
        </section>
      </main>

      <SiteFooter />
    </div>
  );
}
