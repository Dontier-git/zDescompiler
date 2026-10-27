"use client";

import { useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

type JsonValue =
  | string
  | number
  | boolean
  | null
  | JsonValue[]
  | { [key: string]: JsonValue };

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}
function isArray(v: unknown): v is unknown[] {
  return Array.isArray(v);
}

function valueClass(v: unknown) {
  if (v === null) return "text-muted-foreground";
  if (typeof v === "boolean") return "text-amber-400";
  if (typeof v === "number") return "text-cyan-400";
  if (typeof v === "string") return "text-orange-300";
  return "text-foreground";
}

function prettyValue(v: unknown): string {
  if (v === null) return "null";
  if (typeof v === "string") return `"${v}"`;
  return String(v);
}

function Node({
  k,
  v,
  depth,
}: {
  k?: string;
  v: unknown;
  depth: number;
}) {
  const [open, setOpen] = useState(depth < 2);
  const hasChildren = isObject(v) || isArray(v);
  const entries = hasChildren
    ? isObject(v)
      ? Object.entries(v)
      : isArray(v)
      ? v.map((val, i) => [String(i), val] as [string, unknown])
      : []
    : [];

  return (
    <div className="font-mono text-xs leading-relaxed">
      <div className="flex items-start gap-1">
        {hasChildren ? (
          <button
            type="button"
            onClick={() => setOpen((o) => !o)}
            className="mt-0.5 hover:text-primary text-muted-foreground shrink-0"
            aria-label={open ? "Colapsar" : "Expandir"}
          >
            {open ? (
              <ChevronDown className="h-3 w-3" />
            ) : (
              <ChevronRight className="h-3 w-3" />
            )}
          </button>
        ) : (
          <span className="inline-block w-3 shrink-0" />
        )}
        <div className="min-w-0">
          {k !== undefined && (
            <>
              <span className="text-primary/90">{k}</span>
              <span className="text-muted-foreground">: </span>
            </>
          )}
          {hasChildren ? (
            <>
              <span className="text-muted-foreground">
                {isArray(v) ? "[" : "{"}
              </span>
              {!open && (
                <span className="text-muted-foreground italic">
                  {isArray(v)
                    ? ` ${entries.length} elementos `
                    : ` ${entries.length} claves `}
                </span>
              )}
              {!open && (
                <span className="text-muted-foreground">
                  {isArray(v) ? "]" : "}"}
                </span>
              )}
            </>
          ) : (
            <span className={cn("break-all", valueClass(v))}>
              {prettyValue(v)}
            </span>
          )}
        </div>
      </div>
      {hasChildren && open && (
        <div className="pl-4 border-l border-border/40 ml-1">
          {entries.map(([key, val]) => (
            <Node key={key} k={key} v={val} depth={depth + 1} />
          ))}
          <div className="text-muted-foreground">
            {isArray(v) ? "]" : "}"}
          </div>
        </div>
      )}
    </div>
  );
}

export function JsonTree({ data }: { data: unknown }) {
  if (data === null || data === undefined) {
    return (
      <div className="text-xs text-muted-foreground font-mono">null</div>
    );
  }
  return (
    <div>
      <Node v={data} depth={0} />
    </div>
  );
}
