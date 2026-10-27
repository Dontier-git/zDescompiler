"use client";

import { useCallback, useState } from "react";
import { Upload, FileArchive, Loader2, ShieldCheck, Zap, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { toast } from "sonner";
import {
  extractArchive,
  type ExtractedArchive,
} from "@/lib/mc-extract";
import { matchFormats } from "@/lib/mc-formats";
import { FileExplorer } from "@/components/file-explorer";
import { cn } from "@/lib/utils";

const ACCEPT =
  ".mcpack,.mcaddon,.mcworld,.mctemplate,.jar,.zip,.nbt,.dat,.litematic,.schem,.schematic,.mcfunction,.properties,.mcmeta,.json,.png,.lang";

export function HeroUpload() {
  const [dragOver, setDragOver] = useState(false);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(0);
  const [phase, setPhase] = useState("");
  const [archive, setArchive] = useState<ExtractedArchive | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleFile = useCallback(async (file: File) => {
    setBusy(true);
    setError(null);
    setArchive(null);
    setProgress(5);
    setPhase("Leyendo archivo…");

    try {
      // small delay so the user sees the progress
      await new Promise((r) => setTimeout(r, 50));
      setProgress(20);
      setPhase("Detectando formato…");
      const matches = matchFormats(file.name);
      await new Promise((r) => setTimeout(r, 80));
      setProgress(40);
      setPhase("Extrayendo contenido en el navegador…");
      const result = await extractArchive(file);
      setProgress(80);
      setPhase("Indexando árbol…");
      await new Promise((r) => setTimeout(r, 80));
      setProgress(100);
      setPhase("Listo");
      setArchive(result);

      const matched = matches.length > 0 ? matches[0] : null;
      if (matched) {
        toast.success(`Formato reconocido: ${matched.name}`);
      } else {
        toast.success(`Archivo "${file.name}" procesado en el navegador.`);
      }
      setTimeout(() => {
        const el = document.getElementById("explorer");
        el?.scrollIntoView({ behavior: "smooth", block: "start" });
      }, 100);
    } catch (e) {
      const msg = (e as Error).message || String(e);
      setError(msg);
      toast.error(`No pudimos procesar el archivo: ${msg}`);
    } finally {
      setBusy(false);
      setTimeout(() => {
        setProgress(0);
        setPhase("");
      }, 1000);
    }
  }, []);

  const onDrop = useCallback(
    (e: React.DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      setDragOver(false);
      const f = e.dataTransfer.files?.[0];
      if (f) handleFile(f);
    },
    [handleFile]
  );

  return (
    <div id="upload" className="relative">
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Drop zone — spans 2 cols on large screens */}
        <div className="lg:col-span-2">
          <div
            onDragOver={(e) => {
              e.preventDefault();
              setDragOver(true);
            }}
            onDragLeave={() => setDragOver(false)}
            onDrop={onDrop}
            className={cn(
              "relative rounded-2xl border-2 border-dashed bg-card/60 backdrop-blur transition-colors",
              "min-h-[260px] flex flex-col items-center justify-center text-center p-6",
              dragOver
                ? "border-primary bg-primary/10 animate-pulse-orange"
                : "border-border hover:border-primary/50"
            )}
          >
            <input
              type="file"
              accept={ACCEPT}
              className="sr-only"
              id="file-input"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) handleFile(f);
                e.currentTarget.value = "";
              }}
            />
            <div className="absolute inset-0 bg-block-tile pointer-events-none rounded-2xl" />
            <div className="relative z-10 flex flex-col items-center">
              <div className="mb-4 inline-flex items-center justify-center h-14 w-14 rounded-xl bg-primary/15 text-primary border border-primary/30">
                <Upload className="h-6 w-6" />
              </div>
              <h2 className="text-lg font-semibold">
                Suelta aquí tu archivo de Minecraft
              </h2>
              <p className="text-sm text-muted-foreground mt-1 max-w-md">
                <span className="font-mono text-primary">.mcpack</span>,{" "}
                <span className="font-mono text-primary">.mcaddon</span>,{" "}
                <span className="font-mono text-primary">.mcworld</span>,{" "}
                <span className="font-mono text-primary">.mctemplate</span>,{" "}
                <span className="font-mono text-primary">.jar</span> (mod),{" "}
                <span className="font-mono text-primary">.nbt</span>,{" "}
                <span className="font-mono text-primary">.litematic</span>,{" "}
                <span className="font-mono text-primary">.schem</span>,{" "}
                <span className="font-mono text-primary">.zip</span> y más.
              </p>
              <Button
                type="button"
                variant="outline"
                className="mt-4"
                disabled={busy}
                onClick={() => document.getElementById("file-input")?.click()}
              >
                <FileArchive className="h-4 w-4 mr-1.5" />
                Elegir archivo
              </Button>
              <div className="flex items-center gap-2 mt-3 text-[11px] text-muted-foreground">
                <ShieldCheck className="h-3.5 w-3.5 text-orange-400" />
                100% en tu navegador · sin upload · sin servidor
                <Zap className="h-3.5 w-3.5 text-amber-500" />
              </div>
            </div>
          </div>

          {busy && (
            <div className="mt-3 p-3 rounded-lg border border-border bg-card">
              <div className="flex items-center gap-2 text-sm mb-2">
                <Loader2 className="h-4 w-4 animate-spin text-primary" />
                <span className="font-medium">{phase}</span>
              </div>
              <Progress value={progress} className="h-2" />
            </div>
          )}

          {error && (
            <div className="mt-3 p-3 rounded-lg border border-destructive/30 bg-destructive/10 text-destructive text-sm flex items-start gap-2">
              <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
              <div>
                <p className="font-semibold mb-1">No se pudo procesar el archivo</p>
                <p className="text-xs opacity-80">{error}</p>
              </div>
            </div>
          )}
        </div>

        {/* Side card: what we detect */}
        <aside className="rounded-2xl border border-border bg-card/60 backdrop-blur p-5">
          <h3 className="text-sm font-semibold flex items-center gap-2">
            <ShieldCheck className="h-4 w-4 text-primary" />
            ¿Por qué zDescompiler?
          </h3>
          <ul className="mt-3 space-y-2 text-sm text-muted-foreground">
            <li className="flex gap-2">
              <span className="text-primary">·</span>
              <span>
                <strong className="text-foreground">Privado por diseño.</strong> Tu
                archivo nunca sale de tu navegador: cero uploads, cero servidores
                intermediarios.
              </span>
            </li>
            <li className="flex gap-2">
              <span className="text-primary">·</span>
              <span>
                <strong className="text-foreground">Instantáneo.</strong> La
                extracción es cliente-side con WebAssembly y el parser NBT nativo
                — archivos de 200 MB se procesan en segundos.
              </span>
            </li>
            <li className="flex gap-2">
              <span className="text-primary">·</span>
              <span>
                <strong className="text-foreground">Sin registro.</strong> No hay
                cuenta, no hay cookie de sesión, no hay marca de agua. Sube, mira,
                descarga, vete.
              </span>
            </li>
            <li className="flex gap-2">
              <span className="text-primary">·</span>
              <span>
                <strong className="text-foreground">Multi-formato.</strong> 23
                formatos de Minecraft cubiertos entre Bedrock, Java, Forge,
                Fabric, datapacks y schematics.
              </span>
            </li>
          </ul>
          <div className="mt-4 pt-4 border-t border-border">
            <p className="text-[11px] text-muted-foreground">
              ¿Falta un formato? Avísanos y lo añadimos — todos los formatos
              Minecraft enZIP / NBT son relativamente triviales de cubrir.
            </p>
          </div>
        </aside>
      </div>

      {archive && (
        <div id="explorer" className="mt-8 scroll-mt-20">
          <div className="flex items-baseline justify-between mb-3">
            <h2 className="text-xl font-bold">
              <span className="text-primary">▸</span> Explorador de archivos
            </h2>
            <span className="text-xs text-muted-foreground">
              {archive.fileCount} entradas ·{" "}
              {archive.files.reduce((s, f) => s + f.size, 0) > 1024 * 1024
                ? `${(archive.files.reduce((s, f) => s + f.size, 0) / 1024 / 1024).toFixed(2)} MB`
                : `${(archive.files.reduce((s, f) => s + f.size, 0) / 1024).toFixed(1)} KB`}
            </span>
          </div>
          <FileExplorer archive={archive} />
        </div>
      )}
    </div>
  );
}
