"use client";

import { useCallback, useEffect, useState } from "react";
import {
  ShieldCheck,
  AlertTriangle,
  FileText,
  User,
  Tag,
  Globe,
  Copy,
  Check,
  Loader2,
  ScrollText,
  Scale,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
  SheetTrigger,
} from "@/components/ui/sheet";
import { cn } from "@/lib/utils";

type LicenseInfo = {
  /** Detected SPDX identifier or null if unknown/proprietary */
  detected: string | null;
  /** Whether the .jar has a LICENSE/NOTICE file */
  hasLicenseFile: boolean;
  /** Names of license-bearing files found */
  licenseFiles: string[];
  /** Raw text of the LICENSE file (truncated) */
  licenseText: string | null;
  /** Plugin metadata extracted from plugin.yml / fabric.mod.json etc. */
  pluginMeta: {
    name?: string;
    version?: string;
    author?: string;
    description?: string;
    website?: string;
  } | null;
  /** Whether the plugin metadata indicates a premium/paid plugin */
  looksPremium: boolean;
  /** Evidence: which strings suggest it's premium */
  premiumEvidence: string[];
};

const SPDX_SIGNATURES: { id: string; match: RegExp; label: string; url: string }[] = [
  {
    id: "MIT",
    match: /Permission is hereby granted, free of charge, to any person obtaining a copy/i,
    label: "MIT License",
    url: "https://opensource.org/licenses/MIT",
  },
  {
    id: "Apache-2.0",
    match: /Apache License, Version 2\.0/i,
    label: "Apache License 2.0",
    url: "https://www.apache.org/licenses/LICENSE-2.0",
  },
  {
    id: "GPL-3.0",
    match: /GNU GENERAL PUBLIC LICENSE\s+Version 3/i,
    label: "GNU GPL v3",
    url: "https://www.gnu.org/licenses/gpl-3.0.html",
  },
  {
    id: "GPL-2.0",
    match: /GNU GENERAL PUBLIC LICENSE\s+Version 2/i,
    label: "GNU GPL v2",
    url: "https://www.gnu.org/licenses/old-licenses/gpl-2.0.html",
  },
  {
    id: "LGPL-3.0",
    match: /GNU LESSER GENERAL PUBLIC LICENSE\s+Version 3/i,
    label: "GNU LGPL v3",
    url: "https://www.gnu.org/licenses/lgpl-3.0.html",
  },
  {
    id: "BSD-3-Clause",
    match: /Redistribution and use in source and binary forms.*with.*without.*modification.*are permitted provided that the following conditions are met/i,
    label: "BSD 3-Clause",
    url: "https://opensource.org/licenses/BSD-3-Clause",
  },
  {
    id: "ISC",
    match: /ISC License/i,
    label: "ISC License",
    url: "https://opensource.org/licenses/ISC",
  },
  {
    id: "MPL-2.0",
    match: /Mozilla Public License.*Version 2\.0/i,
    label: "Mozilla Public License 2.0",
    url: "https://www.mozilla.org/en-US/MPL/2.0/",
  },
  {
    id: "Unlicense",
    match: /This is free and unencumbered software released into the public domain/i,
    label: "The Unlicense",
    url: "https://unlicense.org/",
  },
];

const PREMIUM_INDICATORS = [
  /premium/i,
  /\blicense key\b/i,
  /\blicence key\b/i,
  /activation key/i,
  /purchase required/i,
  /spigotmc\.org\/resources\//i,
  /polymart\.org\/resource\//i,
  /\btrial\b/i,
  /\bexpired\b/i,
  /\bunauthorized\b/i,
  /\bplease (?:purchase|buy|register)\b/i,
];

export function LicenseViewerSection() {
  const [info, setInfo] = useState<LicenseInfo | null>(null);
  const [busy, setBusy] = useState(false);

  const handleFile = useCallback(async (file: File) => {
    setBusy(true);
    try {
      const { extractArchive } = await import("@/lib/mc-extract");
      const archive = await extractArchive(file);
      // 1. Find LICENSE / NOTICE files
      const licenseFiles = archive.files.filter((f) =>
        /^(LICENSE|LICENCE|NOTICE|COPYING|COPYRIGHT)(\.(md|txt))?$/i.test(
          f.path.split("/").pop() || ""
        )
      );
      let licenseText: string | null = null;
      if (licenseFiles.length > 0) {
        licenseText = await licenseFiles[0].blob.text();
        if (licenseText.length > 50000) {
          licenseText = licenseText.slice(0, 50000) + "\n\n… (truncado)";
        }
      }

      // 2. Detect SPDX
      let detected: string | null = null;
      if (licenseText) {
        for (const sig of SPDX_SIGNATURES) {
          if (sig.match.test(licenseText)) {
            detected = sig.id;
            break;
          }
        }
      }

      // 3. Find plugin metadata (plugin.yml, fabric.mod.json, etc.)
      let pluginMeta: LicenseInfo["pluginMeta"] = null;
      const pyml = archive.files.find((f) => f.path === "plugin.yml" || f.path.endsWith("/plugin.yml"));
      if (pyml) {
        const text = await pyml.blob.text();
        const get = (key: string) => {
          const m = text.match(new RegExp(`^${key}:\\s*(.+)$`, "m"));
          return m ? m[1].replace(/^["']|["']$/g, "").trim() : undefined;
        };
        pluginMeta = {
          name: get("name"),
          version: get("version"),
          author: get("author") || get("authors"),
          description: get("description"),
          website: get("website"),
        };
      } else {
        const fmjson = archive.files.find(
          (f) => f.path === "fabric.mod.json" || f.path.endsWith("/fabric.mod.json")
        );
        if (fmjson) {
          try {
            const j = JSON.parse(await fmjson.blob.text());
            pluginMeta = {
              name: j.name || j.id,
              version: j.version,
              author: Array.isArray(j.authors) ? j.authors.map((a) => a.name || a).join(", ") : undefined,
              description: j.description,
              website: j.contact?.homepage || j.contact?.sources?.[0],
            };
          } catch {
            /* ignore */
          }
        }
      }

      // 4. Scan string constants in .class files for premium indicators
      const premiumEvidence: string[] = [];
      const classFiles = archive.files.filter((f) => f.path.endsWith(".class"));
      const scanLimit = Math.min(classFiles.length, 30); // scan first 30 .class
      for (let i = 0; i < scanLimit; i++) {
        const buf = new Uint8Array(await classFiles[i].blob.arrayBuffer());
        // crude: scan for printable ASCII strings ≥4 chars
        let current = "";
        for (let j = 0; j < buf.length; j++) {
          const b = buf[j];
          if (b >= 32 && b < 127) {
            current += String.fromCharCode(b);
          } else {
            if (current.length >= 6 && current.length <= 200) {
              for (const re of PREMIUM_INDICATORS) {
                if (re.test(current)) {
                  const truncated =
                    current.length > 80 ? current.slice(0, 80) + "…" : current;
                  if (!premiumEvidence.includes(truncated)) {
                    premiumEvidence.push(truncated);
                  }
                  break;
                }
              }
            }
            current = "";
          }
        }
      }

      setInfo({
        detected,
        hasLicenseFile: licenseFiles.length > 0,
        licenseFiles: licenseFiles.map((f) => f.path),
        licenseText,
        pluginMeta,
        looksPremium: premiumEvidence.length > 0,
        premiumEvidence: premiumEvidence.slice(0, 20),
      });
    } catch (e) {
      setInfo({
        detected: null,
        hasLicenseFile: false,
        licenseFiles: [],
        licenseText: null,
        pluginMeta: null,
        looksPremium: false,
        premiumEvidence: [`Error al procesar el .jar: ${(e as Error).message}`],
      });
    } finally {
      setBusy(false);
    }
  }, []);

  return (
    <section id="license-info" className="scroll-mt-20">
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        <div className="lg:col-span-5">
          <p className="text-xs font-mono uppercase tracking-widest text-primary">
            License Info Viewer
          </p>
          <h2 className="mt-1 text-3xl font-extrabold tracking-tight">
            ¿Cuál es la licencia{" "}
            <span className="text-primary">de este plugin?</span>
          </h2>
          <p className="mt-3 text-sm text-muted-foreground leading-relaxed">
            zDescompiler <strong className="text-foreground">no elimina, crackea
            ni elude</strong> verificaciones de licencia de plugins premium. Lo
            que sí hace es mostrarte <strong className="text-foreground">la
            licencia REAL</strong> del plugin: lee el archivo{" "}
            <code className="text-primary font-mono">LICENSE</code>, detecta el
            SPDX (MIT, GPL, Apache…), y si el .jar <em>no trae</em> LICENSE te
            avisa de que es propietario y debes respetar al autor.
          </p>
          <div className="mt-4 p-3 rounded-lg border border-amber-500/30 bg-amber-500/5 text-xs">
            <p className="font-semibold text-amber-500 flex items-center gap-1.5 mb-1">
              <AlertTriangle className="h-4 w-4" /> Aviso legal
            </p>
            <p className="text-muted-foreground leading-relaxed">
              Si un plugin es de pago (SpigotMC Premium, Polymart, etc.), debes
              <strong className="text-foreground"> comprarlo al autor</strong>.
              Distribuir o usar versiones crackeadas viola el DMCA, la Directiva
              UE 2001/29/EC y los ToS de SpigotMC/Polymart. zDescompiler no
              facilita esa práctica.
            </p>
          </div>
        </div>

        <div className="lg:col-span-7">
          <div className="rounded-xl border border-border bg-card p-5">
            <input
              type="file"
              accept=".jar,.zip"
              className="sr-only"
              id="license-file-input"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) handleFile(f);
                e.currentTarget.value = "";
              }}
            />
            <div className="flex items-center justify-between flex-wrap gap-3">
              <div>
                <h3 className="font-semibold text-sm">
                  Analiza la licencia de un .jar
                </h3>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Lee LICENSE / NOTICE / plugin.yml / fabric.mod.json del .jar.
                </p>
              </div>
              <Button
                size="sm"
                disabled={busy}
                onClick={() => document.getElementById("license-file-input")?.click()}
              >
                {busy ? (
                  <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
                ) : (
                  <Scale className="h-3.5 w-3.5 mr-1.5" />
                )}
                {busy ? "Analizando…" : "Elegir .jar"}
              </Button>
            </div>

            {info && <LicenseInfoDisplay info={info} />}
          </div>
        </div>
      </div>
    </section>
  );
}

function LicenseInfoDisplay({ info }: { info: LicenseInfo }) {
  const [copied, setCopied] = useState(false);

  const detectedSig = info.detected
    ? SPDX_SIGNATURES.find((s) => s.id === info.detected)
    : null;

  const copyLicense = async () => {
    if (!info.licenseText) return;
    try {
      await navigator.clipboard.writeText(info.licenseText);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* ignore */
    }
  };

  return (
    <div className="mt-5 space-y-4">
      {/* Detected license banner */}
      {detectedSig ? (
        <div className="p-3 rounded-lg border border-emerald-500/30 bg-emerald-500/5">
          <p className="text-xs font-mono uppercase tracking-wider text-emerald-500 mb-1 flex items-center gap-1.5">
            <ShieldCheck className="h-3.5 w-3.5" /> Licencia detectada
          </p>
          <div className="flex items-baseline justify-between gap-2 flex-wrap">
            <span className="text-base font-bold">{detectedSig.label}</span>
            <a
              href={detectedSig.url}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs text-primary hover:underline"
            >
              Leer texto completo →
            </a>
          </div>
          <p className="text-[11px] text-muted-foreground mt-1">
            SPDX: <code className="font-mono">{info.detected}</code> · Puedes
            usar, modificar y distribuir según los términos de esta licencia
            open-source.
          </p>
        </div>
      ) : info.hasLicenseFile ? (
        <div className="p-3 rounded-lg border border-amber-500/30 bg-amber-500/5">
          <p className="text-xs font-mono uppercase tracking-wider text-amber-500 mb-1 flex items-center gap-1.5">
            <FileText className="h-3.5 w-3.5" /> Archivo LICENSE presente, tipo no reconocido
          </p>
          <p className="text-[11px] text-muted-foreground">
            El .jar incluye <code className="font-mono">{info.licenseFiles.join(", ")}</code> pero
            no coincide con ninguna licencia open-source conocida (MIT, GPL, Apache…).
            Lee el texto completo abajo para entender qué permite.
          </p>
        </div>
      ) : (
        <div className="p-3 rounded-lg border border-rose-500/40 bg-rose-500/10">
          <p className="text-xs font-mono uppercase tracking-wider text-rose-500 mb-1 flex items-center gap-1.5">
            <AlertTriangle className="h-3.5 w-3.5" /> Sin archivo de licencia → Propietario
          </p>
          <p className="text-[11px] text-muted-foreground leading-relaxed">
            Este .jar <strong className="text-foreground">NO incluye</strong> LICENSE,
            COPYING ni NOTICE. Por defecto legal, esto significa{" "}
            <strong className="text-foreground">"All Rights Reserved"</strong> — no
            puedes redistribuirlo ni modificarlo. Si es un plugin premium de
            SpigotMC/Polymart, debes{" "}
            <strong className="text-foreground">comprarlo al autor</strong> para
            usarlo legalmente.
          </p>
        </div>
      )}

      {/* Plugin metadata */}
      {info.pluginMeta && (
        <div className="p-3 rounded-lg border border-border bg-muted/20">
          <p className="text-xs font-mono uppercase tracking-wider text-muted-foreground mb-2 flex items-center gap-1.5">
            <ScrollText className="h-3.5 w-3.5" /> Metadatos del plugin
          </p>
          <dl className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
            {info.pluginMeta.name && (
              <div className="flex items-center gap-1.5">
                <Tag className="h-3.5 w-3.5 text-muted-foreground" />
                <span className="text-muted-foreground">Nombre:</span>
                <span className="font-medium">{info.pluginMeta.name}</span>
              </div>
            )}
            {info.pluginMeta.version && (
              <div className="flex items-center gap-1.5">
                <Tag className="h-3.5 w-3.5 text-muted-foreground" />
                <span className="text-muted-foreground">Versión:</span>
                <span className="font-mono">{info.pluginMeta.version}</span>
              </div>
            )}
            {info.pluginMeta.author && (
              <div className="flex items-center gap-1.5">
                <User className="h-3.5 w-3.5 text-muted-foreground" />
                <span className="text-muted-foreground">Autor:</span>
                <span className="font-medium">{info.pluginMeta.author}</span>
              </div>
            )}
            {info.pluginMeta.website && (
              <div className="flex items-center gap-1.5">
                <Globe className="h-3.5 w-3.5 text-muted-foreground" />
                <span className="text-muted-foreground">Web:</span>
                <a
                  href={info.pluginMeta.website}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-primary hover:underline truncate max-w-[200px]"
                >
                  {info.pluginMeta.website}
                </a>
              </div>
            )}
          </dl>
          {info.pluginMeta.description && (
            <p className="text-[11px] text-muted-foreground mt-2 pt-2 border-t border-border/40 italic">
              {info.pluginMeta.description}
            </p>
          )}
        </div>
      )}

      {/* Premium indicator scan */}
      <div className="p-3 rounded-lg border border-border bg-muted/20">
        <p className="text-xs font-mono uppercase tracking-wider text-muted-foreground mb-2 flex items-center gap-1.5">
          <AlertTriangle className="h-3.5 w-3.5" /> Análisis de indicios premium
        </p>
        {info.looksPremium ? (
          <>
            <p className="text-[11px] text-amber-500 mb-2">
              Se detectaron strings típicos de verificación de licencia en los .class:
            </p>
            <ul className="space-y-1">
              {info.premiumEvidence.map((s, i) => (
                <li
                  key={i}
                  className="text-[11px] font-mono px-2 py-1 rounded bg-amber-500/5 border border-amber-500/10 break-all"
                >
                  "{s}"
                </li>
              ))}
            </ul>
            <p className="text-[11px] text-muted-foreground mt-2 pt-2 border-t border-border/40">
              <strong className="text-foreground">Conclusión:</strong> Este plugin
              tiene mecanismos de verificación de licencia. <strong className="text-foreground">No
              intentes eludirlos</strong> — es ilegal bajo DMCA Sec. 1201 y
              Directiva UE 2001/29/EC. Compra el plugin al autor.
            </p>
          </>
        ) : (
          <p className="text-[11px] text-emerald-500">
            ✓ No se detectaron strings típicos de licencia premium en los
            primeros 30 .class escaneados. Probablemente es un plugin gratuito o
            sin verificación de licencia.
          </p>
        )}
      </div>

      {/* Raw LICENSE text */}
      {info.licenseText && (
        <div className="p-3 rounded-lg border border-border bg-muted/20">
          <div className="flex items-center justify-between mb-2">
            <p className="text-xs font-mono uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
              <FileText className="h-3.5 w-3.5" /> Texto del archivo LICENSE
            </p>
            <Button size="sm" variant="ghost" className="h-6" onClick={copyLicense}>
              {copied ? (
                <Check className="h-3 w-3 mr-1 text-emerald-500" />
              ) : (
                <Copy className="h-3 w-3 mr-1" />
              )}
              {copied ? "Copiado" : "Copiar"}
            </Button>
          </div>
          <ScrollArea className="scroll-mc h-64 rounded border border-border/50 bg-background p-3">
            <pre className="text-[11px] font-mono whitespace-pre-wrap break-words text-foreground/80">
              {info.licenseText}
            </pre>
          </ScrollArea>
        </div>
      )}
    </div>
  );
}
