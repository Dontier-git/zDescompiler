"use client";

/**
 * Best-effort Java decompiler.
 *
 * Takes a parsed JavaClass (from src/lib/java-class.ts) and produces a string
 * with .java source code reconstructed from the bytecode.
 *
 * Strategy:
 *   1. Walk bytecode instructions with a virtual operand stack and local var array.
 *   2. Each instruction either pushes, pops, or emits a Java statement.
 *   3. When a recognized pattern completes (return, statement, branch), emit
 *      the corresponding Java line.
 *   4. For control flow we can't reconstruct (loops, complex branches, try/catch,
 *      lambdas), fall back to showing the bytecode as comments.
 *
 * This is NOT a perfect decompiler — CFR, Procyon and Fernflower are far more
 * sophisticated and are pure-Java programs. But for typical Bukkit/Spigot/Paper
 * plugin methods (getters, setters, log calls, simple if/else), this produces
 * very readable Java source.
 */

import {
  type JavaClass,
  type MethodInfo,
  type BytecodeInstruction,
  accessFlagsToString,
} from "./java-class";

type Expr = string;

/** Decompile a parsed .class to readable .java source. */
export function decompileClass(cls: JavaClass): string {
  const lines: string[] = [];

  // Header comment
  lines.push(`// Decompiled by zDescompiler from JVM bytecode`);
  lines.push(`// Source: ${cls.thisClass.replace(/\./g, "/")}.class`);
  lines.push(`// Java version: ${cls.majorVersion} (${cls.javaVersion})`);
  lines.push(`// Constant pool: ${cls.constantPoolSize - 1} entries`);
  lines.push(`// `);
  lines.push(`// NOTE: This is a best-effort reconstruction. For methods too complex`);
  lines.push(`// to fully reconstruct (loops, try/catch, lambdas), the original bytecode`);
  lines.push(`// is shown as comments. For perfect output, use CFR or Procyon.`);
  lines.push(``);

  // Package declaration
  const parts = cls.thisClass.split(".");
  const className = parts.pop()!;
  const packageName = parts.join(".");
  if (packageName) {
    lines.push(`package ${packageName};`);
    lines.push(``);
  }

  // Imports — collect from constant pool
  const imports = collectImports(cls);
  if (imports.length > 0) {
    for (const imp of [...new Set(imports)].sort()) {
      lines.push(`import ${imp};`);
    }
    lines.push(``);
  }

  // Class header
  let headerPrefix = "";
  if (cls.accessFlags.annotation) headerPrefix = "@interface ";
  else if (cls.accessFlags.enum) headerPrefix = "enum ";
  else if (cls.accessFlags.interface) headerPrefix = "interface ";
  else if (cls.accessFlags.abstract && !cls.accessFlags.interface)
    headerPrefix = "abstract class ";
  else headerPrefix = "class ";

  // accessFlagsToString returns "public final super" etc. — strip "super"
  // (it's only meaningful at the JVM level, not Java source).
  let modStr = accessFlagsToString(cls.accessFlags, "class")
    .replace(/\bsuper\b\s*/g, "")
    .replace(/\b@interface\b\s*/g, "")
    .replace(/\benum\b\s*/g, "")
    .replace(/\babstract\b\s*/g, "")
    .replace(/\bmodule\b\s*/g, "")
    .trim();
  // Keep "abstract" prefix if it was abstract (non-interface)
  if (cls.accessFlags.abstract && !cls.accessFlags.interface) {
    modStr = ("abstract " + modStr).trim();
  }
  // If "public" was implicit on the interface, keep it

  let header = modStr ? `${modStr} ` : "";
  header += headerPrefix + className;
  if (cls.superClass && cls.superClass !== "java.lang.Object") {
    header += ` extends ${cls.superClass}`;
  }
  if (cls.interfaces.length > 0) {
    header += ` implements ${cls.interfaces.join(", ")}`;
  }
  header += " {";
  lines.push(header);

  // Fields
  if (cls.fields.length > 0) {
    lines.push(`    // Fields (${cls.fields.length})`);
    for (const f of cls.fields) {
      const fmod = accessFlagsToString(f.accessFlags, "field");
      lines.push(`    ${fmod ? fmod + " " : ""}${f.signature} ${f.name};`);
    }
    lines.push(``);
  }

  // Methods
  if (cls.methods.length > 0) {
    lines.push(`    // Methods (${cls.methods.length})`);
    for (const m of cls.methods) {
      lines.push(...decompileMethod(m, cls).map((l) => `    ${l}`));
      lines.push(``);
    }
  }

  lines.push(`}`);

  return lines.join("\n");
}

function collectImports(cls: JavaClass): string[] {
  const imports: string[] = [];
  for (const entry of cls.constantPool) {
    if (!entry) continue;
    if (entry.tag === "Class") {
      // entry.nameIndex is set during parse, but the resolveClassName already
      // gave us the dotted name in entry.value via... actually Class entry has
      // nameIndex; we need to look it up.
    }
    if (entry.tag === "Fieldref" || entry.tag === "Methodref" || entry.tag === "InterfaceMethodref") {
      const clsEntry = cls.constantPool[entry.classIndex];
      if (clsEntry && clsEntry.tag === "Class") {
        const nameEntry = cls.constantPool[clsEntry.nameIndex];
        if (nameEntry && nameEntry.tag === "Utf8") {
          const dotted = nameEntry.value.replace(/\//g, ".");
          if (
            dotted !== cls.thisClass &&
            !dotted.startsWith("java.lang.") &&
            dotted.includes(".")
          ) {
            imports.push(dotted);
          }
        }
      }
    }
  }
  return imports;
}

function decompileMethod(m: MethodInfo, cls: JavaClass): string[] {
  const lines: string[] = [];
  const modStr = accessFlagsToString(m.accessFlags, "method");
  const params = m.decodedSignature.parameterTypes.join(", ");
  const exceptions = m.code?.exceptionTable.length ? " throws Exception" : "";
  lines.push(
    `${modStr ? modStr + " " : ""}${m.decodedSignature.returnType} ${m.name}(${params})${exceptions} {`
  );

  if (m.code) {
    const body = tryDecompileBody(m, cls);
    if (body) {
      for (const l of body) lines.push(`    ${l}`);
    } else {
      lines.push(`    // [zDescompiler: method body too complex to fully reconstruct — see inspector]`);
      lines.push(`    // Original bytecode (${m.code.instructions.length} instructions, max_stack=${m.code.maxStack}, max_locals=${m.code.maxLocals}):`);
      for (const ins of m.code.instructions) {
        const operandPart = ins.operands.length
          ? ` ${ins.operands.map((o) => o.toString(16).padStart(2, "0")).join(" ")}`
          : "";
        const comment = ins.operandComment ? `  // ${ins.operandComment}` : "";
        lines.push(
          `    //   ${ins.offset.toString().padStart(4)}: ${ins.mnemonic}${operandPart}${comment}`
        );
      }
    }
  } else {
    lines.push(`    // abstract or native — no body`);
  }
  lines.push(`}`);
  return lines;
}

/**
 * Best-effort stack-based bytecode interpreter. Returns an array of Java
 * statements (one per line) or null if we couldn't reconstruct the body.
 */
function tryDecompileBody(m: MethodInfo, cls: JavaClass): string[] | null {
  const instrs = m.code!.instructions;
  if (instrs.length === 0) return [];

  // Empty body: just `return` at end of void method
  if (instrs.length === 1 && instrs[0].mnemonic === "return") {
    return [];
  }

  const stack: Expr[] = [];
  const locals: Expr[] = new Array(m.code!.maxLocals + 4).fill(null);
  if (!m.accessFlags.static) {
    locals[0] = "this";
  }
  // Initialize parameters in local slots
  if (!m.accessFlags.static) {
    let slot = 1;
    for (const p of m.decodedSignature.parameterTypes) {
      locals[slot] = `${p.toLowerCase() || "arg"}${slot}`;
      slot += isCategory2(p) ? 2 : 1;
    }
  } else {
    let slot = 0;
    for (const p of m.decodedSignature.parameterTypes) {
      locals[slot] = `${p.toLowerCase() || "arg"}${slot}`;
      slot += isCategory2(p) ? 2 : 1;
    }
  }

  const out: string[] = [];
  let failed = false;

  try {
    for (let i = 0; i < instrs.length && !failed; i++) {
      const ins = instrs[i];
      switch (ins.mnemonic) {
        // === Constants ===
        case "aconst_null": stack.push("null"); break;
        case "iconst_m1": stack.push("-1"); break;
        case "iconst_0": stack.push("0"); break;
        case "iconst_1": stack.push("1"); break;
        case "iconst_2": stack.push("2"); break;
        case "iconst_3": stack.push("3"); break;
        case "iconst_4": stack.push("4"); break;
        case "iconst_5": stack.push("5"); break;
        case "lconst_0": stack.push("0L"); break;
        case "lconst_1": stack.push("1L"); break;
        case "fconst_0": stack.push("0.0f"); break;
        case "fconst_1": stack.push("1.0f"); break;
        case "fconst_2": stack.push("2.0f"); break;
        case "dconst_0": stack.push("0.0"); break;
        case "dconst_1": stack.push("1.0"); break;

        // === Pushes ===
        case "bipush":
        case "sipush": {
          stack.push(ins.operandComment || "0");
          break;
        }

        // === ldc / ldc_w / ldc2_w ===
        case "ldc":
        case "ldc_w":
        case "ldc2_w": {
          const c = ins.operandComment || "";
          // Match: "#X String \"value\"" or "#X int 42" or "#X class java.lang.Object"
          const strMatch = c.match(/String "(.*)"$/);
          if (strMatch) {
            stack.push(`"${strMatch[1].replace(/"/g, '\\"')}"`);
          } else {
            // Extract the value after the type tag
            const m2 = c.match(/^(#\d+)\s+(\w+)\s+(.+)$/);
            if (m2) {
              stack.push(m2[3]);
            } else {
              stack.push(`/* ${c} */`);
            }
          }
          break;
        }

        // === Loads ===
        case "aload_0": case "aload_1": case "aload_2": case "aload_3":
        case "iload_0": case "iload_1": case "iload_2": case "iload_3":
        case "lload_0": case "lload_1": case "lload_2": case "lload_3":
        case "fload_0": case "fload_1": case "fload_2": case "fload_3":
        case "dload_0": case "dload_1": case "dload_2": case "dload_3": {
          const idx = parseInt(ins.mnemonic.split("_")[1], 10);
          stack.push(locals[idx] || `var${idx}`);
          break;
        }
        case "aload": case "iload": case "lload": case "fload": case "dload": {
          const idx = ins.operands[0];
          stack.push(locals[idx] || `var${idx}`);
          break;
        }

        // === Stores ===
        case "astore_0": case "astore_1": case "astore_2": case "astore_3":
        case "istore_0": case "istore_1": case "istore_2": case "istore_3":
        case "lstore_0": case "lstore_1": case "lstore_2": case "lstore_3":
        case "fstore_0": case "fstore_1": case "fstore_2": case "fstore_3":
        case "dstore_0": case "dstore_1": case "dstore_2": case "dstore_3": {
          const idx = parseInt(ins.mnemonic.split("_")[1], 10);
          const v = stack.pop() || "?";
          locals[idx] = `var${idx}`;
          out.push(`${locals[idx]} = ${v};`);
          break;
        }
        case "astore": case "istore": case "lstore": case "fstore": case "dstore": {
          const idx = ins.operands[0];
          const v = stack.pop() || "?";
          locals[idx] = `var${idx}`;
          out.push(`${locals[idx]} = ${v};`);
          break;
        }

        // === Field access ===
        case "getstatic": {
          const ref = ins.operandComment || "";
          // "#X java.lang.System.out:Ljava.io.PrintStream;"
          const mref = ref.match(/^\s*#\d+\s+(.+)$/);
          if (mref) {
            const parts = mref[1].split(":")[0];
            stack.push(parts);
          } else {
            stack.push(`/* getstatic ${ref} */`);
          }
          break;
        }
        case "getfield": {
          const ref = ins.operandComment || "";
          // "#X java.lang.Object.field:Type"
          const mref = ref.match(/^\s*#\d+\s+\S+\.(\w+):/);
          const obj = stack.pop() || "this";
          if (mref) {
            stack.push(`${obj}.${mref[1]}`);
          } else {
            stack.push(`/* getfield ${ref} */`);
          }
          break;
        }
        case "putfield": {
          const ref = ins.operandComment || "";
          const mref = ref.match(/^\s*#\d+\s+\S+\.(\w+):/);
          const value = stack.pop() || "?";
          const obj = stack.pop() || "this";
          if (mref) {
            out.push(`${obj}.${mref[1]} = ${value};`);
          } else {
            failed = true;
          }
          break;
        }
        case "putstatic": {
          const ref = ins.operandComment || "";
          const mref = ref.match(/^\s*#\d+\s+(\S+)\.(\w+):/);
          const value = stack.pop() || "?";
          if (mref) {
            out.push(`${mref[1]}.${mref[2]} = ${value};`);
          } else {
            failed = true;
          }
          break;
        }

        // === Arithmetic ===
        case "iadd": case "ladd": case "fadd": case "dadd": {
          const b = stack.pop() || "?";
          const a = stack.pop() || "?";
          stack.push(`(${a} + ${b})`);
          break;
        }
        case "isub": case "lsub": case "fsub": case "dsub": {
          const b = stack.pop() || "?";
          const a = stack.pop() || "?";
          stack.push(`(${a} - ${b})`);
          break;
        }
        case "imul": case "lmul": case "fmul": case "dmul": {
          const b = stack.pop() || "?";
          const a = stack.pop() || "?";
          stack.push(`(${a} * ${b})`);
          break;
        }
        case "idiv": case "ldiv": case "fdiv": case "ddiv": {
          const b = stack.pop() || "?";
          const a = stack.pop() || "?";
          stack.push(`(${a} / ${b})`);
          break;
        }
        case "irem": case "lrem": case "frem": case "drem": {
          const b = stack.pop() || "?";
          const a = stack.pop() || "?";
          stack.push(`(${a} % ${b})`);
          break;
        }
        case "ineg": case "lneg": case "fneg": case "dneg": {
          const a = stack.pop() || "?";
          stack.push(`-${a}`);
          break;
        }
        case "iinc": {
          const idx = ins.operands[0];
          const delta = (ins.operands[1] << 24) >> 24;
          const varName = locals[idx] || `var${idx}`;
          if (delta === 1) out.push(`${varName}++;`);
          else if (delta === -1) out.push(`${varName}--;`);
          else out.push(`${varName} += ${delta};`);
          break;
        }

        // === Type conversion ===
        case "i2l": case "i2f": case "i2d":
        case "l2i": case "l2f": case "l2d":
        case "f2i": case "f2l": case "f2d":
        case "d2i": case "d2l": case "d2f":
        case "i2b": case "i2c": case "i2s": {
          const a = stack.pop() || "?";
          stack.push(`(${a})`); // Java implicit cast at assignment
          break;
        }

        // === Comparisons (push boolean) ===
        case "lcmp":
        case "fcmpl": case "fcmpg":
        case "dcmpl": case "dcmpg": {
          const b = stack.pop() || "?";
          const a = stack.pop() || "?";
          stack.push(`(${a} cmp ${b})`);
          break;
        }

        // === Branches — for now, mark as complex ===
        case "ifeq": case "ifne": case "iflt": case "ifge": case "ifgt": case "ifle":
        case "if_icmpeq": case "if_icmpne": case "if_icmplt": case "if_icmpge":
        case "if_icmpgt": case "if_icmple":
        case "if_acmpeq": case "if_acmpne":
        case "ifnull": case "ifnonnull":
        case "goto": case "goto_w": case "jsr": case "jsr_w":
        case "tableswitch": case "lookupswitch":
        case "ret": {
          // Mark method as having control flow — for now, we bail out
          failed = true;
          break;
        }

        // === Returns ===
        case "return": {
          // void return — if stack has a leftover expression, emit as statement
          if (stack.length === 1 && !stack[0].startsWith("//")) {
            out.push(`${stack.pop()};`);
          } else {
            // end of method, nothing to do
          }
          break;
        }
        case "areturn": case "ireturn": case "lreturn": case "freturn": case "dreturn": {
          const v = stack.pop() || "/* ? */";
          out.push(`return ${v};`);
          break;
        }

        // === Method invocations ===
        case "invokevirtual":
        case "invokespecial":
        case "invokeinterface":
        case "invokestatic": {
          // operandComment format: "#N java.lang.Object.<init>:()V"
          // We split on first ':' (descriptor separator) and last '.' (class.method)
          const ref = ins.operandComment || "";
          const cleaned = ref.replace(/^\s*#\d+\s+/, "");
          const colonIdx = cleaned.indexOf(":");
          if (colonIdx === -1) {
            failed = true;
            break;
          }
          const methodAndClass = cleaned.slice(0, colonIdx);
          const desc = cleaned.slice(colonIdx + 1);
          const dotIdx = methodAndClass.lastIndexOf(".");
          if (dotIdx === -1) {
            failed = true;
            break;
          }
          const recvClass = methodAndClass.slice(0, dotIdx);
          const methodName = methodAndClass.slice(dotIdx + 1);

          // Parse descriptor: "()V" or "(Ljava/lang/String;I)V"
          const descMatch = desc.match(/^\(([^)]*)\)(\S+)$/);
          if (!descMatch) {
            failed = true;
            break;
          }
          const argDesc = descMatch[1];
          const retType = descMatch[2];
          const argCount = countMethodArgs(argDesc);
          const args: Expr[] = [];
          for (let j = 0; j < argCount; j++) {
            args.unshift(stack.pop() || "?");
          }
          let recv: Expr;
          if (ins.mnemonic === "invokestatic") {
            recv = recvClass;
          } else {
            recv = stack.pop() || recvClass;
          }

          // For invokespecial on <init>, this is a constructor call
          if (
            ins.mnemonic === "invokespecial" &&
            methodName === "<init>" &&
            recvClass === cls.superClass
          ) {
            out.push(`super(${args.join(", ")});`);
            break;
          }
          if (
            ins.mnemonic === "invokespecial" &&
            methodName === "<init>" &&
            recvClass === cls.thisClass
          ) {
            out.push(`this(${args.join(", ")});`);
            break;
          }

          const call = `${recv}.${methodName}(${args.join(", ")})`;

          if (retType === "V") {
            // void method call — emit as statement
            out.push(`${call};`);
          } else {
            // Push the call back on the stack — used by subsequent return / store
            stack.push(call);
          }
          break;
        }
        case "invokedynamic": {
          failed = true;
          break;
        }

        // === Object/array creation ===
        case "new": {
          const ref = ins.operandComment || "";
          const mref = ref.match(/^\s*#\d+\s+(.+)$/);
          if (mref) {
            stack.push(`new ${mref[1].replace(/^\s*class\s+/, "")}`);
          } else {
            failed = true;
          }
          break;
        }
        case "newarray": {
          // operand: atype byte
          const atypes = ["boolean", "char", "float", "double", "byte", "short", "int", "long"];
          const t = atypes[ins.operands[0]] || "int";
          const size = stack.pop() || "0";
          stack.push(`new ${t}[${size}]`);
          break;
        }
        case "anewarray": {
          const ref = ins.operandComment || "";
          const mref = ref.match(/^\s*#\d+\s+(?:class\s+)?(\S+)$/);
          const size = stack.pop() || "0";
          if (mref) {
            stack.push(`new ${mref[1]}[${size}]`);
          } else {
            failed = true;
          }
          break;
        }
        case "arraylength": {
          const a = stack.pop() || "?";
          stack.push(`${a}.length`);
          break;
        }
        case "athrow": {
          const e = stack.pop() || "/* ? */";
          out.push(`throw ${e};`);
          break;
        }
        case "checkcast": {
          // checkcast doesn't pop/push on the JVM level, just type-checks
          // For source reconstruction we ignore it
          break;
        }
        case "instanceof": {
          const ref = ins.operandComment || "";
          const mref = ref.match(/^\s*#\d+\s+(?:class\s+)?(\S+)$/);
          const a = stack.pop() || "?";
          if (mref) {
            stack.push(`(${a} instanceof ${mref[1]})`);
          } else {
            failed = true;
          }
          break;
        }
        case "monitorenter":
        case "monitorexit": {
          stack.pop();
          // Skip — we don't reconstruct synchronized blocks
          break;
        }

        // === Array load/store ===
        case "iaload": case "laload": case "faload": case "daload":
        case "aaload": case "baload": case "caload": case "saload": {
          const idx = stack.pop() || "?";
          const arr = stack.pop() || "?";
          stack.push(`${arr}[${idx}]`);
          break;
        }
        case "iastore": case "lastore": case "fastore": case "dastore":
        case "aastore": case "bastore": case "castore": case "sastore": {
          const val = stack.pop() || "?";
          const idx = stack.pop() || "?";
          const arr = stack.pop() || "?";
          out.push(`${arr}[${idx}] = ${val};`);
          break;
        }

        // === Stack manipulation ===
        case "pop": stack.pop(); break;
        case "pop2": stack.pop(); stack.pop(); break;
        case "dup": {
          const v = stack[stack.length - 1] || "?";
          stack.push(v);
          break;
        }
        case "dup_x1": {
          const v = stack[stack.length - 1] || "?";
          stack.splice(stack.length - 2, 0, v);
          break;
        }
        case "dup2": {
          const v1 = stack[stack.length - 1] || "?";
          const v2 = stack[stack.length - 2] || "?";
          stack.push(v2);
          stack.push(v1);
          break;
        }
        case "swap": {
          const a = stack.pop() || "?";
          const b = stack.pop() || "?";
          stack.push(a);
          stack.push(b);
          break;
        }

        // === Wide / switch variants — bail ===
        case "wide":
        case "ret":
          failed = true;
          break;

        default:
          // Unknown opcode — bail to be safe
          failed = true;
          break;
      }
    }
  } catch (e) {
    failed = true;
  }

  if (failed) return null;
  return out;
}

function isCategory2(type: string): boolean {
  return type === "long" || type === "double";
}

function countMethodArgs(desc: string): number {
  if (!desc) return 0;
  let count = 0;
  let i = 0;
  while (i < desc.length) {
    let j = i;
    while (desc[j] === "[") j++;
    if (desc[j] === "L") {
      const end = desc.indexOf(";", j);
      j = end + 1;
    } else {
      j++;
    }
    if (desc[i] === "J" || desc[i] === "D") {
      // long or double take 2 slots — count as 1 arg but uses 2 slots
    }
    count++;
    i = j;
  }
  return count;
}
