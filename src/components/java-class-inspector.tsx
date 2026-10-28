"use client";

import { useMemo, useState } from "react";
import {
  ChevronDown,
  ChevronRight,
  Braces,
  FunctionSquare,
  Variable,
  Database,
  Code2,
  Search,
  Copy,
  Check,
  FileCode2,
} from "lucide-react";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  type JavaClass,
  type MethodInfo,
  type FieldInfo,
  type BytecodeInstruction,
  type ConstantPoolEntry,
  accessFlagsToString,
  formatCpEntry,
} from "@/lib/java-class";
import { cn } from "@/lib/utils";

export function JavaClassInspector({ cls }: { cls: JavaClass }) {
  const [search, setSearch] = useState("");
  const [copied, setCopied] = useState(false);

  const fullHeader = useMemo(() => {
    const flags = accessFlagsToString(cls.accessFlags, "class");
    let s = flags ? `${flags} ` : "";
    s += `class ${cls.thisClass}`;
    if (cls.superClass && cls.superClass !== "java.lang.Object") {
      s += ` extends ${cls.superClass}`;
    }
    if (cls.interfaces.length > 0) {
      s += ` implements ${cls.interfaces.join(", ")}`;
    }
    s += ` {  // ${cls.javaVersion}`;
    return s;
  }, [cls]);

  const copyAll = async () => {
    const lines: string[] = [];
    lines.push(`// Decompiled by zDescompiler — .class structure (not full source)`);
    lines.push(`// Class version: ${cls.majorVersion}.${cls.minorVersion} (${cls.javaVersion})`);
    lines.push(`// Constant pool: ${cls.constantPoolSize - 1} entries`);
    lines.push(``);
    lines.push(`${fullHeader}`);
    lines.push(``);
    if (cls.fields.length > 0) {
      lines.push(`  // Fields (${cls.fields.length})`);
      for (const f of cls.fields) {
        lines.push(`  ${accessFlagsToString(f.accessFlags, "field")} ${f.signature} ${f.name};`);
      }
      lines.push(``);
    }
    if (cls.methods.length > 0) {
      lines.push(`  // Methods (${cls.methods.length})`);
      for (const m of cls.methods) {
        const flags = accessFlagsToString(m.accessFlags, "method");
        const params = m.decodedSignature.parameterTypes.join(", ");
        lines.push(`  ${flags ? flags + " " : ""}${m.decodedSignature.returnType} ${m.name}(${params}) {`);
        if (m.code) {
          lines.push(`    // bytecode: ${m.code.codeLength} bytes, max_stack=${m.code.maxStack}, max_locals=${m.code.maxLocals}`);
          for (const ins of m.code.instructions) {
            const operandPart = ins.operands.length
              ? ` ${ins.operands.map((o) => o.toString(16).padStart(2, "0")).join(" ")}`
              : "";
            const comment = ins.operandComment ? `  // ${ins.operandComment}` : "";
            lines.push(`    ${ins.offset.toString().padStart(4)}: ${ins.mnemonic}${operandPart}${comment}`);
          }
        } else {
          lines.push(`    // (no code — abstract or native)`);
        }
        lines.push(`  }`);
      }
    }
    lines.push(`}`);
    lines.push(``);
    lines.push(`// Constant pool`);
    for (let i = 1; i < cls.constantPool.length; i++) {
      const e = cls.constantPool[i];
      if (!e) continue;
      lines.push(`  #${i} = ${formatCpEntry(cls.constantPool, i)}`);
    }
    try {
      await navigator.clipboard.writeText(lines.join("\n"));
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* ignore */
    }
  };

  return (
    <div className="flex flex-col h-full">
      {/* Top bar: class header + copy button */}
      <div className="px-4 py-2 border-b border-border bg-muted/20 flex items-center gap-2 flex-wrap">
        <Badge variant="secondary" className="font-mono text-[10px]">
          {cls.javaVersion}
        </Badge>
        <span className="text-xs font-mono text-foreground/90 truncate flex-1 min-w-0">
          {fullHeader}
        </span>
        <Button size="sm" variant="ghost" className="h-7" onClick={copyAll}>
          {copied ? (
            <Check className="h-3 w-3 mr-1 text-orange-400" />
          ) : (
            <Copy className="h-3 w-3 mr-1" />
          )}
          {copied ? "Copiado" : "Copiar texto"}
        </Button>
      </div>

      <Tabs defaultValue="structure" className="flex-1 flex flex-col overflow-hidden">
        <div className="px-3 pt-2 border-b border-border/50">
          <TabsList className="h-9 self-start">
            <TabsTrigger value="structure" className="text-xs">
              <Code2 className="h-3.5 w-3.5 mr-1.5" />
              Estructura
            </TabsTrigger>
            <TabsTrigger value="bytecode" className="text-xs">
              <FileCode2 className="h-3.5 w-3.5 mr-1.5" />
              Bytecode
            </TabsTrigger>
            <TabsTrigger value="constants" className="text-xs">
              <Database className="h-3.5 w-3.5 mr-1.5" />
              Constant pool ({cls.constantPoolSize - 1})
            </TabsTrigger>
          </TabsList>
        </div>

        <TabsContent value="structure" className="flex-1 overflow-auto scroll-mc m-0">
          <StructureView cls={cls} />
        </TabsContent>

        <TabsContent value="bytecode" className="flex-1 overflow-auto scroll-mc m-0">
          <BytecodeView cls={cls} />
        </TabsContent>

        <TabsContent value="constants" className="flex-1 overflow-hidden m-0 flex flex-col">
          <div className="px-3 pt-2 pb-1 border-b border-border/50">
            <div className="relative">
              <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
              <Input
                placeholder="Filtrar constantes (string, class, method, etc.)…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="h-8 text-xs pl-8"
              />
            </div>
          </div>
          <ScrollArea className="scroll-mc flex-1">
            <ConstantPoolView cp={cls.constantPool} filter={search} />
          </ScrollArea>
        </TabsContent>
      </Tabs>
    </div>
  );
}

function StructureView({ cls }: { cls: JavaClass }) {
  return (
    <div className="p-3 space-y-4">
      <Section title="Cabecera de la clase" icon={<Braces className="h-4 w-4" />}>
        <div className="font-mono text-xs space-y-1.5">
          <KV k="Clase" v={cls.thisClass} highlight />
          {cls.superClass && <KV k="Extiende" v={cls.superClass} />}
          {cls.interfaces.length > 0 && (
            <KV k="Implementa" v={cls.interfaces.join(", ")} />
          )}
          <KV k="Versión" v={`${cls.javaVersion} (major ${cls.majorVersion}, minor ${cls.minorVersion})`} />
          <KV
            k="Access flags"
            v={accessFlagsToString(cls.accessFlags, "class") || "(default package)"}
          />
          <KV k="Constant pool" v={`${cls.constantPoolSize - 1} entradas`} />
          <KV k="Campos" v={`${cls.fields.length}`} />
          <KV k="Métodos" v={`${cls.methods.length}`} />
        </div>
      </Section>

      <Section
        title={`Campos (${cls.fields.length})`}
        icon={<Variable className="h-4 w-4" />}
        empty={cls.fields.length === 0 ? "Sin campos" : undefined}
      >
        <div className="space-y-0.5">
          {cls.fields.map((f, i) => (
            <FieldRow key={i} field={f} />
          ))}
        </div>
      </Section>

      <Section
        title={`Métodos (${cls.methods.length})`}
        icon={<FunctionSquare className="h-4 w-4" />}
        empty={cls.methods.length === 0 ? "Sin métodos" : undefined}
      >
        <div className="space-y-1">
          {cls.methods.map((m, i) => (
            <MethodRow key={i} method={m} />
          ))}
        </div>
      </Section>
    </div>
  );
}

function Section({
  title,
  icon,
  children,
  empty,
}: {
  title: string;
  icon: React.ReactNode;
  children?: React.ReactNode;
  empty?: string;
}) {
  return (
    <div>
      <div className="flex items-center gap-2 mb-2 text-xs font-mono uppercase tracking-wider text-muted-foreground">
        <span className="text-primary">{icon}</span>
        {title}
      </div>
      {empty && !children ? (
        <div className="text-xs text-muted-foreground italic px-2">{empty}</div>
      ) : (
        children
      )}
    </div>
  );
}

function KV({
  k,
  v,
  highlight = false,
}: {
  k: string;
  v: string;
  highlight?: boolean;
}) {
  return (
    <div className="flex gap-2">
      <span className="text-muted-foreground shrink-0 w-28">{k}:</span>
      <span
        className={cn(
          "break-all",
          highlight ? "text-primary font-semibold" : "text-foreground"
        )}
      >
        {v}
      </span>
    </div>
  );
}

function FieldRow({ field }: { field: FieldInfo }) {
  const flags = accessFlagsToString(field.accessFlags, "field");
  return (
    <div className="font-mono text-xs px-2 py-1 hover:bg-muted/40 rounded">
      <span className="text-amber-400/90">{field.signature}</span>{" "}
      <span className="text-orange-400">{field.name}</span>
      <span className="text-muted-foreground">;{"  //"}</span>
      <span className="text-muted-foreground ml-2 text-[10px]">
        {flags || "package-private"}
      </span>
    </div>
  );
}

function MethodRow({ method }: { method: MethodInfo }) {
  const [open, setOpen] = useState(false);
  const flags = accessFlagsToString(method.accessFlags, "method");
  const params = method.decodedSignature.parameterTypes.join(", ");
  return (
    <div className="rounded border border-border/60 overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="w-full text-left px-2 py-1.5 hover:bg-muted/40 font-mono text-xs flex items-start gap-1.5"
      >
        {method.code ? (
          open ? (
            <ChevronDown className="h-3 w-3 mt-0.5 shrink-0 text-muted-foreground" />
          ) : (
            <ChevronRight className="h-3 w-3 mt-0.5 shrink-0 text-muted-foreground" />
          )
        ) : (
          <span className="inline-block w-3 shrink-0" />
        )}
        <span className="break-all">
          <span className="text-amber-400/90">{method.decodedSignature.returnType}</span>{" "}
          <span className="text-orange-400 font-semibold">{method.name}</span>
          <span className="text-foreground/80">({params})</span>
          {method.code ? (
            <span className="text-muted-foreground text-[10px] ml-2">
              {" // "}{method.code.codeLength}B · {method.code.instructions.length} insns
            </span>
          ) : (
            <span className="text-muted-foreground text-[10px] ml-2 italic">
              {" // sin código (abstract/native)"}
            </span>
          )}
        </span>
      </button>
      <div className="text-[10px] text-muted-foreground px-2 pb-1 -mt-1 ml-4">
        {flags || "package-private"} · descriptor:{" "}
        <code className="text-foreground/70">{method.descriptor}</code>
      </div>
      {open && method.code && (
        <div className="border-t border-border/50 bg-muted/15 p-2 overflow-auto scroll-mc max-h-72">
          <div className="text-[10px] text-muted-foreground mb-1.5">
            max_stack={method.code.maxStack}, max_locals={method.code.maxLocals},
            code_length={method.code.codeLength}
            {method.code.exceptionTable.length > 0 && (
              <>, exceptions={method.code.exceptionTable.length}</>
            )}
          </div>
          <BytecodeListing instructions={method.code.instructions} />
        </div>
      )}
    </div>
  );
}

function BytecodeListing({
  instructions,
}: {
  instructions: BytecodeInstruction[];
}) {
  return (
    <div className="font-mono text-[11px] leading-relaxed">
      {instructions.map((ins, i) => (
        <div key={i} className="flex gap-2 hover:bg-muted/50 px-1 rounded">
          <span className="text-muted-foreground shrink-0 w-12 text-right">
            {ins.offset.toString().padStart(4, "0")}:
          </span>
          <span className="text-orange-400 shrink-0 w-32">
            {ins.mnemonic}
          </span>
          {ins.operands.length > 0 && (
            <span className="text-cyan-400 shrink-0">
              {ins.operands.map((o) => o.toString(16).padStart(2, "0")).join(" ")}
            </span>
          )}
          {ins.operandComment && (
            <span className="text-muted-foreground/80 ml-2">
              {ins.operandComment}
            </span>
          )}
        </div>
      ))}
    </div>
  );
}

function BytecodeView({ cls }: { cls: JavaClass }) {
  const methodsWithCode = cls.methods.filter((m) => m.code);
  if (methodsWithCode.length === 0) {
    return (
      <div className="p-4 text-sm text-muted-foreground">
        Esta clase no tiene bytecode ({cls.methods.length} método(s) sin código
        — abstract/interface/native).
      </div>
    );
  }
  return (
    <div className="p-3 space-y-2">
      <div className="text-[10px] text-muted-foreground mb-2">
        Bytecode desensamblado de cada método con instrucciones JVM reales y
        referencias al constant pool resueltas.
      </div>
      {methodsWithCode.map((m, i) => (
        <MethodBytecodeBlock key={i} method={m} defaultOpen={i === 0} />
      ))}
    </div>
  );
}

function MethodBytecodeBlock({
  method,
  defaultOpen = false,
}: {
  method: MethodInfo;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const flags = accessFlagsToString(method.accessFlags, "method");
  const params = method.decodedSignature.parameterTypes.join(", ");
  return (
    <div className="rounded border border-border/60 overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="w-full text-left px-2 py-1.5 hover:bg-muted/40 font-mono text-xs flex items-center gap-1.5"
      >
        {open ? (
          <ChevronDown className="h-3 w-3 shrink-0 text-muted-foreground" />
        ) : (
          <ChevronRight className="h-3 w-3 shrink-0 text-muted-foreground" />
        )}
        <span className="break-all">
          <span className="text-amber-400/90">{method.decodedSignature.returnType}</span>{" "}
          <span className="text-orange-400 font-semibold">{method.name}</span>
          <span className="text-foreground/80">({params})</span>
          <span className="text-muted-foreground text-[10px] ml-2">
            — {method.code!.codeLength}B · {method.code!.instructions.length} instrucciones
          </span>
        </span>
      </button>
      {open && (
        <div className="border-t border-border/50 bg-muted/15 p-2">
          <div className="text-[10px] text-muted-foreground mb-1.5">
            {flags || "package-private"} · descriptor:{" "}
            <code className="text-foreground/70">{method.descriptor}</code> ·
            max_stack={method.code!.maxStack}, max_locals={method.code!.maxLocals}
          </div>
          <BytecodeListing instructions={method.code!.instructions} />
          {method.code!.exceptionTable.length > 0 && (
            <div className="mt-2 pt-2 border-t border-border/40">
              <div className="text-[10px] uppercase text-muted-foreground mb-1">
                Tabla de excepciones
              </div>
              {method.code!.exceptionTable.map((ex, i) => (
                <div key={i} className="text-[11px] font-mono">
                  <span className="text-cyan-400">{ex.startPc}</span>–
                  <span className="text-cyan-400">{ex.endPc}</span> → handler{" "}
                  <span className="text-orange-400">{ex.handlerPc}</span>{" "}
                  <span className="text-muted-foreground">
                    {ex.catchType === null
                      ? // any
                        "catch any"
                      : `catch ${ex.catchType}`}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function ConstantPoolView({
  cp,
  filter,
}: {
  cp: ConstantPoolEntry[];
  filter: string;
}) {
  const q = filter.trim().toLowerCase();
  const rows: { i: number; text: string }[] = [];
  for (let i = 1; i < cp.length; i++) {
    const e = cp[i];
    if (!e) continue;
    const text = formatCpEntry(cp, i);
    if (!q || text.toLowerCase().includes(q)) {
      rows.push({ i, text });
    }
  }
  return (
    <div className="font-mono text-[11px] p-2">
      {rows.length === 0 ? (
        <div className="text-center text-muted-foreground text-xs py-6">
          No hay entradas que coincidan con "{filter}".
        </div>
      ) : (
        rows.map(({ i, text }) => (
          <div
            key={i}
            className="flex gap-2 py-0.5 px-1 hover:bg-muted/50 rounded break-all"
          >
            <span className="text-muted-foreground shrink-0 w-10 text-right">
              #{i}
            </span>
            <span className="text-muted-foreground shrink-0">=</span>
            <span className="text-foreground/90">{text}</span>
          </div>
        ))
      )}
    </div>
  );
}
