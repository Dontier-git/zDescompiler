"use client";

import { useState } from "react";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { JsonTree } from "@/components/json-tree";
import { Badge } from "@/components/ui/badge";
import { Copy, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { NbtNode } from "@/lib/nbt";

export function NbtInspector({
  tree,
  json,
}: {
  tree: NbtNode;
  json: unknown;
}) {
  const [copied, setCopied] = useState(false);

  const copyJson = async () => {
    try {
      await navigator.clipboard.writeText(JSON.stringify(json, null, 2));
      setCopied(true);
      setTimeout(() => setCopied(false), 1200);
    } catch {
      /* noop */
    }
  };

  const rootName = tree?.name || "(sin nombre)";
  const rootType = tree?.type || "unknown";

  return (
    <div className="flex flex-col h-full">
      <div className="px-3 py-2 border-b border-border bg-muted/20 flex items-center gap-2 flex-wrap">
        <Badge variant="secondary" className="font-mono text-[10px]">
          NBT root
        </Badge>
        <span className="text-xs text-muted-foreground">
          nombre: <code className="text-foreground">{rootName}</code>
        </span>
        <span className="text-xs text-muted-foreground">
          tipo: <code className="text-primary">{rootType}</code>
        </span>
        <Button size="sm" variant="ghost" className="ml-auto h-6" onClick={copyJson}>
          {copied ? (
            <Check className="h-3 w-3 mr-1 text-orange-400" />
          ) : (
            <Copy className="h-3 w-3 mr-1" />
          )}
          {copied ? "Copiado" : "Copiar JSON"}
        </Button>
      </div>
      <Tabs defaultValue="tree" className="flex-1 flex flex-col">
        <TabsList className="mx-3 mt-2 self-start">
          <TabsTrigger value="tree">Árbol</TabsTrigger>
          <TabsTrigger value="json">JSON</TabsTrigger>
        </TabsList>
        <TabsContent value="tree" className="flex-1 overflow-auto p-3 pt-2">
          <JsonTree data={json} />
        </TabsContent>
        <TabsContent value="json" className="flex-1 overflow-auto p-3 pt-2">
          <pre className="text-[11px] font-mono whitespace-pre-wrap break-words text-foreground/90">
            {JSON.stringify(json, null, 2)}
          </pre>
        </TabsContent>
      </Tabs>
    </div>
  );
}
