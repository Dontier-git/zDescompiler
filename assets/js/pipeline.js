/* ============================================================
   GuardX · Shared scan pipeline
   Discovers archives recursively (including JARs inside JARs and
   archives with disguised extensions), reads text and bytecode,
   then runs metadata rules and the interprocedural analysis.
   Exposes: GX.pipeline.scan
   ============================================================ */
(function (global) {
  "use strict";

  var GX = (global.GX = global.GX || {});

  var MAX_FILE_BYTES = 64 * 1024 * 1024;
  var MAX_DEPTH = 4;
  var MAX_ARCHIVES = 80;
  var MAX_NESTED_BYTES = 48 * 1024 * 1024;
  var MAX_CLASSES = 4000;
  var MAX_CLASS_BYTES = 8 * 1024 * 1024;
  var MAX_CLASS_TOTAL = 96 * 1024 * 1024;
  var MAX_TEXT_FILES = 200;
  var MAX_TEXT_BYTES = 12 * 1024 * 1024;
  var MAX_PROBES = 700;
  var ARCHIVE_NAME = /\.(jar|zip|war|ear|jmod|apk|aar)$/i;
  var META_NAME = /(^|\/)(plugin\.yml|paper-plugin\.yml|fabric\.mod\.json|quilt\.mod\.json|mods\.toml|velocity-plugin\.json|MANIFEST\.MF)$/i;

  function now() {
    return (global.performance && global.performance.now) ? global.performance.now() : Date.now();
  }

  function frame() {
    return new Promise(function (resolve) { setTimeout(resolve, 0); });
  }

  function textPriority(name) {
    if (/(^|\/)(plugin|paper-plugin|bungee)\.yml$/i.test(name)) return 0;
    if (/(^|\/)(fabric|quilt)\.mod\.json$/i.test(name)) return 1;
    if (/(^|\/)(neoforge\.)?mods\.toml$/i.test(name)) return 2;
    if (/velocity-plugin\.json$/i.test(name)) return 3;
    if (/META-INF\/MANIFEST\.MF$/i.test(name)) return 4;
    if (/\.(yml|yaml|json|toml|properties)$/i.test(name)) return 5;
    return 6;
  }

  function extensionOf(name) {
    var m = /\.([A-Za-z0-9]{1,10})$/.exec(String(name || ""));
    return m ? m[1].toLowerCase() : "";
  }

  function toArrayBuffer(bytes) {
    if (!bytes) return new ArrayBuffer(0);
    if (bytes.byteOffset === 0 && bytes.byteLength === bytes.buffer.byteLength) return bytes.buffer;
    return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
  }

  function magicOf(head) {
    if (!head || !head.length) return null;
    if (GX.zip.looksLikeZipHead(head)) return "zip";
    if (head.length >= 2 && head[0] === 0x4d && head[1] === 0x5a) return "MZ";
    if (head.length >= 4 && head[0] === 0x7f && head[1] === 0x45 && head[2] === 0x4c && head[3] === 0x46) return "ELF";
    if (head.length >= 4 && head[0] === 0xca && head[1] === 0xfe && head[2] === 0xba && head[3] === 0xbe) return "class";
    if (head.length >= 4 &&
        ((head[0] === 0xfe && head[1] === 0xed && head[2] === 0xfa && (head[3] === 0xce || head[3] === 0xcf)) ||
         (head[0] === 0xce && head[1] === 0xfa && head[2] === 0xed && head[3] === 0xfe) ||
         (head[0] === 0xcf && head[1] === 0xfa && head[2] === 0xed && head[3] === 0xfe))) {
      return "MACHO";
    }
    return null;
  }

  function cloneEntry(source, extra) {
    var out = {};
    var keys = ["name", "method", "flags", "crc", "compressedSize", "size", "localOffset", "isDir", "encrypted", "dataDescriptor", "utf8", "index"];
    for (var i = 0; i < keys.length; i++) out[keys[i]] = source[keys[i]];
    for (var k in extra) {
      if (Object.prototype.hasOwnProperty.call(extra, k)) out[k] = extra[k];
    }
    return out;
  }

  async function scan(input) {
    input = input || {};
    var buffer = input.buffer;
    var fileName = input.fileName || "archivo.jar";
    var fileSize = input.fileSize || (buffer ? buffer.byteLength : 0);
    var hash = input.hash || null;
    var engine = input.engine || "main";
    var onProgress = typeof input.onProgress === "function" ? input.onProgress : function () {};
    var t0 = now();

    if (!buffer) throw new Error("No se recibió el archivo.");
    if (fileSize > MAX_FILE_BYTES) throw new Error("El archivo supera el límite de 64 MB.");
    if (!GX.zip.isZip(buffer)) {
      throw new Error("El archivo no es un JAR/ZIP válido: no se encontró un índice central.");
    }

    var entries = [];
    var classes = [];
    var textFiles = Object.create(null);
    var archives = [];
    var nestedArchives = [];
    var embeddedBinary = [];
    var archiveBuffers = Object.create(null);
    var archiveByPath = Object.create(null);

    var coverage = {
      classEntries: 0,
      parsedClasses: 0,
      skippedClasses: 0,
      unparsedClasses: 0,
      unparsedSamples: [],
      truncated: false,
      notes: [],
      archives: 1,
      nestedArchives: 0,
      encryptedEntries: 0,
      magicProbes: 0,
      bytesRead: 0,
      resourceFiles: 0,
      resourceScanned: 0
    };
    var noteSeen = Object.create(null);
    function note(message) {
      if (!message || noteSeen[message]) return;
      noteSeen[message] = 1;
      if (coverage.notes.length < 20) coverage.notes.push(message);
    }

    var budget = GX.zip.MAX_TOTAL_BYTES;
    function spend(bytes) {
      budget -= bytes;
      coverage.bytesRead += bytes;
    }

    onProgress(8, "Leyendo estructura del ZIP…", 1, false);
    await frame();

    var rootParsed;
    try {
      rootParsed = GX.zip.parse(buffer);
    } catch (err) {
      throw new Error(err && err.message ? err.message : "No se pudo leer el índice del ZIP.");
    }

    var rootArchive = {
      path: fileName,
      parent: null,
      depth: 0,
      size: fileSize,
      entryCount: 0,
      classes: 0,
      resources: 0,
      disguised: false,
      extension: extensionOf(fileName),
      hasMetadata: false,
      zip64: !!rootParsed.zip64,
      truncated: !!rootParsed.truncated,
      encryptedEntries: 0
    };
    archives.push(rootArchive);
    archiveByPath[fileName] = rootArchive;
    archiveBuffers[fileName] = buffer;

    var queue = [{
      buffer: buffer,
      path: fileName,
      parent: null,
      depth: 0,
      prefix: "",
      parsed: rootParsed,
      chain: [],
      locator: [],
      archive: rootArchive
    }];

    var probes = 0;
    var nestedBytes = 0;
    var archiveCount = 1;

    function containingBuffer(entry) {
      if (!entry.chain || !entry.chain.length) return buffer;
      var key = entry.chain[entry.chain.length - 1];
      return archiveBuffers[key] || buffer;
    }

    function shouldProbe(entry) {
      if (!entry || entry.isDir || entry.size <= 0) return false;
      if (entry.encrypted) return false;
      if (ARCHIVE_NAME.test(entry.innerName)) return true;
      if (probes >= MAX_PROBES) return false;
      if (/\.class$/i.test(entry.innerName)) return false;
      if (GX.zip.isTextName(entry.innerName)) return false;
      return true;
    }

    onProgress(16, "Descubriendo archivos anidados…", 2, false);
    await frame();

    var archiveTasks = 0;
    while (queue.length) {
      var task = queue.shift();
      archiveTasks++;
      var start = entries.length;
      var parsed = task.parsed;

      if (parsed.truncated) {
        task.archive.truncated = true;
        coverage.truncated = true;
        note("El índice de " + task.path + " está truncado por el límite de entradas.");
      }

      for (var i = 0; i < parsed.entries.length; i++) {
        var pe = parsed.entries[i];
        var display = task.prefix + pe.name;
        var entry = cloneEntry(pe, {
          name: display,
          innerName: pe.name,
          archive: task.depth ? task.path : null,
          parent: task.depth ? task.path : null,
          depth: task.depth,
          chain: task.chain.slice(),
          locator: task.locator,
          magic: null
        });
        entries.push(entry);
        task.archive.entryCount++;
        if (entry.encrypted) {
          task.archive.encryptedEntries++;
          coverage.encryptedEntries++;
        }
        if (!entry.isDir) {
          if (/\.class$/i.test(entry.innerName)) {
            task.archive.classes++;
            coverage.classEntries++;
          } else {
            task.archive.resources++;
          }
        }
      }

      // Probe a bounded number of entries of this archive to discover nested
      // ZIPs regardless of their extension (e.g. lib/update.dat) and to keep
      // the magic signature for the embedded-binary rules.
      for (var e = start; e < entries.length; e++) {
        var probeEntry = entries[e];
        if (!shouldProbe(probeEntry)) continue;
        try {
          var headBuf = containingBuffer(probeEntry);
          var head = await GX.zip.readEntryHead(headBuf, probeEntry, 8192);
          probes++;
          coverage.magicProbes = probes;
          probeEntry.magic = magicOf(head);
        } catch (err) {
          // Encrypted or unsupported compression: it cannot be inspected.
        }
        if (probes % 60 === 0) await frame();
      }

      // Enqueue nested archives found in this archive.
      for (var n = start; n < entries.length; n++) {
        var candidate = entries[n];
        if (candidate.magic !== "zip") continue;
        if (candidate.size > GX.zip.MAX_ENTRY_BYTES) {
          note("Archivo anidado demasiado grande para abrir: " + candidate.name);
          continue;
        }
        if (task.depth + 1 > MAX_DEPTH) {
          task.archive.truncated = true;
          coverage.truncated = true;
          note("Se alcanzó la profundidad máxima de archivos anidados (" + MAX_DEPTH + ").");
          continue;
        }
        if (archiveCount >= MAX_ARCHIVES) {
          coverage.truncated = true;
          note("Se alcanzó el límite de " + MAX_ARCHIVES + " archivos contenedores.");
          continue;
        }
        if (nestedBytes + candidate.size > MAX_NESTED_BYTES) {
          coverage.truncated = true;
          note("Se alcanzó el presupuesto de lectura de archivos anidados.");
          continue;
        }

        var nestedBytesOut;
        try {
          nestedBytesOut = await GX.zip.readEntry(containingBuffer(candidate), candidate, budget);
        } catch (err) {
          note("No se pudo abrir el archivo anidado " + candidate.name + ": " + (err && err.message ? err.message : err));
          continue;
        }
        spend(nestedBytesOut.length);
        nestedBytes += nestedBytesOut.length;
        var nestedBuffer = toArrayBuffer(nestedBytesOut);

        var nestedParsed;
        try {
          nestedParsed = GX.zip.parse(nestedBuffer);
        } catch (err) {
          note("La entrada " + candidate.name + " tiene firma ZIP pero su índice no es válido.");
          continue;
        }

        var ext = extensionOf(candidate.innerName);
        var archiveObj = {
          path: candidate.name,
          parent: task.depth ? task.path : null,
          depth: task.depth + 1,
          size: nestedBytesOut.length,
          entryCount: 0,
          classes: 0,
          resources: 0,
          disguised: !ARCHIVE_NAME.test(candidate.innerName),
          extension: ext,
          hasMetadata: false,
          zip64: !!nestedParsed.zip64,
          truncated: !!nestedParsed.truncated,
          encryptedEntries: 0
        };
        archives.push(archiveObj);
        nestedArchives.push(archiveObj);
        archiveCount++;
        archiveByPath[candidate.name] = archiveObj;
        archiveBuffers[candidate.name] = nestedBuffer;

        queue.push({
          buffer: nestedBuffer,
          path: candidate.name,
          parent: task.path,
          depth: task.depth + 1,
          prefix: candidate.name + "!/",
          parsed: nestedParsed,
          chain: task.chain.concat([candidate.name]),
          locator: task.locator.concat([candidate]),
          archive: archiveObj
        });
      }

      if (archiveTasks % 4 === 0) await frame();
    }

    coverage.archives = archives.length;
    coverage.nestedArchives = nestedArchives.length;

    /* ---------------- text resources ---------------- */
    onProgress(34, "Extrayendo metadatos y recursos…", 2, false);
    await frame();

    var textCandidates = entries.filter(function (entry) {
      return !entry.isDir && !entry.encrypted && entry.size > 0 && entry.size <= 512 * 1024 &&
        GX.zip.isTextName(entry.innerName);
    });
    textCandidates.sort(function (a, b) {
      return textPriority(a.innerName) - textPriority(b.innerName) ||
        a.depth - b.depth ||
        a.name.localeCompare(b.name);
    });
    if (textCandidates.length > MAX_TEXT_FILES) {
      coverage.truncated = true;
      note("Se analizaron los primeros " + MAX_TEXT_FILES + " recursos de texto de " + textCandidates.length + ".");
    }
    textCandidates = textCandidates.slice(0, MAX_TEXT_FILES);

    var textBytes = 0;
    for (var t = 0; t < textCandidates.length; t++) {
      var textEntry = textCandidates[t];
      if (textBytes + textEntry.size > MAX_TEXT_BYTES) {
        coverage.truncated = true;
        note("Se alcanzó el presupuesto de recursos de texto.");
        break;
      }
      try {
        var textOut = await GX.zip.readEntry(containingBuffer(textEntry), textEntry, budget);
        spend(textOut.length);
        textBytes += textOut.length;
        textFiles[textEntry.name] = GX.zip.textOf(textOut);
      } catch (err) {
        note("No se pudo leer el recurso " + textEntry.name + ".");
      }
      if (t % 20 === 0) await frame();
    }
    coverage.resourceFiles = textCandidates.length;
    coverage.resourceScanned = Object.keys(textFiles).length;

    // Mark which archives declare their own plugin/mod metadata.
    archives.forEach(function (archiveObj) {
      if (archiveObj.depth === 0) {
        archiveObj.hasMetadata = Object.keys(textFiles).some(function (key) {
          return key.indexOf("!/") === -1 && META_NAME.test(key);
        });
        return;
      }
      var prefix = archiveObj.path + "!/";
      archiveObj.hasMetadata = Object.keys(textFiles).some(function (key) {
        return key.indexOf(prefix) === 0 && META_NAME.test(key.slice(prefix.length));
      });
    });

    /* ---------------- bytecode ---------------- */
    onProgress(50, "Analizando bytecode…", 3, false);
    await frame();

    var classCandidates = entries.filter(function (entry) {
      return !entry.isDir && /\.class$/i.test(entry.innerName);
    });
    classCandidates.sort(function (a, b) {
      return a.depth - b.depth || a.name.localeCompare(b.name);
    });

    if (classCandidates.length > MAX_CLASSES) {
      coverage.truncated = true;
      note("Se analizaron " + MAX_CLASSES + " de " + classCandidates.length + " clases.");
    }

    var classBytes = 0;
    var processed = 0;
    for (var c = 0; c < classCandidates.length && classes.length < MAX_CLASSES; c++) {
      var classEntry = classCandidates[c];
      processed++;
      if (classEntry.encrypted) {
        coverage.skippedClasses++;
        continue;
      }
      if (classEntry.size > MAX_CLASS_BYTES) {
        coverage.skippedClasses++;
        if (coverage.unparsedSamples.length < 12) coverage.unparsedSamples.push(classEntry.name + " (demasiado grande)");
        continue;
      }
      if (classBytes + classEntry.size > MAX_CLASS_TOTAL) {
        coverage.truncated = true;
        note("Se alcanzó el presupuesto de bytecode (96 MB).");
        break;
      }

      var classOut;
      try {
        classOut = await GX.zip.readEntry(containingBuffer(classEntry), classEntry, budget);
      } catch (err) {
        coverage.unparsedClasses++;
        coverage.skippedClasses++;
        if (coverage.unparsedSamples.length < 12) coverage.unparsedSamples.push(classEntry.name + " (no se pudo leer)");
        continue;
      }
      spend(classOut.length);
      classBytes += classOut.length;

      var info;
      try {
        info = GX.classfile.parse(classOut);
      } catch (err) {
        coverage.unparsedClasses++;
        if (coverage.unparsedSamples.length < 12) coverage.unparsedSamples.push(classEntry.name + " (error del analizador)");
        continue;
      }

      if (!info || !info.ok || !info.className) {
        coverage.unparsedClasses++;
        if (coverage.unparsedSamples.length < 12) {
          coverage.unparsedSamples.push(classEntry.name + " (" + ((info && info.error) || "clase no reconocida") + ")");
        }
        continue;
      }

      info.uid = classEntry.name;
      info.name = classEntry.name;
      info.innerName = classEntry.innerName;
      info.archive = classEntry.archive;
      info.parent = classEntry.parent;
      info.depth = classEntry.depth;
      info.chain = classEntry.chain;
      info.locator = classEntry.locator;
      info.entrySize = classEntry.size;
      info.crc = classEntry.crc;
      info.compressedSize = classEntry.compressedSize;
      info.magic = classEntry.magic;

      // The constant pool is only needed while decoding; the raw copy would
      // make postMessage heavy and is not used by any later stage.
      delete info.cp;
      if (info.strings && info.strings.length > 2000) info.strings = info.strings.slice(0, 2000);
      if (info.classRefs && info.classRefs.length > 600) info.classRefs = info.classRefs.slice(0, 600);
      if (info.methodRefs && info.methodRefs.length > 600) info.methodRefs = info.methodRefs.slice(0, 600);

      classes.push(info);
      if (c % 25 === 0) {
        var pct = 50 + Math.round((processed / Math.max(1, classCandidates.length)) * 34);
        onProgress(Math.min(84, pct), "Analizando bytecode… (" + classes.length + "/" + Math.min(classCandidates.length, MAX_CLASSES) + ")", 3, false);
        await frame();
      }
    }

    coverage.parsedClasses = classes.length;
    coverage.classEntries = classCandidates.length;
    coverage.skippedClasses = Math.max(coverage.skippedClasses, classCandidates.length - classes.length - coverage.unparsedClasses);

    /* ---------------- embedded binaries / hidden classes ---------------- */
    var seenBinary = Object.create(null);
    entries.forEach(function (entry) {
      if (entry.isDir || /\.class$/i.test(entry.innerName)) return;
      if (!entry.magic) return;
      if (entry.magic !== "MZ" && entry.magic !== "ELF" && entry.magic !== "MACHO" && entry.magic !== "class") return;
      if (seenBinary[entry.name]) return;
      seenBinary[entry.name] = 1;
      embeddedBinary.push({
        name: entry.name,
        kind: entry.magic === "class" ? "CLASS" : entry.magic,
        archive: entry.archive,
        size: entry.size
      });
    });

    /* ---------------- rules + analysis ---------------- */
    onProgress(86, "Evaluando reglas de seguridad…", 4, false);
    await frame();

    var model = {
      entries: entries,
      classes: classes,
      textFiles: textFiles,
      archives: archives,
      nestedArchives: nestedArchives,
      embeddedBinary: embeddedBinary,
      coverage: coverage,
      zipInfo: {
        zip64: !!rootParsed.zip64,
        truncated: !!rootParsed.truncated,
        totalReported: rootParsed.totalReported,
        encryptedEntries: coverage.encryptedEntries
      }
    };

    var meta;
    try {
      meta = GX.rules.detectMetadata(model);
    } catch (err) {
      meta = { name: null, version: null, main: null, platform: null, classCount: classes.length, resourceCount: entries.length, archiveCount: archives.length, nestedArchiveCount: nestedArchives.length };
      note("No se pudieron interpretar todos los metadatos: " + (err && err.message ? err.message : err));
    }

    onProgress(92, "Correlacionando clases, métodos y llamadas…", 4, false);
    await frame();

    var deep;
    try {
      deep = GX.analysis.analyze({
        entries: entries,
        classes: classes,
        textFiles: textFiles,
        meta: meta,
        coverage: coverage,
        archives: archives,
        nestedArchives: nestedArchives,
        embeddedBinary: embeddedBinary
      });
    } catch (err) {
      throw new Error("El análisis de bytecode falló: " + (err && err.message ? err.message : err));
    }

    var pkgFindings;
    try {
      pkgFindings = GX.rules.packageFindings(model);
    } catch (err) {
      pkgFindings = [];
      note("No se pudieron evaluar todas las reglas del paquete: " + (err && err.message ? err.message : err));
    }

    var scored = GX.analysis.scoreFindings(pkgFindings.concat(deep.findings));

    var totalMs = Math.round(now() - t0);
    var stats = deep.stats || {};
    stats.analysisMs = stats.durationMs || 0;
    stats.durationMs = totalMs;
    stats.archiveCount = archives.length;
    stats.nestedArchiveCount = nestedArchives.length;
    stats.coverage = {
      parsedClasses: coverage.parsedClasses,
      classEntries: coverage.classEntries,
      unparsedClasses: coverage.unparsedClasses,
      truncated: coverage.truncated
    };

    meta.sha256 = hash;
    meta.fileSize = fileSize;
    meta.fileName = fileName;

    var report = {
      engine: engine,
      score: scored.score,
      level: scored.level,
      counts: scored.counts,
      findings: scored.findings,
      meta: meta,
      endpoints: deep.endpoints,
      endpointCount: deep.endpointCount,
      dependencies: deep.dependencies,
      obfuscation: deep.obfuscation,
      capabilities: deep.capabilities,
      stats: stats,
      classStats: deep.classStats,
      urls: deep.urls,
      coverage: deep.coverage,
      archives: archives,
      nestedArchives: nestedArchives,
      zipInfo: model.zipInfo
    };

    onProgress(100, "Análisis completado", 4, true);

    return {
      report: report,
      entries: entries,
      textFiles: textFiles,
      classes: classes
    };
  }

  GX.pipeline = {
    scan: scan,
    magicOf: magicOf,
    limits: {
      MAX_FILE_BYTES: MAX_FILE_BYTES,
      MAX_DEPTH: MAX_DEPTH,
      MAX_ARCHIVES: MAX_ARCHIVES,
      MAX_CLASSES: MAX_CLASSES,
      MAX_TEXT_FILES: MAX_TEXT_FILES
    }
  };
})(window);
