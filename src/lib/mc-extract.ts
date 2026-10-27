"use client";

import JSZip from "jszip";
import { saveAs } from "file-saver";

export type ExtractedFile = {
  /** Full path inside the archive, e.g. "textures/blocks/grass.png" */
  path: string;
  /** Just the file name */
  name: string;
  /** Size in bytes */
  size: number;
  /** Size formatted as KB/MB */
  prettySize: string;
  /** Detected kind — drives preview rendering */
  kind:
    | "image"
    | "json"
    | "text"
    | "mcfunction"
    | "properties"
    | "binary"
    | "nbt"
    | "audio"
    | "archive"
    | "java_class";
  /** Raw bytes (lazy loaded) */
  blob: Blob;
};

export type ExtractedArchive = {
  files: ExtractedFile[];
  manifest: unknown | null;
  packMeta: unknown | null;
  totalSize: number;
  fileCount: number;
  formatSlug: string;
  originalName: string;
};

const TEXTUAL_EXT = [
  ".json",
  ".txt",
  ".md",
  ".lang",
  ".mcmeta",
  ".properties",
  ".mcfunction",
  ".fsh",
  ".vsh",
  ".glsl",
  ".molang",
  ".material",
  ".render.json",
  ".animation.json",
  ".particle.json",
  ".geo.json",
  ".html",
  ".xml",
  ".csv",
  ".toml",
  ".ini",
];

const IMAGE_EXT = [".png", ".jpg", ".jpeg", ".gif", ".webp", ".bmp", ".tga"];
const AUDIO_EXT = [".ogg", ".mp3", ".wav", ".fsb"];
const ARCHIVE_EXT = [".zip", ".tar", ".gz", ".mcpack", ".mcaddon", ".mcworld"];

function prettySize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

function detectKind(name: string): ExtractedFile["kind"] {
  const lower = name.toLowerCase();
  if (lower.endsWith(".class")) return "java_class";
  if (IMAGE_EXT.some((e) => lower.endsWith(e))) return "image";
  if (lower.endsWith(".json") || lower.endsWith(".mcmeta")) return "json";
  if (lower.endsWith(".mcfunction")) return "mcfunction";
  if (lower.endsWith(".properties")) return "properties";
  if (lower.endsWith(".nbt") || lower.endsWith(".dat")) return "nbt";
  if (AUDIO_EXT.some((e) => lower.endsWith(e))) return "audio";
  if (ARCHIVE_EXT.some((e) => lower.endsWith(e))) return "archive";
  if (TEXTUAL_EXT.some((e) => lower.endsWith(e))) return "text";
  return "binary";
}

/**
 * Extract any Minecraft-related archive (which are all ZIP-based) on the client.
 * Falls back to plain file read for non-zip files.
 */
export async function extractArchive(
  file: File
): Promise<ExtractedArchive> {
  const lower = file.name.toLowerCase();
  const isZipLike =
    lower.endsWith(".mcpack") ||
    lower.endsWith(".mcaddon") ||
    lower.endsWith(".mcworld") ||
    lower.endsWith(".mctemplate") ||
    lower.endsWith(".jar") ||
    lower.endsWith(".zip") ||
    lower.endsWith(".litematic") ||
    lower.endsWith(".schem") ||
    lower.endsWith(".schematic");

  let formatSlug = "raw";
  if (lower.endsWith(".mcpack")) formatSlug = "mcpack";
  else if (lower.endsWith(".mcaddon")) formatSlug = "mcaddon";
  else if (lower.endsWith(".mcworld")) formatSlug = "mcworld";
  else if (lower.endsWith(".mctemplate")) formatSlug = "mctemplate";
  else if (lower.endsWith(".jar")) formatSlug = "jar";
  else if (lower.endsWith(".nbt")) formatSlug = "nbt";
  else if (lower.endsWith(".dat")) formatSlug = "level-dat";
  else if (lower.endsWith(".litematic")) formatSlug = "litematic";
  else if (lower.endsWith(".schem") || lower.endsWith(".schematic"))
    formatSlug = "schem";
  else if (lower.endsWith(".zip")) formatSlug = "zip-resource-pack";

  // Single non-archive file (NBT, level.dat, properties, etc.)
  if (!isZipLike) {
    const blob = new Blob([await file.arrayBuffer()], { type: file.type });
    const name = file.name;
    return {
      files: [
        {
          path: name,
          name,
          size: file.size,
          prettySize: prettySize(file.size),
          kind: detectKind(name),
          blob,
        },
      ],
      manifest: null,
      packMeta: null,
      totalSize: file.size,
      fileCount: 1,
      formatSlug,
      originalName: file.name,
    };
  }

  const zip = await JSZip.loadAsync(await file.arrayBuffer());
  const out: ExtractedFile[] = [];
  let totalSize = 0;
  let manifest: unknown | null = null;
  let packMeta: unknown | null = null;

  const entries = Object.values(zip.files).filter((f) => !f.dir);

  for (const entry of entries) {
    const blob = await entry.async("blob");
    const size = blob.size;
    totalSize += size;

    // Auto-detect manifests
    const lowerPath = entry.name.toLowerCase();
    if (
      lowerPath === "manifest.json" ||
      lowerPath.endsWith("/manifest.json")
    ) {
      try {
        manifest = JSON.parse(await blob.text());
      } catch {
        manifest = null;
      }
    }
    if (
      lowerPath === "pack.mcmeta" ||
      lowerPath.endsWith("/pack.mcmeta")
    ) {
      try {
        packMeta = JSON.parse(await blob.text());
      } catch {
        packMeta = null;
      }
    }

    const name = entry.name.split("/").pop() || entry.name;
    out.push({
      path: entry.name,
      name,
      size,
      prettySize: prettySize(size),
      kind: detectKind(name),
      blob,
    });
  }

  return {
    files: out,
    manifest,
    packMeta,
    totalSize,
    fileCount: out.length,
    formatSlug,
    originalName: file.name,
  };
}

/**
 * Try to decompress a gzipped NBT file and return its raw bytes (uncompressed).
 * In the browser, gzip can be decoded with `DecompressionStream` (built-in, no deps).
 */
export async function maybeGunzip(blob: Blob): Promise<Uint8Array> {
  const buf = new Uint8Array(await blob.arrayBuffer());
  // gzip magic number: 0x1f 0x8b
  if (buf.length >= 2 && buf[0] === 0x1f && buf[1] === 0x8b) {
    const ds = new (window as any).DecompressionStream("gzip") as {
      readable: ReadableStream<Uint8Array>;
      writable: WritableStream<Uint8Array>;
    };
    const writer = ds.writable.getWriter();
    writer.write(buf);
    writer.close();
    const reader = ds.readable.getReader();
    const chunks: Uint8Array[] = [];
    let total = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value);
      total += value.byteLength;
    }
    const out = new Uint8Array(total);
    let offset = 0;
    for (const c of chunks) {
      out.set(c, offset);
      offset += c.byteLength;
    }
    return out;
  }
  return buf;
}

export function downloadBlob(blob: Blob, filename: string) {
  saveAs(blob, filename);
}

export function readAsText(blob: Blob): Promise<string> {
  return blob.text();
}

export function readAsDataURL(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const fr = new FileReader();
    fr.onload = () => resolve(fr.result as string);
    fr.onerror = () => reject(fr.error);
    fr.readAsDataURL(blob);
  });
}

export async function reZipAll(files: ExtractedFile[]): Promise<Blob> {
  const zip = new JSZip();
  for (const f of files) {
    zip.file(f.path, f.blob);
  }
  return zip.generateAsync({ type: "blob" });
}
