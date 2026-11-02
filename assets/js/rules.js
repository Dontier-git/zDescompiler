/* ============================================================
   GuardX · Package-level rules
   Metadata detection (including nested archives), ZIP integrity
   and package-level findings. Bytecode and behavior analysis
   lives in analysis.js.
   Exposes: GX.rules
   ============================================================ */
(function (global) {
  "use strict";

  var GX = (global.GX = global.GX || {});

  /* ---------------- helpers ---------------- */

  function confidenceLabel(n) {
    if (n >= 85) return "Alta";
    if (n >= 65) return "Media";
    if (n >= 40) return "Baja";
    return "Muy baja";
  }

  function finding(id, title, severity, category, opts) {
    opts = opts || {};
    var conf = opts.confidence == null ? 75 : opts.confidence;
    return {
      id: id,
      title: title,
      severity: severity,
      category: category,
      description: opts.description || "",
      reason: opts.reason || "",
      confidence: conf,
      confidenceLabel: confidenceLabel(conf),
      class: null,
      method: null,
      line: null,
      api: null,
      endpoint: null,
      endpoints: [],
      evidence: opts.evidence || [],
      chain: [],
      locations: opts.locations || [],
      dependency: false,
      library: null,
      archive: opts.archive || null,
      nested: !!opts.archive,
      falsePositives: opts.falsePositives || [],
      recommendation: opts.recommendation || "",
      source: opts.source || null,
      dedupeKey: opts.dedupeKey || ("pkg|" + id)
    };
  }

  function displayName(entry) {
    return entry && (entry.name || entry.innerName) || "";
  }

  function innerName(entry) {
    return entry && (entry.innerName != null ? entry.innerName : entry.name) || "";
  }

  function depthOfEntry(entry) {
    return entry && entry.depth != null ? entry.depth : 0;
  }

  function archiveOfEntry(entry) {
    return entry && entry.archive ? entry.archive : null;
  }

  function locationForEntry(entry) {
    return {
      className: null,
      method: null,
      line: null,
      source: displayName(entry),
      archive: archiveOfEntry(entry),
      dependency: false,
      library: null
    };
  }

  /* ---------------- metadata ---------------- */

  function parseYamlFlat(text) {
    var out = Object.create(null);
    if (!text) return out;
    var lines = text.split(/\r?\n/);
    var currentKey = null;
    for (var i = 0; i < lines.length; i++) {
      var line = lines[i];
      if (!line.trim() || /^\s*#/.test(line)) continue;
      var m = /^([A-Za-z0-9_.\-]+)\s*:\s*(.*)$/.exec(line);
      if (m) {
        var key = m[1];
        var val = m[2].trim();
        if (val === "" || val === "|" || val === ">") {
          out[key] = out[key] || [];
          currentKey = key;
        } else {
          out[key] = val.replace(/^['"]|['"]$/g, "");
          currentKey = null;
        }
      } else if (currentKey && /^\s+-\s+/.test(line)) {
        if (Array.isArray(out[currentKey])) {
          out[currentKey].push(line.replace(/^\s+-\s+/, "").replace(/^['"]|['"]$/g, "").trim());
        }
      }
    }
    return out;
  }

  function parseManifest(text) {
    var out = Object.create(null);
    if (!text) return out;
    var lines = text.split(/\r?\n/);
    var lastKey = null;
    for (var i = 0; i < lines.length; i++) {
      var line = lines[i];
      if (!line.trim()) { lastKey = null; continue; }
      if (line[0] === " " && lastKey) { out[lastKey] += line.slice(1); continue; }
      var idx = line.indexOf(":");
      if (idx > 0) {
        lastKey = line.slice(0, idx).trim();
        out[lastKey] = line.slice(idx + 1).trim();
      }
    }
    return out;
  }

  function keyDepth(key) {
    var m = String(key).match(/!\//g);
    return m ? m.length : 0;
  }

  function isOuterKey(key) {
    return String(key).indexOf("!/") === -1;
  }

  function findFiles(files, pattern) {
    var keys = Object.keys(files);
    var out = [];
    for (var i = 0; i < keys.length; i++) {
      if (pattern.test(keys[i])) out.push(keys[i]);
    }
    out.sort(function (a, b) {
      var da = isOuterKey(a) ? 0 : 1 + keyDepth(a);
      var db = isOuterKey(b) ? 0 : 1 + keyDepth(b);
      if (da !== db) return da - db;
      return a.localeCompare(b);
    });
    return out;
  }

  function firstFile(files, pattern) {
    var list = findFiles(files, pattern);
    return list.length ? { key: list[0], text: files[list[0]] } : null;
  }

  function detectMetadata(model) {
    var meta = {
      name: null,
      version: null,
      main: null,
      author: null,
      description: null,
      apiVersion: null,
      platform: null,
      commands: [],
      permissions: { count: 0, wildcard: false, painful: [] },
      signed: false,
      classCount: 0,
      resourceCount: 0,
      entryCount: 0,
      archiveCount: 1,
      nestedArchiveCount: 0,
      metadataFiles: [],
      nestedMetadata: [],
      nestedMain: false,
      multiRelease: false,
      zip64: false,
      encryptedEntries: 0
    };

    var files = model.textFiles || {};
    var entries = model.entries || [];
    var classes = model.classes || [];
    var archives = model.archives || [];

    function parsePluginYml(found, isNested) {
      var y = parseYamlFlat(found.text);
      return {
        file: found.key,
        nested: !!isNested,
        name: y.name || null,
        version: y.version || null,
        main: y.main || null,
        author: y.author || (Array.isArray(y.authors) ? y.authors.join(", ") : null),
        description: y.description || null,
        apiVersion: y["api-version"] || null,
        commands: extractYamlMapKeys(found.text, "commands"),
        permissions: extractYamlMapKeys(found.text, "permissions"),
        wildcard: /["']?\*["']?\s*:/.test(found.text),
        folia: /^true$/i.test(String(y["folia-supported"] || "").trim()),
        paper: /paper-plugin\.yml$/i.test(found.key)
      };
    }

    function parseFabric(found, isNested) {
      try {
        var fj = JSON.parse(found.text);
        return {
          file: found.key,
          nested: !!isNested,
          name: fj.name || fj.id || null,
          version: fj.version || null,
          main: fj.entrypoints && typeof fj.entrypoints === "object" ? Object.keys(fj.entrypoints).slice(0, 3).join(", ") : null,
          author: fj.authors ? fj.authors.map(function (a) { return typeof a === "string" ? a : a.name; }).filter(Boolean).join(", ") : null,
          description: fj.description || null,
          platform: /quilt/i.test(found.key) ? "Quilt" : "Fabric"
        };
      } catch (e) { return null; }
    }

    function parseToml(found, isNested) {
      var modId = /\bmodId\s*=\s*["']([^"']+)["']/.exec(found.text);
      var dispName = /\bdisplayName\s*=\s*["']([^"']+)["']/.exec(found.text);
      var version = /\bversion\s*=\s*["']([^"']+)["']/.exec(found.text);
      return {
        file: found.key,
        nested: !!isNested,
        name: dispName ? dispName[1] : modId ? modId[1] : null,
        version: version ? version[1] : null,
        main: null,
        author: null,
        description: null,
        platform: /neoforge\.mods\.toml$/i.test(found.key) ? "NeoForge" : "Forge"
      };
    }

    function parseVelocity(found, isNested) {
      try {
        var vj = JSON.parse(found.text);
        return {
          file: found.key,
          nested: !!isNested,
          name: vj.name || vj.id || null,
          version: vj.version || null,
          main: vj.main || null,
          author: vj.author || null,
          description: vj.description || null,
          platform: "Velocity"
        };
      } catch (e) { return null; }
    }

    // Collect every metadata descriptor, then use the outer one as the
    // primary identity. Nested descriptors are still reported so a loader
    // that hides a second plugin inside the JAR is visible.
    var descriptors = [];
    findFiles(files, /(^|\/)(plugin|paper-plugin|bungee)\.yml$/i).forEach(function (key) {
      descriptors.push(parsePluginYml({ key: key, text: files[key] }, !isOuterKey(key)));
    });
    findFiles(files, /(^|\/)fabric\.mod\.json$/i).forEach(function (key) {
      var d = parseFabric({ key: key, text: files[key] }, !isOuterKey(key));
      if (d) descriptors.push(d);
    });
    findFiles(files, /(^|\/)quilt\.mod\.json$/i).forEach(function (key) {
      var d = parseFabric({ key: key, text: files[key] }, !isOuterKey(key));
      if (d) descriptors.push(d);
    });
    findFiles(files, /(^|\/)(neoforge\.)?mods\.toml$/i).forEach(function (key) {
      descriptors.push(parseToml({ key: key, text: files[key] }, !isOuterKey(key)));
    });
    findFiles(files, /velocity-plugin\.json$/i).forEach(function (key) {
      var d = parseVelocity({ key: key, text: files[key] }, !isOuterKey(key));
      if (d) descriptors.push(d);
    });

    descriptors = descriptors.filter(Boolean);
    var primary = descriptors.filter(function (d) { return !d.nested; })[0] || descriptors[0] || null;
    var secondary = descriptors.filter(function (d) { return d !== primary; });

    meta.metadataFiles = descriptors.map(function (d) {
      return { file: d.file, nested: d.nested, name: d.name, version: d.version, platform: d.platform || null };
    });
    meta.nestedMetadata = secondary.filter(function (d) { return d.nested; }).map(function (d) {
      return { file: d.file, name: d.name, version: d.version, platform: d.platform || null };
    });

    if (primary) {
      meta.name = primary.name || null;
      meta.version = primary.version || null;
      meta.main = primary.main || null;
      meta.author = primary.author || null;
      meta.description = primary.description || null;
      meta.apiVersion = primary.apiVersion || null;
      meta.commands = primary.commands || [];
      var perms = primary.permissions || [];
      meta.permissions.count = perms.length;
      meta.permissions.wildcard = !!primary.wildcard || perms.some(function (p) { return /\*/.test(p); });
      meta.permissions.painful = perms.filter(function (p) { return /\*/.test(p); }).slice(0, 8);
      if (primary.platform) {
        meta.platform = primary.platform;
      } else if (primary.paper) {
        meta.platform = primary.folia ? "Paper/Purpur + Folia" : "Paper/Purpur";
      } else {
        meta.platform = primary.folia ? "Bukkit/Spigot + Folia" : "Bukkit/Spigot";
      }
      meta.nestedMain = !!primary.nested;
    }

    var mf = firstFile(files, /META-INF\/MANIFEST\.MF$/i);
    if (mf) {
      var man = parseManifest(mf.text);
      if (!meta.name && man["Implementation-Title"]) meta.name = man["Implementation-Title"];
      if (!meta.version && man["Implementation-Version"]) meta.version = man["Implementation-Version"];
      if (!meta.main && man["Main-Class"]) meta.main = man["Main-Class"];
      if (!meta.platform) meta.platform = "JAR genérico";
    }

    meta.signed = Object.keys(files).some(function (n) {
      return /META-INF\/[^/]+\.(SF|RSA|DSA|EC)$/i.test(n);
    });
    meta.classCount = classes.length;
    meta.resourceCount = entries.filter(function (e) { return !e.isDir && !/\.class$/i.test(innerName(e)); }).length;
    meta.entryCount = entries.filter(function (e) { return !e.isDir; }).length;
    meta.archiveCount = archives.length || 1;
    meta.nestedArchiveCount = Math.max(0, (archives.length || 1) - 1);
    meta.multiRelease = entries.some(function (e) { return /(^|\/)META-INF\/versions\/\d+\//.test(displayName(e)); });
    meta.encryptedEntries = entries.filter(function (e) { return e.encrypted; }).length;
    meta.zip64 = !!(model.zipInfo && model.zipInfo.zip64);

    return meta;
  }

  function extractYamlMapKeys(text, section) {
    var keys = [];
    var lines = text.split(/\r?\n/);
    var inSection = false;
    var sectionIndent = 0;
    var childIndent = -1;
    for (var i = 0; i < lines.length; i++) {
      var line = lines[i];
      if (!line.trim() || /^\s*#/.test(line)) continue;
      var indent = (line.match(/^\s*/) || [""])[0].length;
      if (indent === 0) {
        inSection = new RegExp("^" + section + "\\s*:").test(line.trim());
        sectionIndent = 0;
        childIndent = -1;
        continue;
      }
      if (!inSection) continue;
      if (indent <= sectionIndent) { inSection = false; continue; }
      if (childIndent === -1) childIndent = indent;
      if (indent !== childIndent) continue;
      var m = /^\s*['"]?([^'":#\s][^'":#]*?)['"]?\s*:/.exec(line);
      if (m) keys.push(m[1].trim());
    }
    return keys;
  }

  /* ---------------- package findings ---------------- */

  function packageFindings(model) {
    var findings = [];
    var entries = model.entries || [];
    var meta = model.meta || detectMetadata(model);
    var archives = model.archives || [];
    var nested = model.nestedArchives || [];
    var coverage = model.coverage || {};

    function add(f) { findings.push(f); }

    // ---- zip-slip / absolute paths ----
    var slipEntries = entries.filter(function (e) {
      var n = innerName(e).replace(/\\/g, "/");
      return n.indexOf("../") !== -1 || /^[A-Za-z]:\//.test(n) || n.charAt(0) === "/";
    });
    if (slipEntries.length) {
      add(finding("zip-slip", "Rutas de escape dentro del archivo (zip-slip)", "critical", "Integridad", {
        description: "El archivo contiene entradas con rutas '../' o absolutas. Al descomprimirse podrían escribir fuera de la carpeta destino.",
        reason: "El nombre de la entrada, tomado del índice central del ZIP, escapa del directorio de extracción.",
        confidence: 95,
        evidence: slipEntries.slice(0, 6).map(function (e) { return displayName(e); }),
        source: displayName(slipEntries[0]),
        archive: archiveOfEntry(slipEntries[0]),
        locations: slipEntries.slice(0, 5).map(locationForEntry),
        falsePositives: ["Herramientas de empaquetado mal configuradas."],
        recommendation: "No extraigas el archivo con herramientas que no validen rutas; revisa su origen.",
        dedupeKey: "pkg|zip-slip"
      }));
    }

    // ---- duplicate names inside the same archive ----
    var dupNames = Object.create(null);
    entries.forEach(function (e) {
      if (e.isDir) return;
      var key = (archiveOfEntry(e) || "") + "|" + innerName(e);
      dupNames[key] = (dupNames[key] || 0) + 1;
    });
    var dups = Object.keys(dupNames).filter(function (n) { return dupNames[n] > 1; });
    if (dups.length) {
      add(finding("zip-duplicates", "Entradas duplicadas en el paquete", "medium", "Integridad", {
        description: "Hay nombres de archivo repetidos en el mismo archivo. Es una técnica para ocultar contenido o confundir verificadores.",
        reason: "El índice central registra más de una entrada con el mismo nombre dentro del mismo archivo.",
        confidence: 72,
        evidence: dups.slice(0, 6).map(function (n) { return n + " ×" + dupNames[n]; }),
        source: dups[0].split("|").slice(1).join("|"),
        falsePositives: ["Empaquetadores que no deduplican recursos."],
        recommendation: "Revisa las entradas duplicadas y qué versión carga la JVM.",
        dedupeKey: "pkg|zip-duplicates"
      }));
    }

    // ---- file count ----
    if (entries.length > 5000) {
      add(finding("mass-files", "Cantidad inusual de archivos", "low", "Integridad", {
        description: "El archivo contiene " + entries.length + " entradas (incluyendo archivos anidados). Comprueba que el tamaño sea razonable para su función.",
        reason: "El número de entradas supera el umbral configurado para un plugin típico.",
        confidence: 55,
        evidence: [entries.length + " entradas", (meta.archiveCount || 1) + " archivos contenedores"],
        falsePositives: ["Mods que incluyen assets, idiomas o librerías empaquetadas."],
        recommendation: "Revisa si el tamaño se debe a recursos legítimos o a contenido oculto.",
        dedupeKey: "pkg|mass-files"
      }));
    }

    // ---- signature ----
    if (!meta.signed && meta.classCount > 0) {
      add(finding("unsigned-jar", "JAR sin firma digital", "info", "Integridad", {
        description: "No se encontró firma (META-INF/*.SF). No es obligatorio, pero impide verificar que el archivo no fue alterado.",
        reason: "No hay archivos de firma en META-INF.",
        confidence: 70,
        evidence: ["Sin META-INF/*.SF"],
        source: "META-INF/MANIFEST.MF",
        falsePositives: ["La mayoría de plugins de Bukkit/Paper no se distribuyen firmados."],
        recommendation: "Verifica el SHA-256 contra la fuente oficial del plugin.",
        dedupeKey: "pkg|unsigned"
      }));
    }

    // ---- native libraries ----
    var nativeEntries = entries.filter(function (e) {
      return !e.isDir && /\.(dll|so|dylib|exe|bin|scr|com|msi|sys|drv)$/i.test(innerName(e)) &&
        !/\.class$/i.test(innerName(e)) && e.magic !== "class" && e.magic !== "zip";
    });
    if (nativeEntries.length) {
      add(finding("native-lib", "Librerías nativas o binarios incluidos", nativeEntries.length >= 3 ? "critical" : "high", "Ejecución", {
        description: "El archivo incluye binarios que pueden ejecutarse fuera de la sandbox de la JVM.",
        reason: "El índice del ZIP contiene archivos con extensiones de bibliotecas nativas o ejecutables.",
        confidence: 88,
        evidence: nativeEntries.slice(0, 8).map(function (e) { return displayName(e) + " (" + GX.zip.formatBytes(e.size) + ")"; }),
        source: displayName(nativeEntries[0]),
        archive: archiveOfEntry(nativeEntries[0]),
        locations: nativeEntries.slice(0, 6).map(locationForEntry),
        falsePositives: ["Plugins con integración nativa legítima (rendimiento, cifrado, hardware)."],
        recommendation: "Verifica el origen de cada binario y su hash antes de permitir la extracción.",
        dedupeKey: "pkg|native-lib"
      }));
    }

    // ---- bundled scripts ----
    var scriptEntries = entries.filter(function (e) {
      return !e.isDir && /\.(bat|cmd|sh|ps1|vbs|wsf|hta)$/i.test(innerName(e));
    });
    if (scriptEntries.length) {
      add(finding("bundled-scripts", "Scripts ejecutables empaquetados", "medium", "Ejecución", {
        description: "El archivo contiene scripts de shell o de sistema. No se ejecutan solos, pero suelen acompañar a rutinas de despliegue o persistencia.",
        reason: "Se encontraron archivos con extensión de script dentro del paquete.",
        confidence: 65,
        evidence: scriptEntries.slice(0, 8).map(displayName),
        source: displayName(scriptEntries[0]),
        archive: archiveOfEntry(scriptEntries[0]),
        locations: scriptEntries.slice(0, 6).map(locationForEntry),
        falsePositives: ["Scripts de instalación o mantenimiento documentados por el autor."],
        recommendation: "Revisa el contenido de los scripts antes de ejecutarlos.",
        dedupeKey: "pkg|scripts"
      }));
    }

    // ---- embedded executables / hidden class files ----
    var embeddedExe = (model.embeddedBinary || []).filter(function (b) {
      return b.kind === "MZ" || b.kind === "ELF" || b.kind === "MACHO";
    });
    if (embeddedExe.length) {
      add(finding("embedded-executable", "Ejecutable embebido con extensión encubierta", "critical", "Ejecución", {
        description: "Se encontraron archivos que no son DLL/EXE por nombre pero contienen cabeceras de ejecutable (MZ/ELF/Mach-O).",
        reason: "Los primeros bytes de la entrada coinciden con la firma de un ejecutable nativo.",
        confidence: 95,
        evidence: embeddedExe.slice(0, 6).map(function (b) { return b.name + " (" + b.kind + ")"; }),
        source: embeddedExe[0].name,
        archive: embeddedExe[0].archive || null,
        locations: embeddedExe.slice(0, 5).map(function (b) {
          return { className: null, method: null, line: null, source: b.name, archive: b.archive || null, dependency: false, library: null };
        }),
        falsePositives: ["Recursos que casualmente empiezan con 'MZ' (muy improbable)."],
        recommendation: "No extraigas ni ejecutes ese archivo. Revisa el origen del plugin.",
        dedupeKey: "pkg|embedded-exe"
      }));
    }

    var hiddenClasses = (model.embeddedBinary || []).filter(function (b) { return b.kind === "CLASS"; });
    if (hiddenClasses.length) {
      add(finding("hidden-class", "Clase Java oculta con extensión no .class", "critical", "Ofuscación", {
        description: "Una entrada que no termina en .class contiene la firma CAFEBABE de una clase Java compilada. Es una técnica para esconder código del revisor y cargarlo por bytes.",
        reason: "Los primeros cuatro bytes de la entrada son 0xCAFEBABE, la firma de un class file de la JVM.",
        confidence: 96,
        evidence: hiddenClasses.slice(0, 6).map(function (b) { return b.name + " (" + b.size + " bytes)"; }),
        source: hiddenClasses[0].name,
        archive: hiddenClasses[0].archive || null,
        locations: hiddenClasses.slice(0, 5).map(function (b) {
          return { className: null, method: null, line: null, source: b.name, archive: b.archive || null, dependency: false, library: null };
        }),
        falsePositives: ["Herramientas que renombran clases a propósito (muy poco habitual)."],
        recommendation: "Extrae la entrada y compara su hash; no la cargues dinámicamente.",
        dedupeKey: "pkg|hidden-class"
      }));
    }

    // ---- nested archives ----
    if (nested.length) {
      var disguised = nested.filter(function (n) { return n.disguised; });
      var withClasses = nested.filter(function (n) { return (n.classes || 0) > 0; });
      var withMetadata = nested.filter(function (n) { return n.hasMetadata; });
      var severity = disguised.length ? "high" : (withMetadata.length ? "medium" : (withClasses.length ? "low" : "info"));
      var label = disguised.length
        ? "Archivo comprimido oculto dentro del JAR"
        : "Archivos comprimidos anidados";
      add(finding("nested-archives", label, severity, "Integridad", {
        description: "El JAR contiene otros archivos ZIP/JAR. GuardX los abre de forma recursiva y analiza sus clases, recursos y endpoints; los hallazgos internos se atribuyen a la ruta anidada.",
        reason: "Se detectaron entradas con firma ZIP (" + (disguised.length ? "algunas con extensión distinta a .jar/.zip" : "extensión .jar/.zip") + ").",
        confidence: disguised.length ? 92 : 80,
        evidence: nested.slice(0, 10).map(function (n) {
          return n.path + " · " + (n.classes || 0) + " clases · " + GX.zip.formatBytes(n.size) +
            (n.disguised ? " · oculto como " + n.extension : "") +
            (n.hasMetadata ? " · contiene metadatos de plugin" : "");
        }),
        source: nested[0].path,
        archive: nested[0].parent || null,
        locations: nested.slice(0, 8).map(function (n) {
          return { className: null, method: null, line: null, source: n.path, archive: n.parent || null, dependency: false, library: null };
        }),
        falsePositives: [
          "Aplicaciones Spring Boot o instaladores que empaquetan librerías en BOOT-INF/lib.",
          "Plugins que incluyen dependencias sombreadas (shaded) como JARs separados."
        ],
        recommendation: "Revisa cada archivo anidado; un JAR dentro de otro JAR puede ocultar código que el cargador principal no muestra.",
        dedupeKey: "pkg|nested-archives"
      }));
    }

    if (meta.nestedMetadata && meta.nestedMetadata.length) {
      add(finding("nested-plugin", "Metadatos de plugin dentro de un archivo anidado", "medium", "Metadatos", {
        description: "Un archivo JAR interno declara su propio plugin/mod. GuardX analiza ese contenido aunque el cargador externo no lo muestre en la raíz.",
        reason: "Se encontraron plugin.yml, fabric.mod.json, mods.toml o velocity-plugin.json dentro de un archivo anidado.",
        confidence: 88,
        evidence: meta.nestedMetadata.slice(0, 6).map(function (d) {
          return d.file + " · " + (d.name || "sin nombre") + (d.version ? " " + d.version : "") + (d.platform ? " · " + d.platform : "");
        }),
        source: meta.nestedMetadata[0].file,
        falsePositives: ["Plugins que empaquetan módulos secundarios legítimos."],
        recommendation: "Comprueba quién mantiene el plugin anidado y por qué no se distribuye por separado.",
        dedupeKey: "pkg|nested-plugin"
      }));
    }

    // ---- hidden double extensions ----
    var doubleExt = entries.filter(function (e) {
      return !e.isDir && /\.(png|jpe?g|gif|webp|txt|json|yml|yaml|cfg|conf|dat|bin|log|ico|svg|woff2?|ttf|mp3|ogg|wav)\.(jar|zip|class|exe|dll|so|sh|bat|ps1)$/i.test(innerName(e));
    });
    if (doubleExt.length) {
      add(finding("double-extension", "Archivos con doble extensión", "high", "Ofuscación", {
        description: "Hay archivos cuyo nombre aparenta ser un recurso inofensivo pero termina en una extensión ejecutable o de archivo comprimido.",
        reason: "El nombre de la entrada combina una extensión de recurso y otra ejecutable/archivo.",
        confidence: 82,
        evidence: doubleExt.slice(0, 6).map(displayName),
        source: displayName(doubleExt[0]),
        archive: archiveOfEntry(doubleExt[0]),
        locations: doubleExt.slice(0, 6).map(locationForEntry),
        falsePositives: ["Recursos con nombres generados automáticamente."],
        recommendation: "Inspecciona el contenido real de esas entradas con un editor hexadecimal.",
        dedupeKey: "pkg|double-extension"
      }));
    }

    // ---- encryption / zip bomb / zip64 ----
    var encrypted = entries.filter(function (e) { return e.encrypted; });
    if (encrypted.length) {
      add(finding("encrypted-entries", "Entradas cifradas en el ZIP", "medium", "Integridad", {
        description: "El índice marca entradas cifradas. GuardX no puede leerlas sin la contraseña, así que su contenido queda fuera del análisis.",
        reason: "El bit 0 de los flags generales del ZIP está activo en una o más entradas.",
        confidence: 90,
        evidence: encrypted.slice(0, 6).map(displayName),
        source: displayName(encrypted[0]),
        archive: archiveOfEntry(encrypted[0]),
        falsePositives: ["Archivos protegidos con contraseña por el autor."],
        recommendation: "Solicita el archivo sin cifrar o revisa su origen; el contenido no es auditable.",
        dedupeKey: "pkg|encrypted"
      }));
    }

    var bombs = entries.filter(function (e) {
      return !e.isDir && e.method === 8 && e.size > 1024 * 1024 && e.compressedSize > 0 && (e.size / e.compressedSize) > 200;
    });
    if (bombs.length) {
      add(finding("zip-bomb", "Relación de compresión anómala (posible zip bomb)", "high", "Integridad", {
        description: "Una o más entradas se expanden cientos de veces. Puede ser un recurso comprimido legítimo o un intento de agotar memoria.",
        reason: "El tamaño descomprimido supera 200 veces el tamaño comprimido.",
        confidence: 76,
        evidence: bombs.slice(0, 6).map(function (e) {
          return displayName(e) + " · " + GX.zip.formatBytes(e.compressedSize) + " → " + GX.zip.formatBytes(e.size) + " (" + Math.round(e.size / e.compressedSize) + "×)";
        }),
        source: displayName(bombs[0]),
        archive: archiveOfEntry(bombs[0]),
        locations: bombs.slice(0, 6).map(locationForEntry),
        falsePositives: ["Assets de texturas, idiomas o datos altamente repetitivos comprimidos con deflate."],
        recommendation: "No extraigas el archivo en un entorno con poca memoria sin comprobar el tamaño real.",
        dedupeKey: "pkg|zip-bomb"
      }));
    }

    if (meta.zip64) {
      add(finding("zip64", "Archivo ZIP64", "info", "Integridad", {
        description: "El archivo usa el formato ZIP64 (más de 65 535 entradas o más de 4 GB). GuardX leyó su índice extendido correctamente.",
        reason: "Se encontró el registro ZIP64 End of Central Directory y su localizador.",
        confidence: 100,
        evidence: ["Índice ZIP64 válido"],
        falsePositives: [],
        recommendation: "No requiere acción; es información de formato.",
        dedupeKey: "pkg|zip64"
      }));
    }

    // ---- multi-release / duplicate classes ----
    if (meta.multiRelease) {
      add(finding("multi-release", "JAR multi-release (META-INF/versions)", "info", "Integridad", {
        description: "El archivo incluye clases específicas para varias versiones de Java. GuardX analiza todas las variantes encontradas.",
        reason: "Se encontraron entradas bajo META-INF/versions/<n>/.",
        confidence: 100,
        evidence: entries.filter(function (e) { return /(^|\/)META-INF\/versions\/\d+\//.test(displayName(e)); })
          .slice(0, 8).map(displayName),
        falsePositives: [],
        recommendation: "Revisa que la variante usada por tu versión de Java sea la esperada.",
        dedupeKey: "pkg|multi-release"
      }));
    }

    var classGroups = Object.create(null);
    (model.classes || []).forEach(function (c) {
      if (!c.className) return;
      var key = c.className;
      (classGroups[key] || (classGroups[key] = [])).push(c);
    });
    var crossArchiveDup = [];
    Object.keys(classGroups).forEach(function (name) {
      var list = classGroups[name];
      if (list.length < 2) return;
      var archivesSet = Object.create(null);
      var archivesLabel = Object.create(null);
      list.forEach(function (c) {
        var key = c.archive || "";
        archivesSet[key] = 1;
        archivesLabel[key] = c.archive || "raíz";
      });
      if (Object.keys(archivesSet).length > 1) {
        crossArchiveDup.push({
          name: name,
          count: list.length,
          archives: Object.keys(archivesSet).map(function (k) { return archivesLabel[k]; })
        });
      }
    });
    if (crossArchiveDup.length) {
      add(finding("duplicate-classes", "Clases duplicadas en varios archivos", "medium", "Integridad", {
        description: "La misma clase aparece compilada en más de un archivo del paquete. El cargador puede ejecutar una copia distinta de la que estás revisando.",
        reason: "Se agruparon las clases por nombre y se encontraron varias rutas de origen.",
        confidence: 78,
        evidence: crossArchiveDup.slice(0, 8).map(function (d) {
          return d.name + " · " + d.count + " copias · " + d.archives.join(", ");
        }),
        locations: crossArchiveDup.slice(0, 8).map(function (d) {
          return { className: d.name, method: null, line: null, source: d.archives.join(", "), archive: null, dependency: false, library: null };
        }),
        falsePositives: ["Shaded jars que incluyen la misma dependencia en varios módulos."],
        recommendation: "Determina qué copia carga realmente el classloader y audítala.",
        dedupeKey: "pkg|duplicate-classes"
      }));
    }

    // ---- coverage ----
    if (coverage.unparsedClasses > 0) {
      add(finding("unparsed-classes", "Clases que no se pudieron interpretar", "low", "Integridad", {
        description: "Algunas clases tienen un formato que GuardX no pudo decodificar. Puede ser una versión nueva de Java, un archivo dañado o bytecode deliberadamente malformado.",
        reason: "El parser de class files devolvió un error de estructura.",
        confidence: 60,
        evidence: (coverage.unparsedSamples || []).slice(0, 8),
        falsePositives: ["Clases compiladas con una versión futura de Java.", "Archivos truncados al empaquetar."],
        recommendation: "Abre esas clases con javap o un descompilador para revisarlas manualmente.",
        dedupeKey: "pkg|unparsed-classes"
      }));
    }

    if (coverage.truncated) {
      add(finding("analysis-truncated", "Análisis limitado por tamaño", "info", "Integridad", {
        description: "El archivo superó los límites defensivos de GuardX, así que parte del contenido no se analizó. El informe indica cuántas clases y entradas quedaron fuera.",
        reason: "Se alcanzó el presupuesto de clases, entradas, bytes o profundidad de anidamiento.",
        confidence: 100,
        evidence: (coverage.notes || []).slice(0, 8),
        falsePositives: [],
        recommendation: "Si necesitas cobertura total, divide el JAR o aumenta los límites en el código.",
        dedupeKey: "pkg|analysis-truncated"
      }));
    }

    // ---- wildcard permissions ----
    if (meta.permissions.wildcard) {
      var bareWildcard = (meta.permissions.painful || []).indexOf("*") !== -1;
      add(finding("wildcard-permissions", bareWildcard ? "Permiso comodín total en plugin.yml" : "Permisos con comodín en plugin.yml", bareWildcard ? "medium" : "info", "Metadatos", {
        description: bareWildcard
          ? "El plugin declara el permiso '*' (acceso total). Cualquier jugador con ese permiso obtiene todas las capacidades del servidor."
          : "El plugin declara permisos con asterisco. Son habituales para agrupar permisos, pero conviene revisar qué incluyen.",
        reason: "La sección permissions de plugin.yml contiene claves con '*'.",
        confidence: 88,
        evidence: (meta.permissions.painful.length ? meta.permissions.painful : ["*"]).slice(0, 6),
        source: (meta.metadataFiles[0] && meta.metadataFiles[0].file) || "plugin.yml",
        falsePositives: ["Grupos de permisos jerárquicos como 'essentials.*'."],
        recommendation: "Revisa qué incluye el comodín y a qué rango se concede.",
        dedupeKey: "pkg|wildcard"
      }));
    }

    // ---- main class without package ----
    if (meta.main && meta.main.indexOf(".") === -1) {
      add(finding("default-main", "Clase principal sin paquete", "low", "Metadatos", {
        description: "La clase principal declarada no pertenece a ningún paquete, algo inusual en proyectos mantenidos.",
        reason: "El atributo main de plugin.yml no contiene un nombre cualificado.",
        confidence: 60,
        evidence: [meta.main],
        source: "plugin.yml",
        falsePositives: ["Prototipos o plugins muy antiguos."],
        recommendation: "Verifica el origen del plugin.",
        dedupeKey: "pkg|default-main"
      }));
    }

    return findings;
  }

  GX.rules = {
    detectMetadata: detectMetadata,
    packageFindings: packageFindings,
    parseYamlFlat: parseYamlFlat,
    parseManifest: parseManifest
  };
})(window);
