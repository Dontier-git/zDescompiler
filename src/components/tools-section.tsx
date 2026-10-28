"use client";

import {
  Boxes,
  FileCode2,
  Braces,
  Server,
  Cpu,
  Shield,
  Hash,
  Plug,
} from "lucide-react";

const TOOLS = [
  {
    icon: Plug,
    title: "Plugin Inspector",
    blurb: "Sube cualquier .jar y zDescompiler detecta plugin.yml, bungee.yml, fabric.mod.json, mods.toml y velocity-plugin.json automáticamente — muestra nombre, versión, main class, dependencias y autor.",
    tag: "Top",
  },
  {
    icon: FileCode2,
    title: ".class Bytecode",
    blurb: "Parser propio del formato .class de la JVM: lee constant pool con todos los strings reales, decodifica firmas de métodos/campos a tipos Java reales y desensambla bytecode con referencias al CP resueltas.",
    tag: "Live",
  },
  {
    icon: Boxes,
    title: "Constant Pool Viewer",
    blurb: "Las N entradas del constant pool con todos los strings literales del plugin: \"1.0.0\", \"Hello, Minecraft!\", clases referenciadas, métodos invocados — todo en una sola vista con buscador.",
    tag: "Live",
  },
  {
    icon: Braces,
    title: "JSON Pretty",
    blurb: "Pretty-print y árbol colapsable para fabric.mod.json, mods.toml, mixins.json, velocity-plugin.json, mcmod.info y cualquier .json del plugin.",
    tag: "Live",
  },
  {
    icon: Server,
    title: "server.properties",
    blurb: "Visualiza server.properties como tabla con descripciones de cada propiedad (gamemode, view-distance, level-seed, online-mode, etc.).",
    tag: "Live",
  },
  {
    icon: Cpu,
    title: "Kotlin Metadata",
    blurb: "Detecta la anotación @kotlin.Metadata en .class y muestra kind (class/object/companion), metadata version y strings d1/d2 con las declaraciones Kotlin originales.",
    tag: "Live",
  },
  {
    icon: Shield,
    title: "Obfuscation Detector",
    blurb: "Suelta un .jar sospechoso y zDescompiler reporta si faltan metadatos o si los .class parecen ofuscados (clases a.class, b.class, métodos de 1-2 letras).",
    tag: "Live",
  },
  {
    icon: Hash,
    title: "Mixin JSON Browser",
    blurb: "Parser dedicado para mixins.json de SpongePowered: mixins[], compatibilityLevel, refmap, package y configuración de plugins de Mixin.",
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
            Herramientas para todo dev de plugins
          </h2>
          <p className="mt-2 text-sm text-muted-foreground max-w-xl">
            Cada herramienta es un parser distinto que vive en tu navegador.
            Sin instalar Java, sin CFR, sin JD-GUI, sin Procyon — solo arrastra
            y suelta.
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
