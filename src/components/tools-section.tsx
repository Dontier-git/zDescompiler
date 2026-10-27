"use client";

import {
  Boxes,
  Globe2,
  FileJson,
  Braces,
  Server,
  Cuboid,
  Image as ImageIcon,
  Hash,
} from "lucide-react";

const TOOLS = [
  {
    icon: Boxes,
    title: "Pack Inspector",
    blurb: "Sube cualquier .mcpack/.mcaddon y zDescompiler te muestra manifest, pack icon, behaviors y resources en una sola vista.",
    tag: "Top",
  },
  {
    icon: Globe2,
    title: "World Dumper",
    blurb: "level.dat, region (.mca), chunks NBT y player .dat — todo decodificado a JSON legible en milisegundos.",
    tag: "Top",
  },
  {
    icon: FileJson,
    title: "NBT Inspector",
    blurb: "Parser NBT nativo (sin dependencias) para cualquier .nbt, .dat o estructura generada por /structure block.",
    tag: "Live",
  },
  {
    icon: Braces,
    title: "JSON Pretty",
    blurb: "Pretty-print y árbol colapsable para manifest.json, pack.mcmeta, fabric.mod.json, mods.toml, *.geo.json, *.render.json.",
    tag: "Live",
  },
  {
    icon: Server,
    title: "server.properties",
    blurb: "Visualiza server.properties como tabla con descripciones de cada propiedad (gamemode, view-distance, level-seed).",
    tag: "Live",
  },
  {
    icon: Cuboid,
    title: "Schematic Browser",
    blurb: "Soporta .litematic, .schem (Sponge), .schematic (MCEdit) — extrae paleta, dimensiones y tile entities.",
    tag: "Live",
  },
  {
    icon: ImageIcon,
    title: "Skin Preview",
    blurb: "Renderiza cualquier PNG de skin 64x64 (o HD) sin abrir el juego. Soporta layouts Steve y Alex.",
    tag: "Beta",
  },
  {
    icon: Hash,
    title: "mcfunction Browser",
    blurb: "Navega archivos .mcfunction de datapacks y behaviour packs con numeración de líneas y resaltado de comandos.",
    tag: "Live",
  },
];

export function ToolsSection() {
  return (
    <section id="tools" className="scroll-mt-20">
      <div className="flex items-end justify-between mb-6">
        <div>
          <p className="text-xs font-mono uppercase tracking-widest text-primary">
            Toolkit · 8 utilidades
          </p>
          <h2 className="mt-1 text-3xl font-extrabold tracking-tight">
            Herramientas para todo creador / modder
          </h2>
          <p className="mt-2 text-sm text-muted-foreground max-w-xl">
            Cada herramienta es un parser distinto que vive en tu navegador. Sin
            instalar Java, sin Node, sin Python — solo arrastra y suelta.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {TOOLS.map((t) => {
          const Icon = t.icon;
          return (
            <div
              key={t.title}
              className="group relative p-5 rounded-xl border border-border bg-card hover:border-primary/40 hover:bg-accent/5 transition-colors"
            >
              <div className="flex items-start justify-between mb-3">
                <div className="inline-flex items-center justify-center h-9 w-9 rounded-lg bg-primary/15 text-primary border border-primary/20">
                  <Icon className="h-4 w-4" />
                </div>
                <span className="text-[10px] px-1.5 py-0.5 rounded-sm bg-muted text-muted-foreground">
                  {t.tag}
                </span>
              </div>
              <h3 className="font-semibold text-sm">{t.title}</h3>
              <p className="mt-1 text-xs text-muted-foreground leading-relaxed">
                {t.blurb}
              </p>
            </div>
          );
        })}
      </div>
    </section>
  );
}
