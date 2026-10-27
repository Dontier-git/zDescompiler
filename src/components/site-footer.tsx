"use client";

import Link from "next/link";
import { Github, Shield } from "lucide-react";

const LINK_GROUPS: { title: string; links: { label: string; slug: string }[] }[] = [
  {
    title: "Bedrock · Packs & Addons",
    links: [
      { label: "MCPACK Extractor", slug: "mcpack" },
      { label: "MCADDON Extractor", slug: "mcaddon" },
      { label: "MCWORLD Extractor", slug: "mcworld" },
      { label: "MCTEMPLATE Extractor", slug: "mctemplate" },
      { label: "Resource Pack Explorer", slug: "zip-resource-pack" },
      { label: "Behaviour Pack Browser", slug: "mcpack" },
      { label: "Manifest Inspector", slug: "mcmeta" },
      { label: "Skin Viewer", slug: "skin" },
    ],
  },
  {
    title: "Java · Mods & Plugins",
    links: [
      { label: "Minecraft Mod (.jar) Decompiler", slug: "jar" },
      { label: "Forge Mod Inspector", slug: "jar" },
      { label: "Fabric Mod Inspector", slug: "jar" },
      { label: "NeoForge Mod Inspector", slug: "jar" },
      { label: "Quilt Mod Inspector", slug: "jar" },
      { label: "Datapack Browser", slug: "datapack" },
      { label: "Bukkit / Spigot / Paper Plugin", slug: "jar" },
      { label: "BungeeCord Plugin", slug: "jar" },
    ],
  },
  {
    title: "Mundos & Saves",
    links: [
      { label: "MCWORLD Extractor", slug: "mcworld" },
      { label: "MCTEMPLATE Extractor", slug: "mctemplate" },
      { label: "level.dat Inspector", slug: "level-dat" },
      { label: "Region (.mca) Inspector", slug: "mca" },
      { label: "Player .dat Inspector", slug: "nbt" },
      { label: "Structure .nbt Viewer", slug: "nbt" },
      { label: "Village & Outpost data", slug: "nbt" },
    ],
  },
  {
    title: "Schematics",
    links: [
      { label: "Litematic Viewer", slug: "litematic" },
      { label: "Sponge .schem Viewer", slug: "schem" },
      { label: "MCEdit .schematic Viewer", slug: "schem" },
      { label: "Structure .nbt Viewer", slug: "nbt" },
      { label: "WorldEdit .schem", slug: "schem" },
      { label: "Litematic Block Palette", slug: "litematic" },
      { label: "Tile Entity Browser", slug: "nbt" },
    ],
  },
  {
    title: "Data & NBT",
    links: [
      { label: "NBT Viewer", slug: "nbt" },
      { label: "MCMETA Viewer", slug: "mcmeta" },
      { label: "server.properties Editor", slug: "properties" },
      { label: "Mcfunction Browser", slug: "commands" },
      { label: "Lang / JSON Lang", slug: "lang" },
      { label: "Block & Item Lookup", slug: "pickaxe" },
      { label: "Recipes & Loot Tables", slug: "sword" },
      { label: "Encryption / Pack Shield", slug: "encryption" },
    ],
  },
  {
    title: "Assets",
    links: [
      { label: "Skin Viewer", slug: "skin" },
      { label: "Geometry Model Viewer", slug: "geo-model" },
      { label: "Animation / Render Controllers", slug: "rp-anim" },
      { label: "Sounds & Audio Definitions", slug: "ogg-sounds" },
      { label: "Texture Pack Browser", slug: "zip-resource-pack" },
      { label: "pack.png Thumbnail", slug: "zip-resource-pack" },
      { label: "Terrain Texture JSON", slug: "bbschema" },
    ],
  },
];

const SECONDARY = [
  "minecraft decompiler",
  "mcpack viewer",
  "mcaddon unpack",
  "mcworld extract",
  "level.dat viewer",
  "nbt viewer",
  "litematic viewer",
  "schem reader",
  "fabric mod decompiler",
  "forge mod decompiler",
  "datapack browser",
  "behaviour pack viewer",
  "resource pack extractor",
  "minecraft skin viewer",
  "server.properties editor",
  "mcfunction browser",
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
              El descompilador / extractor online para archivos de Minecraft.
              100% en el navegador — sin servidor, sin subida, sin marca de
              agua. Hecho con cariño para la comunidad Minecraft.
            </p>
            <div className="mt-4 flex items-center gap-2 text-[11px] text-muted-foreground">
              <Shield className="h-3.5 w-3.5 text-orange-400" />
              Procesado en el navegador con JSZip + NBT parser nativo
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
            Studios ni Microsoft. Minecraft es una marca registrada de Mojang
            Studios.
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
