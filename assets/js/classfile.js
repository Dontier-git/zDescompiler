/* ============================================================
   GuardX · Java class file parser (bytecode level)
   Parses the constant pool, fields, methods, the Code attribute,
   BootstrapMethods (lambdas / invokedynamic) and decodes JVM
   instructions. Nothing is executed.
   Exposes: GX.classfile
   ============================================================ */
(function (global) {
  "use strict";

  var GX = (global.GX = global.GX || {});
  var MAX_STRINGS = 60000;
  var MAX_INSTRUCTIONS = 60000;

  function u16(view, p) { return view.getUint16(p); }
  function u32(view, p) { return view.getUint32(p); }

  function utf8(bytes) {
    try {
      return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    } catch (e) {
      // Modified UTF-8 / legacy encodings: fall back to a byte-preserving
      // decode. Strings are only used as evidence; never executed.
      var out = "";
      for (var i = 0; i < bytes.length; i++) out += String.fromCharCode(bytes[i]);
      return out;
    }
  }

  /* ---------------- opcode metadata ---------------- */

  // Immediate operand size (in bytes) for fixed-width opcodes.
  // Variable-width opcodes (tableswitch, lookupswitch, wide) are special-cased.
  var FIXED = (function () {
    var t = new Uint8Array(256);
    for (var op = 0x10; op <= 0x14; op++) t[op] = 1;         // bipush, sipush(2), ldc(1), ldc_w(2), ldc2_w(2)
    t[0x10] = 1; t[0x11] = 2; t[0x12] = 1; t[0x13] = 2; t[0x14] = 2;
    for (op = 0x15; op <= 0x19; op++) t[op] = 1;              // xload
    for (op = 0x36; op <= 0x3a; op++) t[op] = 1;              // xstore
    t[0x84] = 2;                                              // iinc
    for (op = 0x99; op <= 0xa8; op++) t[op] = 2;              // if*, goto, jsr
    t[0xa9] = 1;                                              // ret
    for (op = 0xb2; op <= 0xb8; op++) t[op] = 2;              // field access + invoke*
    t[0xb9] = 4; t[0xba] = 4;                                 // invokeinterface, invokedynamic
    t[0xbb] = 2; t[0xbc] = 1; t[0xbd] = 2;                    // new, newarray, anewarray
    t[0xc0] = 2; t[0xc1] = 2;                                 // checkcast, instanceof
    t[0xc5] = 3;                                              // multianewarray
    t[0xc6] = 2; t[0xc7] = 2;                                 // ifnull, ifnonnull
    t[0xc8] = 4; t[0xc9] = 4;                                 // goto_w, jsr_w
    return t;
  })();

  var OPNAMES = {};
  (function () {
    var names = {
      0: "nop", 1: "aconst_null", 2: "iconst_m1", 3: "iconst_0", 4: "iconst_1", 5: "iconst_2",
      6: "iconst_3", 7: "iconst_4", 8: "iconst_5", 9: "lconst_0", 10: "lconst_1",
      11: "fconst_0", 12: "fconst_1", 13: "fconst_2", 14: "dconst_0", 15: "dconst_1",
      16: "bipush", 17: "sipush", 18: "ldc", 19: "ldc_w", 20: "ldc2_w",
      21: "iload", 22: "lload", 23: "fload", 24: "dload", 25: "aload",
      46: "iaload", 47: "laload", 48: "faload", 49: "daload", 50: "aaload", 51: "baload",
      52: "caload", 53: "saload", 54: "istore", 55: "lstore", 56: "fstore", 57: "dstore",
      58: "astore", 79: "iastore", 80: "lastore", 81: "fastore", 82: "dastore", 83: "aastore",
      84: "bastore", 85: "castore", 86: "sastore", 87: "pop", 88: "pop2", 89: "dup",
      90: "dup_x1", 91: "dup_x2", 92: "dup2", 93: "dup2_x1", 94: "dup2_x2", 95: "swap",
      96: "iadd", 97: "ladd", 98: "fadd", 99: "dadd", 100: "isub", 101: "lsub", 102: "fsub",
      103: "dsub", 104: "imul", 105: "lmul", 106: "fmul", 107: "dmul", 108: "idiv",
      109: "ldiv", 110: "fdiv", 111: "ddiv", 112: "irem", 113: "lrem", 114: "frem",
      115: "drem", 116: "ineg", 117: "lneg", 118: "fneg", 119: "dneg", 120: "ishl",
      121: "lshl", 122: "ishr", 123: "lshr", 124: "iushr", 125: "lushr", 126: "iand",
      127: "land", 128: "ior", 129: "lor", 130: "ixor", 131: "lxor", 132: "iinc",
      133: "i2l", 134: "i2f", 135: "i2d", 136: "l2i", 137: "l2f", 138: "l2d", 139: "f2i",
      140: "f2l", 141: "f2d", 142: "d2i", 143: "d2l", 144: "d2f", 145: "i2b", 146: "i2c",
      147: "i2s", 148: "lcmp", 149: "fcmpl", 150: "fcmpg", 151: "dcmpl", 152: "dcmpg",
      153: "ifeq", 154: "ifne", 155: "iflt", 156: "ifge", 157: "ifgt", 158: "ifle",
      159: "if_icmpeq", 160: "if_icmpne", 161: "if_icmplt", 162: "if_icmpge",
      163: "if_icmpgt", 164: "if_icmple", 165: "if_acmpeq", 166: "if_acmpne",
      167: "goto", 168: "jsr", 169: "ret", 170: "tableswitch", 171: "lookupswitch",
      172: "ireturn", 173: "lreturn", 174: "freturn", 175: "dreturn", 176: "areturn",
      177: "return", 178: "getstatic", 179: "putstatic", 180: "getfield", 181: "putfield",
      182: "invokevirtual", 183: "invokespecial", 184: "invokestatic", 185: "invokeinterface",
      186: "invokedynamic", 187: "new", 188: "newarray", 189: "anewarray", 190: "arraylength",
      191: "athrow", 192: "checkcast", 193: "instanceof", 194: "monitorenter",
      195: "monitorexit", 196: "wide", 197: "multianewarray", 198: "ifnull",
      199: "ifnonnull", 200: "goto_w", 201: "jsr_w"
    };
    for (var i = 0; i < 256; i++) {
      if (names[i]) OPNAMES[i] = names[i];
      else if (i >= 26 && i <= 45) OPNAMES[i] = "xload_n";
      else if (i >= 59 && i <= 78) OPNAMES[i] = "xstore_n";
      else OPNAMES[i] = "op_" + i;
    }
    OPNAMES[26] = "iload_0"; OPNAMES[27] = "iload_1"; OPNAMES[28] = "iload_2"; OPNAMES[29] = "iload_3";
    OPNAMES[30] = "lload_0"; OPNAMES[31] = "lload_1"; OPNAMES[32] = "lload_2"; OPNAMES[33] = "lload_3";
    OPNAMES[34] = "fload_0"; OPNAMES[35] = "fload_1"; OPNAMES[36] = "fload_2"; OPNAMES[37] = "fload_3";
    OPNAMES[38] = "dload_0"; OPNAMES[39] = "dload_1"; OPNAMES[40] = "dload_2"; OPNAMES[41] = "dload_3";
    OPNAMES[42] = "aload_0"; OPNAMES[43] = "aload_1"; OPNAMES[44] = "aload_2"; OPNAMES[45] = "aload_3";
    OPNAMES[59] = "istore_0"; OPNAMES[60] = "istore_1"; OPNAMES[61] = "istore_2"; OPNAMES[62] = "istore_3";
    OPNAMES[63] = "lstore_0"; OPNAMES[64] = "lstore_1"; OPNAMES[65] = "lstore_2"; OPNAMES[66] = "lstore_3";
    OPNAMES[67] = "fstore_0"; OPNAMES[68] = "fstore_1"; OPNAMES[69] = "fstore_2"; OPNAMES[70] = "fstore_3";
    OPNAMES[71] = "dstore_0"; OPNAMES[72] = "dstore_1"; OPNAMES[73] = "dstore_2"; OPNAMES[74] = "dstore_3";
    OPNAMES[75] = "astore_0"; OPNAMES[76] = "astore_1"; OPNAMES[77] = "astore_2"; OPNAMES[78] = "astore_3";
  })();

  /* ---------------- constant pool ---------------- */

  function resolveCp(cp, utf8At, idx) {
    var e = cp[idx];
    if (!e) return null;
    switch (e.tag) {
      case 1: return { kind: "utf8", value: e.value };
      case 3: return { kind: "int", value: e.value | 0 };
      case 4: return { kind: "float", value: e.value };
      case 5: return { kind: "long", value: e.value };
      case 6: return { kind: "double", value: e.value };
      case 7: {
        var cn = utf8At(e.nameIndex);
        return { kind: "class", className: cn, owner: cn ? cn.replace(/\//g, ".") : null };
      }
      case 8: {
        var s = utf8At(e.stringIndex);
        return { kind: "string", value: s };
      }
      case 9: case 10: case 11: {
        var nt = cp[e.nameTypeIndex];
        var owner = cp[e.classIndex] && utf8At(cp[e.classIndex].nameIndex);
        if (!nt || nt.tag !== 12) return null;
        var name = utf8At(nt.nameIndex);
        var desc = utf8At(nt.descriptorIndex);
        if (!owner || !name) return null;
        return {
          kind: e.tag === 9 ? "field" : "method",
          tag: e.tag,
          owner: owner.replace(/\//g, "."),
          ownerRaw: owner,
          name: name,
          descriptor: desc || "",
          ref: owner.replace(/\//g, ".") + "#" + name + (desc ? ":" + desc : "")
        };
      }
      case 12: {
        var n = utf8At(e.nameIndex);
        var d = utf8At(e.descriptorIndex);
        return { kind: "nameType", name: n, descriptor: d };
      }
      case 15: {
        return {
          kind: "methodHandle",
          referenceKind: e.referenceKind,
          ref: resolveCp(cp, utf8At, e.referenceIndex)
        };
      }
      case 16: return { kind: "methodType", descriptor: utf8At(e.descriptorIndex) };
      case 17: case 18: {
        var nt2 = cp[e.nameTypeIndex];
        var n2 = nt2 && nt2.tag === 12 ? utf8At(nt2.nameIndex) : null;
        var d2 = nt2 && nt2.tag === 12 ? utf8At(nt2.descriptorIndex) : null;
        return {
          kind: e.tag === 18 ? "invokeDynamic" : "dynamic",
          bootstrapIndex: e.bootstrapIndex,
          name: n2,
          descriptor: d2 || ""
        };
      }
      case 19: return { kind: "module" };
      case 20: return { kind: "package" };
      default: return null;
    }
  }

  /* ---------------- instruction decoder ---------------- */

  function decode(code, cp, utf8At, bootstrapMethods) {
    var insns = [];
    var view = new DataView(code.buffer, code.byteOffset, code.byteLength);
    var p = 0;
    var guard = 0;

    function attachBootstrap(cpInfo) {
      if (!cpInfo || (cpInfo.kind !== "invokeDynamic" && cpInfo.kind !== "dynamic")) return cpInfo;
      var bm = bootstrapMethods && bootstrapMethods[cpInfo.bootstrapIndex];
      if (!bm) return cpInfo;
      cpInfo.bootstrap = bm;
      cpInfo.impl = bm.impl || null;
      return cpInfo;
    }

    while (p < code.length && guard++ < MAX_INSTRUCTIONS) {
      var start = p;
      var op = code[p];
      var cpInfo = null;
      var size = 1 + FIXED[op];

      if (op === 0xaa) { // tableswitch
        var pad = (4 - ((p + 1) % 4)) % 4;
        var q = p + 1 + pad;
        if (q + 12 > code.length) throw new Error("tableswitch truncado");
        var low = view.getInt32(q + 4);
        var high = view.getInt32(q + 8);
        var entries = high - low + 1;
        if (entries < 0 || entries > 65536) throw new Error("tableswitch inválido");
        size = 1 + pad + 12 + entries * 4;
      } else if (op === 0xab) { // lookupswitch
        pad = (4 - ((p + 1) % 4)) % 4;
        q = p + 1 + pad;
        if (q + 8 > code.length) throw new Error("lookupswitch truncado");
        var pairs = view.getInt32(q + 4);
        if (pairs < 0 || pairs > 65536) throw new Error("lookupswitch inválido");
        size = 1 + pad + 8 + pairs * 8;
      } else if (op === 0xc4) { // wide
        if (p + 1 >= code.length) throw new Error("wide truncado");
        var next = code[p + 1];
        size = next === 0x84 ? 6 : 4;
      }

      if (start + size > code.length) throw new Error("Instrucción truncada en offset " + start);

      var idx = -1;
      if (op === 0x12) idx = code[p + 1];
      else if (op === 0x13 || op === 0x14) idx = u16(view, p + 1);
      else if (op >= 0xb2 && op <= 0xb9) idx = u16(view, p + 1);
      else if (op === 0xba) idx = u16(view, p + 1);
      else if (op === 0xbb || op === 0xbd || op === 0xc0 || op === 0xc1) idx = u16(view, p + 1);
      else if (op === 0xc5) idx = u16(view, p + 1);

      if (idx >= 0) cpInfo = attachBootstrap(resolveCp(cp, utf8At, idx));

      var insn = {
        offset: start,
        op: op,
        name: OPNAMES[op] || ("op_" + op),
        size: size,
        cp: cpInfo
      };

      if (op === 0x11) insn.operand = view.getInt16(p + 1);
      else if (op === 0x10) insn.operand = (code[p + 1] << 24) >> 24;
      else if (op === 0x84) { insn.local = code[p + 1]; insn.increment = (code[p + 2] << 24) >> 24; }

      insns.push(insn);
      p += size;
    }

    if (guard >= MAX_INSTRUCTIONS) throw new Error("Método demasiado grande (instrucciones)");
    return insns;
  }

  function bootstrapList(cp, utf8At, raw) {
    if (!raw) return [];
    var out = [];
    for (var i = 0; i < raw.length; i++) {
      var entry = raw[i];
      var args = [];
      for (var a = 0; a < entry.args.length; a++) {
        args.push(resolveCp(cp, utf8At, entry.args[a]));
      }
      out.push({
        ref: resolveCp(cp, utf8At, entry.ref),
        args: args,
        impl: findImpl(args)
      });
    }
    return out;
  }

  function findImpl(args) {
    // LambdaMetafactory: [samMethodType, implMethodHandle, instantiatedMethodType]
    // AltMetafactory: same prefix. Other bootstraps may carry method handles
    // for getters; the first non-bootstrap method handle is the best guess.
    for (var i = 0; i < args.length; i++) {
      var a = args[i];
      if (a && a.kind === "methodHandle" && a.ref && a.ref.kind === "method") return a.ref;
    }
    return null;
  }

  /* ---------------- class parsing ---------------- */

  function parse(bytes) {
    var result = {
      ok: false,
      strings: [],
      stringConstants: [],
      classRefs: [],
      methodRefs: [],
      fieldRefs: [],
      lambdaRefs: [],
      methods: [],
      fields: [],
      interfaces: [],
      fieldConstants: [],
      decodeErrors: [],
      bootstrapMethods: []
    };

    try {
      if (bytes.length < 16) throw new Error("Archivo demasiado pequeño");
      var view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
      if (u32(view, 0) !== 0xcafebabe) throw new Error("Firma de clase inválida");

      result.minor = u16(view, 4);
      result.major = u16(view, 6);

      var count = u16(view, 8);
      if (count < 1 || count > 65535) throw new Error("Constant pool inválido");

      var cp = new Array(count);
      var p = 10;

      function need(n) {
        if (p + n > bytes.length) throw new Error("Archivo truncado");
      }

      for (var i = 1; i < count; i++) {
        need(1);
        var tag = bytes[p++];
        switch (tag) {
          case 1: {
            need(2);
            var len = u16(view, p); p += 2;
            need(len);
            var value = utf8(bytes.subarray(p, p + len));
            p += len;
            if (result.strings.length < MAX_STRINGS) result.strings.push(value);
            cp[i] = { tag: 1, value: value };
            break;
          }
          case 3: need(4); cp[i] = { tag: 3, value: view.getInt32(p) }; p += 4; break;
          case 4: need(4); cp[i] = { tag: 4, value: view.getFloat32(p) }; p += 4; break;
          case 5: need(8); cp[i] = { tag: 5, value: view.getInt32(p) }; p += 8; i++; break;
          case 6: need(8); cp[i] = { tag: 6, value: view.getFloat64(p) }; p += 8; i++; break;
          case 7: need(2); cp[i] = { tag: 7, nameIndex: u16(view, p) }; p += 2; break;
          case 8: {
            need(2);
            cp[i] = { tag: 8, stringIndex: u16(view, p) };
            p += 2;
            break;
          }
          case 9: case 10: case 11: {
            need(4);
            cp[i] = { tag: tag, classIndex: u16(view, p), nameTypeIndex: u16(view, p + 2) };
            p += 4;
            break;
          }
          case 12: {
            need(4);
            cp[i] = { tag: 12, nameIndex: u16(view, p), descriptorIndex: u16(view, p + 2) };
            p += 4;
            break;
          }
          case 15: {
            need(3);
            cp[i] = { tag: 15, referenceKind: bytes[p], referenceIndex: u16(view, p + 1) };
            p += 3;
            break;
          }
          case 16: need(2); cp[i] = { tag: 16, descriptorIndex: u16(view, p) }; p += 2; break;
          case 17: case 18: {
            need(4);
            cp[i] = { tag: tag, bootstrapIndex: u16(view, p), nameTypeIndex: u16(view, p + 2) };
            p += 4;
            break;
          }
          case 19: case 20: need(2); cp[i] = { tag: tag }; p += 2; break;
          default:
            throw new Error("Tag de constante desconocido: " + tag);
        }
      }

      function utf8At(idx) {
        var e = cp[idx];
        return e && e.tag === 1 ? e.value : null;
      }

      function classNameAt(idx) {
        var e = cp[idx];
        if (!e || e.tag !== 7) return null;
        return utf8At(e.nameIndex);
      }

      // String constants (tag 8) are the ones that actually appear in code
      // via LDC. UTF-8 entries also include names/descriptors; keeping both
      // separate avoids false positives when scanning for secrets.
      for (var si = 1; si < count; si++) {
        var se = cp[si];
        if (se && se.tag === 8) {
          var sv = utf8At(se.stringIndex);
          if (sv != null) result.stringConstants.push(sv);
        }
      }

      need(8);
      var accessFlags = u16(view, p);
      var thisClass = u16(view, p + 2);
      var superClass = u16(view, p + 4);
      p += 6;
      result.accessFlags = accessFlags;
      result.isInterface = (accessFlags & 0x0200) !== 0;
      result.thisClass = thisClass;
      result.superClass = superClass;

      var thisName = classNameAt(thisClass);
      var superName = classNameAt(superClass);
      result.classNameRaw = thisName;
      result.className = thisName ? thisName.replace(/\//g, ".") : null;
      result.superName = superName ? superName.replace(/\//g, ".") : null;

      // interfaces
      need(2);
      var ifaceCount = u16(view, p); p += 2;
      need(ifaceCount * 2);
      for (var i2 = 0; i2 < ifaceCount; i2++) {
        var ifaceName = classNameAt(u16(view, p + i2 * 2));
        if (ifaceName) result.interfaces.push(ifaceName.replace(/\//g, "."));
      }
      p += ifaceCount * 2;

      // ---- fields ----
      need(2);
      var fieldCount = u16(view, p); p += 2;
      for (var f = 0; f < fieldCount; f++) {
        need(8);
        var fFlags = u16(view, p);
        var fName = utf8At(u16(view, p + 2));
        var fDesc = utf8At(u16(view, p + 4));
        var fAttrs = u16(view, p + 6);
        p += 8;

        var field = {
          name: fName || "<unknown>",
          descriptor: fDesc || "",
          accessFlags: fFlags,
          synthetic: (fFlags & 0x1000) !== 0,
          constant: null
        };

        for (var fa = 0; fa < fAttrs; fa++) {
          need(6);
          var faName = utf8At(u16(view, p));
          var faLen = u32(view, p + 2);
          var faStart = p + 6;
          if (faStart + faLen > bytes.length) throw new Error("Atributo de campo truncado");
          if (faName === "ConstantValue" && faLen === 2) {
            var cv = resolveCp(cp, utf8At, u16(view, faStart));
            if (cv && cv.kind === "string") {
              field.constant = cv.value;
              result.fieldConstants.push({
                className: result.className,
                name: field.name,
                descriptor: field.descriptor,
                value: cv.value
              });
            }
          }
          p = faStart + faLen;
        }

        if (fName) result.fields.push(field);
      }

      // ---- methods ----
      need(2);
      var methodCount = u16(view, p); p += 2;
      var pendingCode = [];
      for (var m = 0; m < methodCount; m++) {
        need(8);
        var mFlags = u16(view, p);
        var mName = utf8At(u16(view, p + 2));
        var mDesc = utf8At(u16(view, p + 4));
        var mAttrs = u16(view, p + 6);
        p += 8;

        var method = {
          name: mName || "<unknown>",
          descriptor: mDesc || "",
          accessFlags: mFlags,
          synthetic: (mFlags & 0x1000) !== 0 || (mFlags & 0x0040) !== 0,
          instructions: [],
          exceptionTable: [],
          lineNumbers: null,
          codeSize: 0,
          decodeError: null
        };

        for (var ma = 0; ma < mAttrs; ma++) {
          need(6);
          var attrName = utf8At(u16(view, p));
          var attrLen = u32(view, p + 2);
          var attrStart = p + 6;
          if (attrStart + attrLen > bytes.length) throw new Error("Atributo truncado");

          if (attrName === "Code") {
            var q = attrStart;
            var attrEnd = attrStart + attrLen;
            if (attrLen < 8 || q + 8 > attrEnd) throw new Error("Code inválido");
            method.maxStack = u16(view, q);
            method.maxLocals = u16(view, q + 2);
            var codeLen = u32(view, q + 4);
            q += 8;
            if (codeLen > 65535 || q + codeLen > attrEnd) throw new Error("Code inválido");
            var code = bytes.subarray(q, q + codeLen);
            method.codeSize = codeLen;
            q += codeLen;

            if (q + 2 > attrEnd) throw new Error("Exception table truncada");
            var exCount = u16(view, q); q += 2;
            if (q + exCount * 8 > attrEnd) throw new Error("Exception table inválida");
            for (var ex = 0; ex < exCount; ex++) {
              method.exceptionTable.push({
                start: u16(view, q),
                end: u16(view, q + 2),
                handler: u16(view, q + 4),
                type: classNameAt(u16(view, q + 6))
              });
              q += 8;
            }

            if (q + 2 > attrEnd) throw new Error("Atributos de Code truncados");
            var codeAttrCount = u16(view, q); q += 2;
            for (var ca = 0; ca < codeAttrCount; ca++) {
              if (q + 6 > attrEnd) throw new Error("Atributo de Code inválido");
              var caName = utf8At(u16(view, q));
              var caLen = u32(view, q + 2);
              var caStart = q + 6;
              if (caStart + caLen > attrEnd) throw new Error("Atributo de Code truncado");
              if (caName === "LineNumberTable") {
                var lnCount = u16(view, caStart);
                if (caStart + 2 + lnCount * 4 <= attrEnd) {
                  method.lineNumbers = {};
                  for (var ln = 0; ln < lnCount; ln++) {
                    var lnStart = u16(view, caStart + 2 + ln * 4);
                    var lnLine = u16(view, caStart + 4 + ln * 4);
                    method.lineNumbers[lnStart] = lnLine;
                  }
                }
              }
              q = caStart + caLen;
            }

            pendingCode.push({ method: method, code: code });
          }

          p = attrStart + attrLen;
        }

        // Line numbers stay as a plain map; the analysis resolves offsets so
        // the parsed class remains structured-cloneable for the worker.

        result.methods.push(method);
      }

      // ---- class attributes (SourceFile, BootstrapMethods) ----
      need(2);
      var cAttrs = u16(view, p); p += 2;
      var rawBootstrap = null;
      for (var ca2 = 0; ca2 < cAttrs; ca2++) {
        need(6);
        var cName = utf8At(u16(view, p));
        var cLen = u32(view, p + 2);
        var cs = p + 6;
        if (cs + cLen > bytes.length) throw new Error("Atributo de clase truncado");
        if (cName === "SourceFile" && cLen >= 2) {
          result.sourceFile = utf8At(u16(view, cs));
        }
        if (cName === "BootstrapMethods" && cLen >= 2) {
          rawBootstrap = [];
          var bp = cs;
          var bCount = u16(view, bp); bp += 2;
          for (var bi = 0; bi < bCount && bp + 4 <= cs + cLen; bi++) {
            var bRef = u16(view, bp); bp += 2;
            var bArgs = u16(view, bp); bp += 2;
            var args = [];
            for (var ba = 0; ba < bArgs && bp + 2 <= cs + cLen; ba++) {
              args.push(u16(view, bp)); bp += 2;
            }
            rawBootstrap.push({ ref: bRef, args: args });
          }
        }
        p = cs + cLen;
      }

      result.bootstrapMethods = bootstrapList(cp, utf8At, rawBootstrap);

      // Decode bytecode after bootstrap methods are known, so lambdas and
      // invokedynamic call sites can be resolved to real implementation
      // methods instead of being invisible.
      pendingCode.forEach(function (item) {
        try {
          item.method.instructions = decode(item.code, cp, utf8At, result.bootstrapMethods);
        } catch (err) {
          item.method.instructions = [];
          item.method.decodeError = err && err.message ? err.message : String(err);
          result.decodeErrors.push(item.method.name + item.method.descriptor + ": " + item.method.decodeError);
        }
      });

      // ---- compatibility aggregates ----
      var seenNames = new Set();
      for (var k = 1; k < count; k++) {
        var e = cp[k];
        if (!e) continue;
        if (e.tag === 7) {
          var cn = utf8At(e.nameIndex);
          if (cn && !seenNames.has("c:" + cn)) {
            seenNames.add("c:" + cn);
            result.classRefs.push(cn.replace(/\//g, "."));
          }
        } else if (e.tag === 10 || e.tag === 11) {
          var nt = cp[e.nameTypeIndex];
          if (nt && nt.tag === 12) {
            var mName = utf8At(nt.nameIndex);
            var mDesc = utf8At(nt.descriptorIndex);
            var cls = cp[e.classIndex] && utf8At(cp[e.classIndex].nameIndex);
            if (mName && cls) {
              var sig = cls.replace(/\//g, ".") + "#" + mName + (mDesc ? ":" + mDesc : "");
              if (!seenNames.has("m:" + sig)) {
                seenNames.add("m:" + sig);
                result.methodRefs.push(sig);
              }
            }
          }
        } else if (e.tag === 9) {
          var ntF = cp[e.nameTypeIndex];
          if (ntF && ntF.tag === 12) {
            var nameF = utf8At(ntF.nameIndex);
            var clsF = cp[e.classIndex] && utf8At(cp[e.classIndex].nameIndex);
            if (nameF && clsF) {
              var fsig = clsF.replace(/\//g, ".") + "#" + nameF;
              if (!seenNames.has("f:" + fsig)) {
                seenNames.add("f:" + fsig);
                result.fieldRefs.push(fsig);
              }
            }
          }
        }
      }

      result.bootstrapMethods.forEach(function (bm) {
        if (bm.impl && bm.impl.ref) {
          var lr = bm.impl.ref;
          if (result.lambdaRefs.indexOf(lr.ref) === -1) result.lambdaRefs.push(lr.ref);
        }
      });

      result.cp = cp;
      result.cpSize = count;
      result.ok = true;
    } catch (err) {
      result.error = err && err.message ? err.message : String(err);
    }

    return result;
  }

  GX.classfile = {
    parse: parse,
    OPNAMES: OPNAMES
  };
})(window);
