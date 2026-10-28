"use client";

const ITEMS = [
  ".jar",
  ".class",
  "plugin.yml",
  "bungee.yml",
  "fabric.mod.json",
  "mods.toml",
  "velocity-plugin.json",
  "MANIFEST.MF",
  ".nbt",
  "level.dat",
  "player.dat",
  "server.properties",
  "config.yml",
  ".json",
  ".yml",
  ".yaml",
  ".toml",
  ".txt",
  ".md",
  "LICENSE",
  ".png",
  ".lang",
  ".zip",
  ".war",
  ".ear",
  ".aar",
];

export function FormatTicker() {
  return (
    <div className="rounded-xl border border-border bg-card/60 backdrop-blur overflow-hidden">
      <div className="px-4 py-2 border-b border-border bg-muted/30 flex items-center gap-2">
        <span className="h-1.5 w-1.5 rounded-full bg-orange-400 animate-pulse" />
        <span className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">
          Formatos de plugins soportados
        </span>
      </div>
      <div className="relative py-3 overflow-hidden">
        <div className="flex gap-6 animate-marquee-x whitespace-nowrap">
          {[...ITEMS, ...ITEMS].map((it, i) => (
            <span
              key={`${it}-${i}`}
              className="text-xs font-mono text-muted-foreground/80 hover:text-primary transition-colors"
            >
              {it}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}
