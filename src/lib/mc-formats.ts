import type { LucideIcon } from "lucide-react";
import {
  FileCode2,
  Box,
  Layers,
  FileJson,
  Server,
  Braces,
  Hash,
  Wrench,
  FileArchive,
  Sparkles,
  Shield,
  Gem,
  Boxes,
  Cpu,
  FileText,
  Plug,
} from "lucide-react";

export type PluginFormat = {
  /** kebab-case slug used as a key & anchor */
  slug: string;
  /** Display name shown on card */
  name: string;
  /** Short one-liner */
  blurb: string;
  /** Long description (>= 2 sentences) */
  description: string;
  /** File extensions handled, with leading dot */
  extensions: string[];
  /** Hero icon */
  icon: LucideIcon;
  /** Approximate popularity weight (higher = more common) */
  weight: number;
  /** Category bucket for filtering */
  category: "Java Plugins" | "Java Mods" | "Bytecode" | "Meta & Config" | "Resources";
  /** Whether zDescompiler actually extracts this client-side today */
  supported: boolean;
  /** Accent color class override (Tailwind gradient pair) */
  accent?: string;
};

export const PLUGIN_FORMATS: PluginFormat[] = [
  {
    slug: "jar",
    name: "Java Plugin / Mod Decompiler",
    blurb: ".jar — Bukkit, Spigot, Paper, BungeeCord, Forge, Fabric",
    description:
      "Arrastra cualquier .jar de plugin o mod y zDescompiler lo descomprime en tu navegador: carpetas com/, META-INF/, plugin.yml, fabric.mod.json, mods.toml y todos los .class. Click en cualquier .class para ver el parser JVM completo — constant pool, firmas de métodos, bytecode desensamblado.",
    extensions: [".jar"],
    icon: FileCode2,
    weight: 100,
    category: "Java Plugins",
    supported: true,
    accent: "from-orange-400/20 to-orange-600/10",
  },
  {
    slug: "class",
    name: ".class Bytecode Parser",
    blurb: ".class — JVM bytecode real, no inventado",
    description:
      "Parser propio del formato .class de la JVM (especificación oficial Oracle). Lee constant pool real con todos los strings literales del plugin, decodifica firmas de métodos y campos a tipos Java reales, y desensambla el bytecode con referencias al CP resueltas (aload_0, invokespecial #24 java.lang.Object.<init>:()V, etc.).",
    extensions: [".class"],
    icon: Box,
    weight: 95,
    category: "Bytecode",
    supported: true,
    accent: "from-amber-400/20 to-orange-600/10",
  },
  {
    slug: "bukkit",
    name: "Bukkit / Spigot / Paper Plugin",
    blurb: ".jar con plugin.yml — servidores Minecraft Java",
    description:
      "Detecta plugin.yml dentro del .jar y te muestra nombre, versión, autor, comando, permisos y dependencias. Funciona con todos los forks de Bukkit: Spigot, Paper, Purpur, Folia, Pufferfish y otros.",
    extensions: [".jar"],
    icon: Plug,
    weight: 90,
    category: "Java Plugins",
    supported: true,
    accent: "from-orange-400/20 to-amber-600/10",
  },
  {
    slug: "bungee",
    name: "BungeeCord Plugin",
    blurb: ".jar con bungee.yml — proxies Minecraft",
    description:
      "Inspecciona plugins de BungeeCord y WaterdogMC. Lee bungee.yml, identifica main class y dependencias. Soporta Velocity con velocity-plugin.json.",
    extensions: [".jar"],
    icon: Layers,
    weight: 75,
    category: "Java Plugins",
    supported: true,
    accent: "from-orange-400/20 to-orange-600/10",
  },
  {
    slug: "forge",
    name: "Forge Mod Inspector",
    blurb: ".jar con mods.toml — Minecraft Java mods",
    description:
      "Detecta mods.toml dentro de .jar y muestra modid, version, dependencies, displayName y side. También extrae accesstransformers.cfg y mixins.json.",
    extensions: [".jar"],
    icon: Box,
    weight: 80,
    category: "Java Mods",
    supported: true,
    accent: "from-amber-400/20 to-orange-600/10",
  },
  {
    slug: "fabric",
    name: "Fabric Mod Inspector",
    blurb: ".jar con fabric.mod.json — mods Fabric",
    description:
      "Lee fabric.mod.json, muestra entrypoints (client/main), depends, suggests, custom values y access widener.",
    extensions: [".jar"],
    icon: Layers,
    weight: 78,
    category: "Java Mods",
    supported: true,
    accent: "from-orange-400/20 to-amber-600/10",
  },
  {
    slug: "neoforge",
    name: "NeoForge Mod Inspector",
    blurb: ".jar con neoforge.mods.toml",
    description:
      "Parser dedicado para mods.toml de NeoForge, el fork moderno de Forge. Muestra el block de mod, dependencias NeoForge version-range y entrypoints.",
    extensions: [".jar"],
    icon: Box,
    weight: 60,
    category: "Java Mods",
    supported: true,
    accent: "from-amber-400/20 to-orange-600/10",
  },
  {
    slug: "quilt",
    name: "Quilt Mod Inspector",
    blurb: ".jar con quilt.mod.json",
    description:
      "Lee el formato quilt.mod.json (compatible con Fabric). Muestra schema_version, qsl y loader version requeridos, y puntos de entrada.",
    extensions: [".jar"],
    icon: Layers,
    weight: 45,
    category: "Java Mods",
    supported: true,
    accent: "from-orange-400/20 to-orange-600/10",
  },
  {
    slug: "nbt",
    name: "NBT Viewer (datos guardados)",
    blurb: ".nbt, .dat — Named Binary Tag (level.dat, player)",
    description:
      "Parser NBT propio para los .dat que usan los plugins de Minecraft (level.dat, player .dat, estructura de /structure block, economy data de Vault, etc.). Tabs Árbol + JSON + botón Copiar.",
    extensions: [".nbt", ".dat"],
    icon: FileJson,
    weight: 50,
    category: "Meta & Config",
    supported: true,
    accent: "from-orange-400/20 to-orange-600/10",
  },
  {
    slug: "yml-config",
    name: "plugin.yml / config.yml Browser",
    blurb: ".yml, .yaml — metadatos y configuración",
    description:
      "Vista formateada de YAML: plugin.yml, config.yml, bungee.yml, mods.toml. Identación clara, comentarios preservados, sin highlight de sintaxis ruidoso.",
    extensions: [".yml", ".yaml"],
    icon: FileText,
    weight: 55,
    category: "Meta & Config",
    supported: true,
    accent: "from-orange-400/20 to-orange-600/10",
  },
  {
    slug: "json-meta",
    name: "JSON Manifest Browser",
    blurb: ".json — fabric.mod.json, mods.toml, mcmod.info",
    description:
      "Pretty-print y árbol colapsable para cualquier JSON del plugin: fabric.mod.json, velocity-plugin.json, mixins.json, manifest.json. Búsqueda difusa en claves y valores.",
    extensions: [".json"],
    icon: Braces,
    weight: 60,
    category: "Meta & Config",
    supported: true,
    accent: "from-orange-400/20 to-orange-600/10",
  },
  {
    slug: "properties",
    name: "server.properties Editor",
    blurb: ".properties — config de servidor Minecraft",
    description:
      "Suelta tu server.properties y zDescompiler te lo muestra como tabla estructurada con descripciones de cada propiedad (gamemode, difficulty, view-distance, level-seed, etc.).",
    extensions: [".properties"],
    icon: Server,
    weight: 40,
    category: "Meta & Config",
    supported: true,
    accent: "from-orange-400/20 to-orange-600/10",
  },
  {
    slug: "toml",
    name: "TOML Browser",
    blurb: ".toml — mods.toml, neoforge.mods.toml",
    description:
      "Vista formateada de archivos TOML usados por Forge / NeoForge. Conserva secciones [mods], [[mods]], [dependencies.minecraft] y valores multiline string.",
    extensions: [".toml"],
    icon: Hash,
    weight: 35,
    category: "Meta & Config",
    supported: true,
    accent: "from-orange-400/20 to-orange-600/10",
  },
  {
    slug: "txt-readme",
    name: "README / LICENSE / CHANGELOG",
    blurb: ".txt, .md, LICENSE — docs del plugin",
    description:
      "Texto plano con formato limpio: README.md, CHANGELOG.md, LICENSE, NOTICE. Conserva line breaks y tabs sin estirarlos.",
    extensions: [".txt", ".md", ".rst", "license"],
    icon: FileText,
    weight: 30,
    category: "Meta & Config",
    supported: true,
    accent: "from-orange-400/20 to-orange-600/10",
  },
  {
    slug: "png-icon",
    name: "Icon / PNG Viewer",
    blurb: ".png — icon.png del plugin, banner.png",
    description:
      "Render de imágenes PNG con image-rendering: pixelated para iconos pixel-art. Fondo a cuadros para que se vean zonas transparentes.",
    extensions: [".png", ".jpg", ".jpeg", ".gif", ".webp"],
    icon: Sparkles,
    weight: 25,
    category: "Resources",
    supported: true,
    accent: "from-orange-400/20 to-orange-600/10",
  },
  {
    slug: "lang",
    name: "Lang / Messages File",
    blurb: ".lang, .properties de mensajes i18n",
    description:
      "Vista de tablas de traducciones: messages.properties, messages_es.properties, locale.yml. Cada entrada con clave = valor alineado.",
    extensions: [".lang", ".properties"],
    icon: Hash,
    weight: 28,
    category: "Resources",
    supported: true,
    accent: "from-orange-400/20 to-orange-600/10",
  },
  {
    slug: "encryption",
    name: "Encrypted / Obfuscated Detector",
    blurb: "detecta plugins ofuscados o cifrados",
    description:
      "Suelta un .jar sospechoso y zDescompiler intenta leer plugin.yml, fabric.mod.json, mods.toml y reporta si faltan entradas o si los .class parecen estar ofuscados (clases con nombres como a.class, b.class).",
    extensions: [".jar", ".class"],
    icon: Shield,
    weight: 22,
    category: "Bytecode",
    supported: true,
    accent: "from-orange-400/20 to-orange-600/10",
  },
  {
    slug: "zip",
    name: "ZIP Archive Explorer",
    blurb: ".zip — para artifacts genéricos",
    description:
      "Cualquier .zip se descomprime igual que un .jar — útil si quieres ver qué hay dentro de un source jar o un source zip sin abrirlo manualmente.",
    extensions: [".zip"],
    icon: FileArchive,
    weight: 35,
    category: "Resources",
    supported: true,
    accent: "from-orange-400/20 to-orange-600/10",
  },
  {
    slug: "war-ear",
    name: "WAR / EAR Explorer",
    blurb: ".war, .ear — enterprise Java",
    description:
      "Descomprime archivos WAR (Web Application Archive) y EAR (Enterprise Application Archive) para inspeccionar web.xml, classes/ y lib/.",
    extensions: [".war", ".ear"],
    icon: FileArchive,
    weight: 20,
    category: "Java Plugins",
    supported: true,
    accent: "from-orange-400/20 to-orange-600/10",
  },
  {
    slug: "aar",
    name: "AAR (Android Library)",
    blurb: ".aar — Android library archive",
    description:
      "Descomprime archivos .aar de Android. Incluye classes.jar, AndroidManifest.xml, R.txt, res/ y assets/.",
    extensions: [".aar"],
    icon: Boxes,
    weight: 18,
    category: "Java Plugins",
    supported: true,
    accent: "from-orange-400/20 to-orange-600/10",
  },
  {
    slug: "kotlin-meta",
    name: "Kotlin Metadata Reader",
    blurb: ".class con @Metadata — Kotlin en JVM",
    description:
      "Detecta la anotación @kotlin.Metadata en .class y muestra kind (class/object/companion/), mv (metadata version), d1 y d2 strings (declaraciones Kotlin).",
    extensions: [".class"],
    icon: Cpu,
    weight: 32,
    category: "Bytecode",
    supported: true,
    accent: "from-orange-400/20 to-orange-600/10",
  },
  {
    slug: "manifest-mf",
    name: "MANIFEST.MF Browser",
    blurb: "MANIFEST.MF — metadatos del .jar",
    description:
      "Pretty-print del MANIFEST.MF con sus secciones: Main-Class, Implementation-Version, Sealed, Class-Path, Boot-Class-Path, etc.",
    extensions: ["MANIFEST.MF", ".mf"],
    icon: Gem,
    weight: 25,
    category: "Meta & Config",
    supported: true,
    accent: "from-orange-400/20 to-orange-600/10",
  },
  {
    slug: "mixin",
    name: "Mixin JSON Browser",
    blurb: ".mixins.json — SpongePowered Mixin",
    description:
      "Parser para mixins.json usado por SpongePowered Mixin (mods que interceptan bytecode). Muestra mixins[], compatibilityLevel, refmap, package y configuración del plugin.",
    extensions: [".json"],
    icon: Wrench,
    weight: 26,
    category: "Java Mods",
    supported: true,
    accent: "from-orange-400/20 to-orange-600/10",
  },
];

/** Quick category metadata */
export const PLUGIN_CATEGORIES: { id: PluginFormat["category"]; blurb: string }[] = [
  { id: "Java Plugins", blurb: "Bukkit, Spigot, Paper, BungeeCord, Velocity" },
  { id: "Java Mods", blurb: "Forge, Fabric, NeoForge, Quilt mods" },
  { id: "Bytecode", blurb: ".class parser, Kotlin metadata, ofuscación" },
  { id: "Meta & Config", blurb: "plugin.yml, mods.toml, fabric.mod.json, server.properties" },
  { id: "Resources", blurb: "ZIP, PNG, lang, README" },
];

/** Tiny helper to fetch by slug */
export function getFormat(slug: string) {
  return PLUGIN_FORMATS.find((f) => f.slug === slug);
}

/** Tiny helper to find formats matching a file extension */
export function matchFormats(filename: string): PluginFormat[] {
  const lower = filename.toLowerCase();
  return PLUGIN_FORMATS.filter((f) =>
    f.extensions.some((ext) => lower.endsWith(ext.toLowerCase()))
  );
}

// Backward-compat exports (in case any old import references these)
export const MC_FORMATS = PLUGIN_FORMATS;
export const MC_CATEGORIES = PLUGIN_CATEGORIES;
export type McFormat = PluginFormat;
