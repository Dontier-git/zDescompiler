"use client";

import { useEffect, useMemo, useState } from "react";
import {
  ChevronDown,
  ChevronUp,
  ChevronRight,
  Folder,
  FolderOpen,
  File as FileIcon,
  FileJson,
  FileText,
  Image as ImageIcon,
  Binary,
  FileCode2,
  Download,
  Search,
  ArrowLeft,
  Home,
  FileArchive,
  Layers,
  Sparkles,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  type ExtractedArchive,
  type ExtractedFile,
  downloadBlob,
  reZipAll,
  decompileArchiveToZip,
  readAsText,
  readAsDataURL,
  maybeGunzip,
} from "@/lib/mc-extract";
import { parseNbt, nbtToJson, type NbtNode } from "@/lib/nbt";
import { parseClassFile, type JavaClass } from "@/lib/java-class";
import { JsonTree } from "@/components/json-tree";
import { NbtInspector } from "@/components/nbt-inspector";
import { JavaClassInspector } from "@/components/java-class-inspector";
import { DecompilerTosModal } from "@/components/decompiler-tos-modal";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

type Item = {
  name: string;
  path: string;
  isDir: boolean;
  file?: ExtractedFile;
  /** Children count for directories */
  childCount?: number;
};

/** List items (folders + files) that are direct children of `dirPath`. */
function listAt(files: ExtractedFile[], dirPath: string): Item[] {
  const set = new Map<string, Item>();
  const prefix = dirPath ? dirPath + "/" : "";
  for (const f of files) {
    if (!f.path.startsWith(prefix)) continue;
    const rest = f.path.slice(prefix.length);
    if (!rest) continue;
    const slashIdx = rest.indexOf("/");
    if (slashIdx === -1) {
      // Direct file in this dir
      set.set(rest, { name: rest, path: f.path, isDir: false, file: f });
    } else {
      // Subdirectory
      const first = rest.slice(0, slashIdx);
      const subPath = prefix + first;
      if (!set.has(first)) {
        set.set(first, { name: first, path: subPath, isDir: true });
      }
    }
  }
  // Count children for each subdir
  for (const item of set.values()) {
    if (item.isDir) {
      const subPrefix = item.path + "/";
      item.childCount = files.filter((f) => f.path.startsWith(subPrefix)).length;
    }
  }
  return Array.from(set.values());
}

function iconForFile(f?: ExtractedFile) {
  if (!f) return <Folder className="h-4 w-4 text-primary" />;
  switch (f.kind) {
    case "image":
      return <ImageIcon className="h-4 w-4 text-orange-400" />;
    case "java_class":
    case "json":
    case "nbt":
      return <FileJson className="h-4 w-4 text-amber-500" />;
    case "text":
    case "mcfunction":
    case "properties":
      return <FileText className="h-4 w-4 text-orange-200" />;
    case "audio":
      return <FileCode2 className="h-4 w-4 text-pink-500" />;
    case "archive":
      return <FileArchive className="h-4 w-4 text-cyan-500" />;
    case "binary":
    default:
      return <Binary className="h-4 w-4 text-muted-foreground" />;
  }
}

type SortKey = "name" | "size" | "kind";
type SortDir = "asc" | "desc";

export function FileExplorer({
  archive,
}: {
  archive: ExtractedArchive;
}) {
  const [path, setPath] = useState<string>("");
  const [preview, setPreview] = useState<ExtractedFile | null>(null);
  const [filter, setFilter] = useState("");
  const [sortBy, setSortBy] = useState<SortKey>("name");
  const [sortDir, setSortDir] = useState<SortDir>("asc");
  const [decompilerOpen, setDecompilerOpen] = useState(false);
  const [decompiling, setDecompiling] = useState(false);

  const items = useMemo(() => listAt(archive.files, path), [archive.files, path]);

  const visibleItems = useMemo(() => {
    let list = [...items];
    const q = filter.trim().toLowerCase();
    if (q) list = list.filter((it) => it.name.toLowerCase().includes(q));
    list.sort((a, b) => {
      // Folders always first
      if (a.isDir !== b.isDir) return a.isDir ? -1 : 1;
      let cmp = 0;
      if (sortBy === "name") cmp = a.name.localeCompare(b.name);
      else if (sortBy === "size") {
        const sa = a.isDir ? 0 : a.file?.size || 0;
        const sb = b.isDir ? 0 : b.file?.size || 0;
        cmp = sa - sb;
      } else if (sortBy === "kind") {
        const ka = a.isDir ? "folder" : a.file?.kind || "binary";
        const kb = b.isDir ? "folder" : b.file?.kind || "binary";
        cmp = ka.localeCompare(kb);
      }
      return sortDir === "asc" ? cmp : -cmp;
    });
    return list;
  }, [items, filter, sortBy, sortDir]);

  const breadcrumbs = useMemo(() => {
    const parts = path.split("/").filter(Boolean);
    return parts.map((p, i) => ({
      name: p,
      path: parts.slice(0, i + 1).join("/"),
    }));
  }, [path]);

  const downloadAll = async () => {
    const blob = await reZipAll(archive.files);
    downloadBlob(blob, `${archive.originalName}.zdescompiler.zip`);
  };

  const hasClasses = archive.files.some((f) => f.path.endsWith(".class"));

  const decompileAndDownload = async () => {
    setDecompiling(true);
    try {
      const { blob, stats } = await decompileArchiveToZip(archive);
      downloadBlob(
        blob,
        `${archive.originalName.replace(/\.jar$/i, "")}.decompiled.zip`
      );
      toast.success(
        `Decompiled: ${stats.decompiledClasses}/${stats.totalClasses} .class → .java, ${stats.otherFiles} other files copied.`
      );
    } catch (e) {
      toast.error(`Decompilation failed: ${(e as Error).message}`);
    } finally {
      setDecompiling(false);
    }
  };

  const totalBytes = archive.files.reduce((s, f) => s + f.size, 0);
  const totalPretty =
    totalBytes > 1024 * 1024
      ? `${(totalBytes / 1024 / 1024).toFixed(2)} MB`
      : `${(totalBytes / 1024).toFixed(1)} KB`;

  const toggleSort = (key: SortKey) => {
    if (sortBy === key) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else {
      setSortBy(key);
      setSortDir("asc");
    }
  };

  return (
    <div className="rounded-lg border border-border bg-card overflow-hidden flex flex-col">
      {/* Top bar: file name + actions */}
      <div className="flex items-center justify-between gap-3 px-4 py-3 border-b border-border bg-muted/30 flex-wrap">
        <div className="flex items-center gap-2 min-w-0 flex-1">
          <FileArchive className="h-5 w-5 text-primary shrink-0" />
          <h2
            className="text-base font-semibold truncate"
            title={archive.originalName}
          >
            {archive.originalName}
          </h2>
          <span className="text-[10px] px-1.5 py-0.5 rounded-sm bg-primary/15 text-primary font-mono">
            .{archive.formatSlug}
          </span>
          <span className="text-xs text-muted-foreground hidden sm:inline">
            · {archive.fileCount} archivos · {totalPretty}
          </span>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {hasClasses && (
            <Button
              size="sm"
              onClick={() => setDecompilerOpen(true)}
              disabled={decompiling}
              title="Descargar .ZIP con todos los .class convertidos a .java legibles"
            >
              {decompiling ? (
                <Layers className="h-3.5 w-3.5 mr-1.5 animate-pulse" />
              ) : (
                <Sparkles className="h-3.5 w-3.5 mr-1.5" />
              )}
              {decompiling ? "Decompilando…" : "Descargar .ZIP descompilado"}
            </Button>
          )}
          <Button size="sm" variant="outline" onClick={downloadAll}>
            <Download className="h-3.5 w-3.5 mr-1.5" />
            Descargar ZIP
          </Button>
        </div>
      </div>

      {/* Breadcrumb */}
      <div className="flex items-center gap-1 px-4 py-2 border-b border-border text-sm overflow-x-auto scroll-mc">
        <button
          type="button"
          onClick={() => {
            setPath("");
            setFilter("");
          }}
          className={cn(
            "inline-flex items-center gap-1 px-1.5 py-0.5 rounded hover:bg-muted whitespace-nowrap",
            path === "" && "text-primary font-medium"
          )}
        >
          <Home className="h-3.5 w-3.5" />
          <span className="hidden sm:inline">raíz</span>
        </button>
        {breadcrumbs.map((b, i) => (
          <div key={b.path} className="flex items-center gap-1 whitespace-nowrap">
            <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
            <button
              type="button"
              onClick={() => {
                setPath(b.path);
                setFilter("");
              }}
              className={cn(
                "px-1.5 py-0.5 rounded hover:bg-muted truncate max-w-[200px]",
                i === breadcrumbs.length - 1 && "text-primary font-medium"
              )}
              title={b.name}
            >
              {b.name}
            </button>
          </div>
        ))}
      </div>

      {/* Toolbar: filter + sort buttons */}
      <div className="flex items-center gap-2 px-4 py-2 border-b border-border flex-wrap">
        <div className="relative flex-1 min-w-[180px]">
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            placeholder="Filtrar en esta carpeta…"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            className="pl-8 h-8 text-sm"
          />
        </div>
        <div className="flex items-center gap-1">
          <SortButton
            label="Nombre"
            active={sortBy === "name"}
            dir={sortDir}
            onClick={() => toggleSort("name")}
          />
          <SortButton
            label="Tamaño"
            active={sortBy === "size"}
            dir={sortDir}
            onClick={() => toggleSort("size")}
          />
          <SortButton
            label="Tipo"
            active={sortBy === "kind"}
            dir={sortDir}
            onClick={() => toggleSort("kind")}
          />
        </div>
      </div>

      {/* Listing — directory style like decompiler.com but better */}
      <div className="overflow-auto scroll-mc max-h-[600px]">
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent border-border">
              <TableHead className="w-[40px]"></TableHead>
              <TableHead className="text-[10px] uppercase tracking-wider text-muted-foreground">
                Nombre
              </TableHead>
              <TableHead className="text-[10px] uppercase tracking-wider text-muted-foreground w-[120px]">
                Tamaño
              </TableHead>
              <TableHead className="text-[10px] uppercase tracking-wider text-muted-foreground w-[120px] hidden md:table-cell">
                Tipo
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {/* Parent folder row */}
            {path !== "" && (
              <TableRow
                className="cursor-pointer hover:bg-muted/40"
                onClick={() => {
                  const parent = path.split("/").slice(0, -1).join("/");
                  setPath(parent);
                  setFilter("");
                }}
              >
                <TableCell>
                  <ArrowLeft className="h-4 w-4 text-muted-foreground" />
                </TableCell>
                <TableCell className="text-sm text-muted-foreground italic">
                  .. (carpeta superior)
                </TableCell>
                <TableCell></TableCell>
                <TableCell className="hidden md:table-cell"></TableCell>
              </TableRow>
            )}

            {visibleItems.map((it) => (
              <TableRow
                key={it.path}
                className="cursor-pointer hover:bg-muted/40 group transition-colors"
                onClick={() => {
                  if (it.isDir) {
                    setPath(it.path);
                    setFilter("");
                  } else if (it.file) {
                    setPreview(it.file);
                  }
                }}
              >
                <TableCell>
                  {it.isDir ? (
                    <Folder className="h-4 w-4 text-primary group-hover:hidden" />
                  ) : (
                    iconForFile(it.file)
                  )}
                  {it.isDir && (
                    <FolderOpen className="hidden group-hover:inline-block h-4 w-4 text-primary" />
                  )}
                </TableCell>
                <TableCell className="text-sm">
                  <span className="truncate inline-block max-w-[400px] align-bottom font-medium">
                    {it.name}
                  </span>
                  {it.isDir && it.childCount !== undefined && (
                    <span className="ml-2 text-[10px] text-muted-foreground">
                      ({it.childCount} archivo{it.childCount === 1 ? "" : "s"})
                    </span>
                  )}
                  {!it.isDir && (
                    <span className="ml-2 text-[10px] text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity">
                      clic para ver →
                    </span>
                  )}
                </TableCell>
                <TableCell className="text-xs text-muted-foreground tabular-nums">
                  {it.isDir ? "—" : it.file?.prettySize}
                </TableCell>
                <TableCell className="text-xs text-muted-foreground hidden md:table-cell">
                  {it.isDir
                    ? "carpeta"
                    : it.file?.kind === "java_class"
                    ? "java class"
                    : it.file?.kind === "mcfunction"
                    ? "mcfunction"
                    : it.file?.kind === "properties"
                    ? "properties"
                    : it.file?.kind || "binary"}
                </TableCell>
              </TableRow>
            ))}

            {visibleItems.length === 0 && (
              <TableRow>
                <TableCell
                  colSpan={4}
                  className="text-center text-sm text-muted-foreground py-12"
                >
                  {filter
                    ? "No hay coincidencias en esta carpeta."
                    : "Esta carpeta está vacía."}
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      {/* Preview Sheet — slides in from the right when clicking a file */}
      <Sheet
        open={!!preview}
        onOpenChange={(o) => !o && setPreview(null)}
      >
        <SheetContent
          side="right"
          className="w-full sm:max-w-2xl p-0 flex flex-col gap-0"
        >
          <SheetHeader className="px-4 py-3 border-b border-border bg-muted/30 space-y-2">
            <div className="flex items-center gap-2 min-w-0">
              {iconForFile(preview || undefined)}
              <SheetTitle
                className="text-sm truncate font-mono"
                title={preview?.path}
              >
                {preview?.path}
              </SheetTitle>
            </div>
            <SheetDescription className="sr-only">
              Vista previa del archivo seleccionado
            </SheetDescription>
            {preview && (
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-[10px] text-muted-foreground">
                  {preview.prettySize} ·{" "}
                  {preview.kind === "java_class" ? "Java .class" : preview.kind}
                </span>
                <Button
                  size="sm"
                  variant="outline"
                  className="h-7 ml-auto"
                  onClick={() => preview && downloadBlob(preview.blob, preview.name)}
                >
                  <Download className="h-3 w-3 mr-1.5" />
                  Descargar
                </Button>
              </div>
            )}
          </SheetHeader>
          <div className="flex-1 overflow-hidden min-h-[400px]">
            {preview && <FilePreview file={preview} key={preview.path} />}
          </div>
        </SheetContent>
      </Sheet>

      {/* Decompiler T&C Modal */}
      <DecompilerTosModal
        open={decompilerOpen}
        onOpenChange={setDecompilerOpen}
        fileName={archive.originalName}
        onAccept={decompileAndDownload}
      />
    </div>
  );
}

function SortButton({
  label,
  active,
  dir,
  onClick,
}: {
  label: string;
  active: boolean;
  dir: SortDir;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "inline-flex items-center gap-1 px-2.5 py-1 text-xs rounded-md border transition-colors",
        active
          ? "bg-primary text-primary-foreground border-primary"
          : "bg-background text-muted-foreground border-border hover:border-primary/40 hover:text-foreground"
      )}
    >
      {label}
      {active &&
        (dir === "asc" ? (
          <ChevronUp className="h-3 w-3" />
        ) : (
          <ChevronDown className="h-3 w-3" />
        ))}
    </button>
  );
}

type PreviewState =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "image"; url: string }
  | { status: "parsed"; data: unknown; raw: string }
  | { status: "nbt"; tree: NbtNode; json: unknown }
  | { status: "java_class"; cls: JavaClass }
  | { status: "text"; content: string; isProperties: boolean };

function FilePreview({ file }: { file: ExtractedFile }) {
  const [state, setState] = useState<PreviewState>({ status: "loading" });

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        if (file.kind === "image") {
          const url = await readAsDataURL(file.blob);
          if (!cancelled) setState({ status: "image", url });
          return;
        }
        if (file.kind === "json") {
          const text = await readAsText(file.blob);
          try {
            const json = JSON.parse(text);
            if (!cancelled) setState({ status: "parsed", data: json, raw: text });
          } catch {
            if (!cancelled)
              setState({ status: "text", content: text, isProperties: false });
          }
          return;
        }
        if (file.kind === "nbt") {
          const bytes = await maybeGunzip(file.blob);
          const tree = parseNbt(bytes);
          const json = nbtToJson(tree);
          if (!cancelled) setState({ status: "nbt", tree, json });
          return;
        }
        if (file.kind === "java_class") {
          const buf = new Uint8Array(await file.blob.arrayBuffer());
          const cls = parseClassFile(buf);
          if (!cancelled) setState({ status: "java_class", cls });
          return;
        }
        const text = await readAsText(file.blob);
        if (!cancelled) {
          setState({
            status: "text",
            content: text,
            isProperties: file.kind === "properties",
          });
        }
      } catch (e) {
        if (!cancelled) {
          setState({ status: "error", message: (e as Error).message });
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [file]);

  if (state.status === "error") {
    return (
      <div className="p-4 text-sm text-destructive">
        <p className="font-semibold mb-1">Error al leer el archivo</p>
        <pre className="whitespace-pre-wrap text-xs">{state.message}</pre>
      </div>
    );
  }

  if (state.status === "image") {
    return (
      <div
        className="flex items-center justify-center h-full p-4"
        style={{
          backgroundColor: "var(--muted)",
          backgroundImage:
            "repeating-conic-gradient(var(--muted) 0% 25%, var(--background) 0% 50%)",
          backgroundSize: "16px 16px",
        }}
      >
        <img
          src={state.url}
          alt={file.name}
          className="max-w-full max-h-full object-contain"
          style={{
            imageRendering: file.name.endsWith(".png") ? "pixelated" : undefined,
          }}
        />
      </div>
    );
  }

  if (state.status === "parsed") {
    return (
      <ScrollArea className="scroll-mc h-full">
        <div className="p-3">
          <JsonTree data={state.data} />
        </div>
      </ScrollArea>
    );
  }

  if (state.status === "nbt") {
    return <NbtInspector tree={state.tree} json={state.json} />;
  }

  if (state.status === "java_class") {
    return <JavaClassInspector cls={state.cls} />;
  }

  if (state.status === "text") {
    return (
      <ScrollArea className="scroll-mc h-full">
        <pre className="text-xs font-mono p-3 whitespace-pre-wrap break-words text-foreground/90">
          {state.content}
        </pre>
        {state.isProperties && (
          <div className="px-3 pb-3 text-[10px] text-muted-foreground">
            server.properties detectado · zDescompiler no envía datos al servidor.
          </div>
        )}
      </ScrollArea>
    );
  }

  return (
    <div className="flex flex-col items-center justify-center h-full text-muted-foreground p-6 text-center gap-2">
      <Layers className="h-10 w-10 opacity-40 animate-pulse" />
      <p className="text-sm">Cargando…</p>
    </div>
  );
}
