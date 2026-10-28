"use client";

import Link from "next/link";
import { Github, Shield } from "lucide-react";

const LINK_GROUPS: { title: string; links: { label: string; slug: string }[] }[] = [
  {
    title: "Plugins · Servidores Minecraft",
    links: [
      { label: "Bukkit Plugin Decompiler", slug: "bukkit" },
      { label: "Spigot Plugin Decompiler", slug: "bukkit" },
      { label: "Paper Plugin Decompiler", slug: "bukkit" },
      { label: "Purpur Plugin Decompiler", slug: "bukkit" },
      { label: "Folia Plugin Decompiler", slug: "bukkit" },
      { label: "Pufferfish Plugin Decompiler", slug: "bukkit" },
      { label: "plugin.yml Browser", slug: "yml-config" },
    ],
  },
  {
    title: "Proxies · Red Minecraft",
    links: [
      { label: "BungeeCord Plugin Decompiler", slug: "bungee" },
      { label: "WaterdogMC Plugin Decompiler", slug: "bungee" },
      { label: "Velocity Plugin Inspector", slug: "bungee" },
      { label: "bungee.yml Browser", slug: "yml-config" },
      { label: "velocity-plugin.json Browser", slug: "json-meta" },
    ],
  },
  {
    title: "Mods · Cliente/Servidor",
    links: [
      { label: "Forge Mod Decompiler", slug: "forge" },
      { label: "Fabric Mod Decompiler", slug: "fabric" },
      { label: "NeoForge Mod Decompiler", slug: "neoforge" },
      { label: "Quilt Mod Decompiler", slug: "quilt" },
      { label: "mods.toml Browser", slug: "toml" },
      { label: "fabric.mod.json Browser", slug: "json-meta" },
      { label: "Mixin JSON Browser", slug: "mixin" },
    ],
  },
  {
    title: "Bytecode · JVM",
    links: [
      { label: ".class Bytecode Parser", slug: "class" },
      { label: "Constant Pool Viewer", slug: "class" },
      { label: "Method Signature Decoder", slug: "class" },
      { label: "Kotlin Metadata Reader", slug: "kotlin-meta" },
      { label: "MANIFEST.MF Browser", slug: "manifest-mf" },
      { label: "Obfuscation Detector", slug: "encryption" },
    ],
  },
  {
    title: "Datos · NBT",
    links: [
      { label: "NBT Viewer", slug: "nbt" },
      { label: "level.dat Inspector", slug: "nbt" },
      { label: "Player .dat Inspector", slug: "nbt" },
      { label: "Economy .dat (Vault)", slug: "nbt" },
      { label: "Structure .nbt Viewer", slug: "nbt" },
    ],
  },
  {
    title: "Config · Recursos",
    links: [
      { label: "server.properties Editor", slug: "properties" },
      { label: "YAML Browser (config.yml)", slug: "yml-config" },
      { label: "TOML Browser", slug: "toml" },
      { label: "JSON Manifest Browser", slug: "json-meta" },
      { label: "ZIP Archive Explorer", slug: "zip" },
      { label: "WAR / EAR Explorer", slug: "war-ear" },
      { label: "README / LICENSE Viewer", slug: "txt-readme" },
      { label: "Lang / Messages File", slug: "lang" },
    ],
  },
];

const SECONDARY = [
  "java decompiler",
  "jar decompiler",
  "class decompiler",
  "bukkit plugin decompiler",
  "spigot plugin decompiler",
  "paper plugin decompiler",
  "forge mod decompiler",
  "fabric mod decompiler",
  "neoforge mod decompiler",
  "bungeecord plugin decompiler",
  "velocity plugin decompiler",
  "jvm bytecode viewer",
  "constant pool viewer",
  "plugin.yml viewer",
  "fabric.mod.json viewer",
  "mods.toml viewer",
  "nbt viewer",
  "level.dat viewer",
  "server.properties editor",
  "manifest.mf viewer",
  "kotlin metadata reader",
  "mixin json viewer",
];

export function SiteFooter() {
  return (
    <footer className="mt-auto border-t border-border bg-card/40">
      <div className="container mx-auto px-4 py-10">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
          <div className="lg:col-span-3">
            <Link href="/" className="flex items-center gap-2 mb-3">
              <span className="relative inline-block h-7 w-7 clip-pixel bg-primary shadow-block-primary">
                <span className="absolute inset-[2px] bg-primary-foreground/90" />
              </span>
              <span className="text-lg font-extrabold">
                <span className="text-primary">z</span>Descompiler<span className="text-primary">.</span>
              </span>
            </Link>
            <p className="text-xs text-muted-foreground leading-relaxed max-w-xs">
              El descompilador / extractor online para plugins Java y mods de
              Minecraft. Bukkit, Spigot, Paper, BungeeCord, Velocity, Forge,
              Fabric, NeoForge y Quilt. 100% en el navegador — sin servidor,
              sin subida, sin marca de agua. Hecho para la comunidad Minecraft.
            </p>
            <div className="mt-4 flex items-center gap-2 text-[11px] text-muted-foreground">
              <Shield className="h-3.5 w-3.5 text-orange-400" />
              Procesado en el navegador con JSZip + parsers propios NBT/.class
            </div>
            <a
              href="https://github.com/zdescompiler/zdescompiler"
              target="_blank"
              rel="noopener noreferrer"
              className="mt-4 inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
            >
              <Github className="h-3.5 w-3.5" />
              github.com/zdescompiler
            </a>
          </div>

          <div className="lg:col-span-9 grid grid-cols-2 md:grid-cols-3 gap-6">
            {LINK_GROUPS.map((g) => (
              <div key={g.title}>
                <h4 className="text-[11px] font-mono uppercase tracking-wider text-muted-foreground mb-2">
                  {g.title}
                </h4>
                <ul className="space-y-1.5">
                  {g.links.map((l, i) => (
                    <li key={`${l.slug}-${i}`}>
                      <a
                        href="#upload"
                        className="text-xs text-muted-foreground hover:text-primary transition-colors"
                        title={l.label}
                      >
                        {l.label}
                      </a>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>

        <div className="mt-10 pt-6 border-t border-border">
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground/70 mb-2">
            También soporta búsquedas como
          </p>
          <div className="flex flex-wrap gap-x-3 gap-y-1">
            {SECONDARY.map((s) => (
              <a
                key={s}
                href="#upload"
                className="text-[10px] text-muted-foreground/60 hover:text-foreground/80 transition-colors lowercase"
              >
                {s}
              </a>
            ))}
          </div>
        </div>

        <div className="mt-6 flex flex-col md:flex-row md:items-center md:justify-between gap-3">
          <p className="text-xs text-muted-foreground">
            © {new Date().getFullYear()} zDescompiler. No afiliado con Mojang
            Studios, Microsoft, Bukkit, Spigot, PaperMC, Forge, Fabric ni NeoForge.
            Todas las marcas pertenecen a sus respectivos dueños.
          </p>
          <nav className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
            <a href="#about" className="hover:text-foreground transition-colors">Acerca</a>
            <a href="#faq" className="hover:text-foreground transition-colors">Preguntas</a>
            <a href="#privacy" className="hover:text-foreground transition-colors">Privacidad</a>
            <a href="#terms" className="hover:text-foreground transition-colors">Términos</a>
            <a
              href="mailto:support@zdescompiler.com"
              className="hover:text-foreground transition-colors"
            >
              Contacto
            </a>
          </nav>
        </div>
      </div>
    </footer>
  );
}
