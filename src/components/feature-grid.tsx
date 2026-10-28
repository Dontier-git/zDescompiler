"use client";

import { useMemo, useState } from "react";
import { ArrowRight, Check } from "lucide-react";
import { PLUGIN_FORMATS, PLUGIN_CATEGORIES, type PluginFormat } from "@/lib/mc-formats";
import { cn } from "@/lib/utils";

const CATEGORY_FILTERS: Array<"Todos" | PluginFormat["category"]> = [
  "Todos",
  "Java Plugins",
  "Java Mods",
  "Bytecode",
  "Meta & Config",
  "Resources",
];

export function FeatureGrid() {
  const [filter, setFilter] = useState<(typeof CATEGORY_FILTERS)[number]>("Todos");
  const [query, setQuery] = useState("");

  const visible = useMemo(() => {
    let list = PLUGIN_FORMATS;
    if (filter !== "Todos") list = list.filter((f) => f.category === filter);
    const q = query.trim().toLowerCase();
    if (q) {
      list = list.filter(
        (f) =>
          f.name.toLowerCase().includes(q) ||
          f.blurb.toLowerCase().includes(q) ||
          f.extensions.some((e) => e.toLowerCase().includes(q))
      );
    }
    return [...list].sort((a, b) => b.weight - a.weight);
  }, [filter, query]);

  return (
    <section id="formats" className="scroll-mt-20">
      <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div>
          <p className="text-xs font-mono uppercase tracking-widest text-primary">
            Catálogo · 22 formatos soportados
          </p>
          <h2 className="mt-1 text-3xl font-extrabold tracking-tight">
            Cubrimos todo lo de los plugins Java
          </h2>
          <p className="mt-2 text-sm text-muted-foreground max-w-xl">
            Bukkit, Spigot, Paper, BungeeCord, Velocity, Forge, Fabric,
            NeoForge, Quilt, .class bytecode, NBT, configs, resources y mucho
            más. Filtra por categoría o busca por nombre / extensión.
          </p>
        </div>

        <div className="flex flex-col gap-2 md:items-end">
          <div className="relative w-full md:w-72">
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Buscar formato o extensión…"
              className="w-full h-9 rounded-md border border-input bg-background px-3 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
          </div>
          <div className="flex flex-wrap gap-1.5">
            {CATEGORY_FILTERS.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => setFilter(c)}
                className={cn(
                  "px-2.5 py-1 text-xs rounded-md border transition-colors",
                  filter === c
                    ? "bg-primary text-primary-foreground border-primary"
                    : "bg-background text-muted-foreground border-border hover:border-primary/40 hover:text-foreground"
                )}
              >
                {c}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="mt-6 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {visible.map((f) => (
          <FormatCard key={f.slug} fmt={f} />
        ))}
      </div>

      {visible.length === 0 && (
        <div className="mt-6 p-8 rounded-lg border border-dashed border-border text-center text-muted-foreground">
          No encontramos formatos que coincidan. Prueba con otro término.
        </div>
      )}

      <div className="mt-8 flex flex-wrap gap-2">
        {PLUGIN_CATEGORIES.map((c) => (
          <span
            key={c.id}
            className="px-3 py-1.5 rounded-full bg-muted text-xs text-muted-foreground"
          >
            <strong className="text-foreground">{c.id}</strong> — {c.blurb}
          </span>
        ))}
      </div>
    </section>
  );
}

function FormatCard({ fmt }: { fmt: PluginFormat }) {
  const Icon = fmt.icon;
  return (
    <a
      href="#upload"
      className={cn(
        "group relative flex flex-col gap-3 p-5 rounded-xl border border-border bg-card hover:bg-accent/5 hover:border-primary/40 transition-colors overflow-hidden"
      )}
    >
      <div
        className={cn(
          "absolute inset-0 -z-10 opacity-0 group-hover:opacity-100 transition-opacity bg-gradient-to-br",
          fmt.accent || "from-primary/10 to-transparent"
        )}
      />
      <div className="flex items-start justify-between">
        <div className="inline-flex items-center justify-center h-10 w-10 rounded-lg bg-primary/15 text-primary border border-primary/20">
          <Icon className="h-5 w-5" />
        </div>
        {fmt.supported ? (
          <span className="inline-flex items-center gap-1 text-[10px] text-orange-400">
            <Check className="h-3 w-3" /> Live
          </span>
        ) : (
          <span className="text-[10px] text-muted-foreground">Pronto</span>
        )}
      </div>
      <div>
        <h3 className="font-semibold text-sm leading-tight">{fmt.name}</h3>
        <p className="text-xs text-muted-foreground mt-1">{fmt.blurb}</p>
      </div>
      <p className="text-xs text-muted-foreground/80 leading-relaxed line-clamp-3">
        {fmt.description}
      </p>
      <div className="flex flex-wrap gap-1 mt-auto pt-2">
        {fmt.extensions.length === 0 ? (
          <span className="text-[10px] text-muted-foreground italic">
            Sin extensión fija
          </span>
        ) : (
          fmt.extensions.map((e) => (
            <code
              key={e}
              className="text-[10px] font-mono px-1.5 py-0.5 rounded-sm bg-muted text-foreground/80"
            >
              {e}
            </code>
          ))
        )}
      </div>
      <span className="absolute right-3 bottom-3 text-[10px] text-primary opacity-0 group-hover:opacity-100 inline-flex items-center gap-0.5">
        Subir <ArrowRight className="h-3 w-3" />
      </span>
    </a>
  );
}
