/* ============================================================
   GuardX · ZIP/JAR reader
   Dependency-free ZIP central-directory parser with ZIP64
   support, CP437 names, encryption detection and inflate via
   the browser's native DecompressionStream.
   Exposes: GX.zip
   ============================================================ */
(function (global) {
  "use strict";

  var GX = (global.GX = global.GX || {});

  var SIG_EOCD = 0x06054b50;
  var SIG_EOCD64 = 0x06064b50;
  var SIG_EOCD64_LOC = 0x07064b50;
  var SIG_CENTRAL = 0x02014b50;
  var SIG_LOCAL = 0x04034b50;

  var MAX_ENTRIES = 20000;
  var MAX_ENTRY_BYTES = 32 * 1024 * 1024; // 32 MB per inflated entry
  var MAX_TOTAL_BYTES = 192 * 1024 * 1024; // hard budget for a whole scan

  // CP437 table for the upper half. ZIP files written before the UTF-8
  // flag existed store names in this code page; latin-1 would corrupt them.
  var CP437 = "\u00c7\u00fc\u00e9\u00e2\u00e4\u00e0\u00e5\u00e7\u00ea\u00eb\u00e8\u00ef\u00ee\u00ec\u00c4\u00c5" +
    "\u00c9\u00e6\u00c6\u00f4\u00f6\u00f2\u00fb\u00f9\u00ff\u00d6\u00dc\u00a2\u00a3\u00a5\u20a7\u0192" +
    "\u00e1\u00ed\u00f3\u00fa\u00f1\u00d1\u00aa\u00ba\u00bf\u2310\u00ac\u00bd\u00bc\u00a1\u00ab\u00bb" +
    "\u2591\u2592\u2593\u2502\u2524\u2561\u2562\u2556\u2555\u2563\u2551\u2557\u255d\u255c\u255b\u2510" +
    "\u2514\u2534\u252c\u251c\u2500\u253c\u255e\u255f\u255a\u2554\u2569\u2566\u2560\u2550\u256c\u2567" +
    "\u2568\u2564\u2565\u2559\u2558\u2552\u2553\u256b\u256a\u2518\u250c\u2588\u2584\u258c\u2590\u2580" +
    "\u03b1\u00df\u0393\u03c0\u03a3\u03c3\u00b5\u03c4\u03a6\u0398\u03a9\u03b4\u221e\u03c6\u03b5\u2229" +
    "\u2261\u00b1\u2265\u2264\u2320\u2321\u00f7\u2248\u00b0\u2219\u00b7\u221a\u207f\u00b2\u25a0\u00a0";

  function u16(view, offset) { return view.getUint16(offset, true); }
  function u32(view, offset) { return view.getUint32(offset, true); }
  function u64(view, offset) {
    // Safe up to 2^53. ZIP64 offsets larger than that are not practical
    // in a browser scan anyway.
    return u32(view, offset) + u32(view, offset + 4) * 0x100000000;
  }
  function asciiSafe(view, offset, len) { return new Uint8Array(view.buffer, view.byteOffset + offset, len); }

  function decodeName(bytes, utf8Flag) {
    if (utf8Flag) {
      try { return new TextDecoder("utf-8", { fatal: true }).decode(bytes); } catch (e) { /* fall through */ }
    }
    // Try strict UTF-8 first: many modern tools omit the flag but still
    // write UTF-8. If it fails, decode as CP437.
    try { return new TextDecoder("utf-8", { fatal: true }).decode(bytes); } catch (e) { /* not utf-8 */ }
    var out = "";
    for (var i = 0; i < bytes.length; i++) {
      var b = bytes[i];
      out += b < 0x80 ? String.fromCharCode(b) : CP437.charAt(b - 0x80);
    }
    return out;
  }

  function findEOCD(view) {
    var len = view.byteLength;
    var min = Math.max(0, len - 22 - 65535);
    for (var i = len - 22; i >= min; i--) {
      if (u32(view, i) === SIG_EOCD) {
        var commentLen = u16(view, i + 20);
        if (i + 22 + commentLen <= len) return i;
      }
    }
    return -1;
  }

  function readZip64EOCD(view, eocd) {
    if (eocd < 20 || u32(view, eocd - 20) !== SIG_EOCD64_LOC) return null;
    var z64 = u64(view, eocd - 20 + 8);
    if (z64 + 56 > view.byteLength || u32(view, z64) !== SIG_EOCD64) return null;
    return {
      total: u64(view, z64 + 32),
      cdSize: u64(view, z64 + 40),
      cdOffset: u64(view, z64 + 48)
    };
  }

  function isZip(buffer) {
    if (!buffer || buffer.byteLength < 22) return false;
    var view = new DataView(buffer);
    return findEOCD(view) >= 0;
  }

  function looksLikeZipHead(bytes) {
    return bytes && bytes.length >= 4 &&
      bytes[0] === 0x50 && bytes[1] === 0x4b &&
      ((bytes[2] === 0x03 && bytes[3] === 0x04) ||
       (bytes[2] === 0x05 && bytes[3] === 0x06) ||
       (bytes[2] === 0x07 && bytes[3] === 0x08));
  }

  function zip64Extra(extra, needUncomp, needComp, needOffset) {
    var out = {};
    var p = 0;
    while (p + 4 <= extra.length) {
      var id = u16(extra.view, p);
      var size = u16(extra.view, p + 2);
      var dataStart = p + 4;
      if (dataStart + size > extra.length) break;
      if (id === 0x0001) {
        var q = dataStart;
        if (needUncomp && q + 8 <= dataStart + size) { out.uncompressedSize = u64(extra.view, q); q += 8; }
        if (needComp && q + 8 <= dataStart + size) { out.compressedSize = u64(extra.view, q); q += 8; }
        if (needOffset && q + 8 <= dataStart + size) { out.localOffset = u64(extra.view, q); q += 8; }
      }
      p = dataStart + size;
    }
    return out;
  }

  /**
   * Parse the central directory.
   * @param {ArrayBuffer} buffer
   * @returns {{entries: Array, totalReported: number, truncated: boolean, zip64: boolean, comment: string}}
   */
  function parse(buffer) {
    var view = new DataView(buffer);
    var eocd = findEOCD(view);
    if (eocd < 0) throw new Error("No es un archivo ZIP/JAR válido (sin índice central).");

    var total = u16(view, eocd + 10);
    var cdSize = u32(view, eocd + 12);
    var cdOffset = u32(view, eocd + 16);
    var zip64 = false;

    if (total === 0xffff || cdSize === 0xffffffff || cdOffset === 0xffffffff) {
      var z64 = readZip64EOCD(view, eocd);
      if (z64) {
        total = z64.total;
        cdSize = z64.cdSize;
        cdOffset = z64.cdOffset;
        zip64 = true;
      } else if (total === 0xffff || cdOffset === 0xffffffff) {
        throw new Error("El archivo usa ZIP64 pero su índice extendido no es válido.");
      }
    }
    if (cdOffset + cdSize > view.byteLength) {
      throw new Error("El índice del ZIP está corrupto o incompleto.");
    }

    var entries = [];
    var p = cdOffset;
    var limit = Math.min(total, MAX_ENTRIES);
    var truncated = false;

    for (var i = 0; i < limit; i++) {
      if (p + 46 > view.byteLength || u32(view, p) !== SIG_CENTRAL) {
        truncated = true;
        break;
      }
      var flags = u16(view, p + 8);
      var method = u16(view, p + 10);
      var crc = u32(view, p + 16);
      var compSize = u32(view, p + 20);
      var uncompSize = u32(view, p + 24);
      var nameLen = u16(view, p + 28);
      var extraLen = u16(view, p + 30);
      var commentLen = u16(view, p + 32);
      var localOffset = u32(view, p + 42);

      if (p + 46 + nameLen + extraLen > view.byteLength) { truncated = true; break; }

      var nameBytes = asciiSafe(view, p + 46, nameLen);
      var name = decodeName(nameBytes, (flags & 0x800) !== 0).replace(/\\/g, "/");

      if (uncompSize === 0xffffffff || compSize === 0xffffffff || localOffset === 0xffffffff) {
        var extra = new Uint8Array(view.buffer, view.byteOffset + p + 46 + nameLen, extraLen);
        var x = zip64Extra(extra, uncompSize === 0xffffffff, compSize === 0xffffffff, localOffset === 0xffffffff);
        if (x.uncompressedSize != null) uncompSize = x.uncompressedSize;
        if (x.compressedSize != null) compSize = x.compressedSize;
        if (x.localOffset != null) localOffset = x.localOffset;
      }

      entries.push({
        name: name,
        method: method,
        flags: flags,
        crc: crc,
        compressedSize: compSize,
        size: uncompSize,
        localOffset: localOffset,
        isDir: /\/$/.test(name),
        encrypted: (flags & 0x1) !== 0,
        dataDescriptor: (flags & 0x8) !== 0,
        utf8: (flags & 0x800) !== 0,
        index: i
      });

      p += 46 + nameLen + extraLen + commentLen;
    }

    if (total > MAX_ENTRIES) truncated = true;

    return {
      entries: entries,
      totalReported: total,
      truncated: truncated,
      zip64: zip64,
      comment: ""
    };
  }

  function entryDataRange(buffer, entry) {
    var view = new DataView(buffer);
    var lh = entry.localOffset;
    if (lh + 30 > view.byteLength || u32(view, lh) !== SIG_LOCAL) {
      throw new Error("Cabecera local inválida en " + entry.name);
    }
    var nameLen = u16(view, lh + 26);
    var extraLen = u16(view, lh + 28);
    var start = lh + 30 + nameLen + extraLen;
    var end = start + entry.compressedSize;
    if (start > view.byteLength || end > view.byteLength) {
      throw new Error("Datos truncados en " + entry.name);
    }
    return { start: start, end: end };
  }

  async function inflateRaw(bytes) {
    if (typeof DecompressionStream === "undefined") {
      throw new Error("Tu navegador no soporta DecompressionStream. Usa una versión reciente de Chrome, Edge, Firefox o Safari.");
    }
    var stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream("deflate-raw"));
    return new Uint8Array(await new Response(stream).arrayBuffer());
  }

  /**
   * Read and decompress one entry.
   * @param {ArrayBuffer} buffer
   * @param {object} entry
   * @param {number} budgetBytes remaining budget
   * @returns {Promise<Uint8Array>}
   */
  async function readEntry(buffer, entry, budgetBytes) {
    if (entry.isDir) return new Uint8Array(0);
    if (entry.encrypted) throw new Error("Entrada cifrada: " + entry.name);
    if (entry.size > MAX_ENTRY_BYTES) {
      throw new Error("Entrada demasiado grande: " + entry.name);
    }
    if (budgetBytes != null && entry.size > budgetBytes) {
      throw new Error("Presupuesto de análisis agotado antes de " + entry.name);
    }

    var range = entryDataRange(buffer, entry);
    var raw = new Uint8Array(buffer, range.start, range.end - range.start);

    if (entry.method === 0) {
      if (raw.length > MAX_ENTRY_BYTES) throw new Error("Entrada demasiado grande: " + entry.name);
      return raw;
    }
    if (entry.method === 8) {
      var out = await inflateRaw(raw);
      if (out.length > MAX_ENTRY_BYTES) throw new Error("Entrada inflada demasiado grande: " + entry.name);
      return out;
    }
    throw new Error("Método de compresión no soportado (" + entry.method + ") en " + entry.name);
  }

  /**
   * Read only the first bytes of an entry, without inflating it completely.
   * Used for magic-number checks over many binary resources.
   * @param {ArrayBuffer} buffer
   * @param {object} entry
   * @param {number} maxBytes
   * @returns {Promise<Uint8Array>}
   */
  async function readEntryHead(buffer, entry, maxBytes) {
    maxBytes = Math.min(maxBytes || 4096, 65536);
    if (entry.isDir || entry.size === 0) return new Uint8Array(0);
    if (entry.encrypted) throw new Error("Entrada cifrada: " + entry.name);

    var range = entryDataRange(buffer, entry);
    var raw = new Uint8Array(buffer, range.start, range.end - range.start);

    if (entry.method === 0) return raw.subarray(0, Math.min(raw.length, maxBytes));
    if (entry.method !== 8) {
      throw new Error("Método de compresión no soportado (" + entry.method + ") en " + entry.name);
    }
    if (typeof DecompressionStream === "undefined") {
      throw new Error("Tu navegador no soporta DecompressionStream.");
    }

    var reader = new Blob([raw]).stream()
      .pipeThrough(new DecompressionStream("deflate-raw"))
      .getReader();
    var chunks = [];
    var total = 0;
    try {
      while (total < maxBytes) {
        var step = await reader.read();
        if (step.done) break;
        chunks.push(step.value);
        total += step.value.length;
      }
    } catch (e) { /* truncated stream: keep what we have */ }
    try { await reader.cancel(); } catch (e) { /* already closed */ }

    var size = Math.min(total, maxBytes);
    var out = new Uint8Array(size);
    var offset = 0;
    for (var i = 0; i < chunks.length && offset < size; i++) {
      var take = Math.min(chunks[i].length, size - offset);
      out.set(chunks[i].subarray(0, take), offset);
      offset += take;
    }
    return out;
  }

  /**
   * Read an entry that lives inside one or more nested archives.
   * `entry.locator` is the chain of archive descriptors from the outer
   * buffer to the containing archive. Each descriptor has the same shape
   * as a normal entry, so the same inflate logic applies.
   */
  async function readNestedEntry(outerBuffer, entry, budgetBytes) {
    var current = outerBuffer;
    var locator = entry.locator || [];
    for (var i = 0; i < locator.length; i++) {
      var bytes = await readEntry(current, locator[i], budgetBytes);
      var copy = new Uint8Array(bytes.length);
      copy.set(bytes);
      current = copy.buffer;
    }
    return readEntry(current, entry, budgetBytes);
  }

  function textOf(bytes) {
    // Strip UTF-8 BOM
    var start = 0;
    if (bytes.length >= 3 && bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) start = 3;
    try {
      return new TextDecoder("utf-8", { fatal: true }).decode(bytes.subarray(start));
    } catch (e) {
      var out = "";
      var max = Math.min(bytes.length, 200000);
      for (var i = start; i < max; i++) out += String.fromCharCode(bytes[i]);
      return out;
    }
  }

  function isTextName(name) {
    return /\.(txt|md|markdown|json|json5|yml|yaml|toml|properties|cfg|conf|ini|xml|html|css|js|ts|java|kt|kts|lang|mf|license|readme|log|gradle|sh|bat|ps1|cmd|env|pem|key|crt|cer)$/i.test(name) ||
      /(^|\/)(LICENSE|README|CHANGELOG|NOTICE|AUTHORS)$/i.test(name) ||
      /META-INF\/(MANIFEST\.MF|.*\.(SF|RSA|DSA|EC))$/i.test(name);
  }

  function formatBytes(n) {
    if (n == null || isNaN(n)) return "—";
    if (n < 1024) return n + " B";
    if (n < 1024 * 1024) return (n / 1024).toFixed(n < 10240 ? 1 : 0) + " KB";
    return (n / (1024 * 1024)).toFixed(1) + " MB";
  }

  GX.zip = {
    isZip: isZip,
    looksLikeZipHead: looksLikeZipHead,
    parse: parse,
    readEntry: readEntry,
    readEntryHead: readEntryHead,
    readNestedEntry: readNestedEntry,
    textOf: textOf,
    isTextName: isTextName,
    formatBytes: formatBytes,
    MAX_ENTRY_BYTES: MAX_ENTRY_BYTES,
    MAX_TOTAL_BYTES: MAX_TOTAL_BYTES,
    MAX_ENTRIES: MAX_ENTRIES
  };
})(window);
