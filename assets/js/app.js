/* ============================================================
   GuardX · Application controller
   Orchestrates ZIP extraction, class parsing, rule evaluation
   and rendering. No external dependencies.
   ============================================================ */
(function (global) {
  "use strict";

  var GX = (global.GX = global.GX || {});
  var MAX_FILE_BYTES = 64 * 1024 * 1024;

  var state = {
    scanning: false,
    file: null,
    report: null,
    classes: [],
    classMap: null,
    textFiles: {},
    entries: [],
    activeSeverity: "all",
    query: "",
    hash: null
  };

  /* ---------------- DOM helpers ---------------- */
  function $(sel, root) { return (root || document).querySelector(sel); }
  function $$(sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); }
  function el(tag, className, text) {
    var node = document.createElement(tag);
    if (className) node.className = className;
    if (text != null) node.textContent = text;
    return node;
  }
  function clear(node) { while (node.firstChild) node.removeChild(node.firstChild); }

  var dom = {};

  function cacheDom() {
    dom.body = document.body;
    dom.topbar = $("#topbar");
    dom.dropzone = $("#dropzone");
    dom.fileInput = $("#file-input");
    dom.btnChoose = $("#btn-choose");
    dom.btnDemo = $("#btn-demo");
    dom.btnTheme = $("#btn-theme");
    dom.progress = $("#progress");
    dom.progressBar = $("#progress-bar");
    dom.progressPct = $("#progress-pct");
    dom.progressTitle = $("#progress-title");
    dom.steps = $$(".progress-step");
    dom.error = $("#error-card");
    dom.errorTitle = $("#error-title");
    dom.errorText = $("#error-text");
    dom.results = $("#results");
    dom.verdict = $("#verdict");
    dom.gauge = $("#gauge");
    dom.gaugeScore = $("#gauge-score");
    dom.verdictLabel = $("#verdict-label");
    dom.verdictTitle = $("#verdict-title");
    dom.verdictText = $("#verdict-text");
    dom.verdictFile = $("#verdict-file");
    dom.statCritical = $("#stat-critical");
    dom.statHigh = $("#stat-high");
    dom.statMedium = $("#stat-medium");
    dom.statLow = $("#stat-low");
    dom.metaGrid = $("#meta-grid");
    dom.findingsList = $("#findings-list");
    dom.findingsCount = $("#findings-count");
    dom.chips = $$(".chip[data-sev]");
    dom.search = $("#search-input");
    dom.btnExport = $("#btn-export");
    dom.btnCopy = $("#btn-copy");
    dom.btnReset = $("#btn-reset");
    dom.tree = $("#tree");
    dom.entriesCount = $("#entries-count");
    dom.endpointsPanel = $("#endpoints-panel");
    dom.endpointsList = $("#endpoints-list");
    dom.endpointsCount = $("#endpoints-count");
    dom.endpointSummary = $("#endpoint-summary");
    dom.previewName = $("#preview-name");
    dom.previewBadge = $("#preview-badge");
    dom.previewBody = $("#preview-body");
    dom.toast = $("#toast");
    dom.toastText = $("#toast-text");
  }

  /* ---------------- theme ---------------- */
  function initTheme() {
    var saved = null;
    try { saved = localStorage.getItem("guardx-theme"); } catch (e) { /* ignore */ }
    var theme = saved || (global.matchMedia && global.matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark");
    document.documentElement.setAttribute("data-theme", theme);
    var themeMeta = document.querySelector('meta[name="theme-color"]');
    if (themeMeta) themeMeta.setAttribute("content", theme === "dark" ? "#060a0f" : "#f3f6fa");
    dom.btnTheme.addEventListener("click", function () {
      var next = document.documentElement.getAttribute("data-theme") === "dark" ? "light" : "dark";
      document.documentElement.setAttribute("data-theme", next);
      try { localStorage.setItem("guardx-theme", next); } catch (e) { /* ignore */ }
      if (themeMeta) themeMeta.setAttribute("content", next === "dark" ? "#060a0f" : "#f3f6fa");
    });
  }

  function initTopbar() {
    function onScroll() {
      dom.topbar.classList.toggle("is-stuck", global.scrollY > 8);
    }
    global.addEventListener("scroll", onScroll, { passive: true });
    onScroll();
  }

  /* ---------------- toast ---------------- */
  var toastTimer = null;
  function toast(message, isError) {
    dom.toastText.textContent = message;
    dom.toast.classList.toggle("toast--error", !!isError);
    dom.toast.classList.add("is-visible");
    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { dom.toast.classList.remove("is-visible"); }, 3200);
  }

  /* ---------------- formatting ---------------- */
  function formatBytes(n) { return GX.zip.formatBytes(n); }
  function shortHash(h) { return h ? h.slice(0, 12) : "no disponible"; }

  function delay(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }
  // requestAnimationFrame pauses in hidden/background tabs. Fall back to a
  // timer so a scan started while the tab is occluded still finishes.
  function frame() {
    return new Promise(function (resolve) {
      var settled = false;
      function finish() { if (!settled) { settled = true; resolve(); } }
      if (typeof requestAnimationFrame === "function") requestAnimationFrame(finish);
      setTimeout(finish, 150);
    });
  }

  /* ---------------- progress ---------------- */
  function setStep(step, done) {
    dom.steps.forEach(function (li) {
      var n = Number(li.getAttribute("data-step"));
      li.classList.toggle("is-active", n === step && !done);
      li.classList.toggle("is-done", n < step || (n === step && done));
      var dot = li.querySelector(".progress-step__dot");
      if (dot) dot.textContent = n < step || (n === step && done) ? "✓" : String(n);
    });
  }

  function setProgress(pct, title) {
    pct = Math.max(0, Math.min(100, Math.round(pct)));
    dom.progressBar.style.width = pct + "%";
    dom.progressPct.textContent = pct + "%";
    if (title) dom.progressTitle.textContent = title;
  }

  /* ---------------- sha256 ---------------- */
  async function sha256(buffer) {
    try {
      if (!global.crypto || !global.crypto.subtle) return null;
      var digest = await global.crypto.subtle.digest("SHA-256", buffer);
      return Array.prototype.map.call(new Uint8Array(digest), function (b) {
        return b.toString(16).padStart(2, "0");
      }).join("");
    } catch (e) { return null; }
  }

  /* ---------------- file plumbing ---------------- */
  function validateFile(file) {
    if (!file) return "No se seleccionó ningún archivo.";
    if (file.size === 0) return "El archivo está vacío.";
    if (file.size > MAX_FILE_BYTES) return "El archivo supera el límite de 64 MB.";
    if (!/\.(jar|zip)$/i.test(file.name)) return "Formato no soportado. Usa un archivo .jar o .zip.";
    return null;
  }

  async function handleFile(file) {
    if (state.scanning) return;
    var problem = validateFile(file);
    if (problem) {
      showError("Archivo no válido", problem);
      toast(problem, true);
      return;
    }
    hideError();
    state.scanning = true;
    state.file = file;
    // A new scan always starts with a clean filter state.
    state.activeSeverity = "all";
    state.query = "";
    if (dom.search) dom.search.value = "";
    dom.chips.forEach(function (c) {
      c.classList.toggle("is-active", c.getAttribute("data-sev") === "all");
    });
    dom.dropzone.classList.add("is-busy");
    dom.progress.classList.add("is-visible");
    setProgress(2, "Analizando " + file.name + "…");
    setStep(1);
    if (dom.results.classList.contains("is-visible")) {
      dom.results.classList.remove("is-visible");
    }

    try {
      var buffer = await file.arrayBuffer();
      var hash = await sha256(buffer);
      state.hash = hash;

      // Prefer the worker: the UI stays responsive even on large jars.
      if (global.Worker) {
        try {
          var remote = await scanWithWorker(file, buffer, hash);
          applyScan(remote);
          return;
        } catch (workerError) {
          if (workerError && workerError.analysisError) throw workerError;
          console.warn("[GuardX] Worker no disponible; se usa el hilo principal.", workerError);
        }
      }

      await frame();
      setProgress(12, "Leyendo estructura del ZIP…");
      setStep(1);
      await delay(90);

      // Same pipeline as the worker: recursive archives, text, bytecode,
      // package rules and interprocedural analysis.
      var local = await GX.pipeline.scan({
        buffer: buffer,
        fileName: file.name,
        fileSize: file.size,
        hash: hash,
        engine: "main",
        onProgress: function (pct, title, step, done) {
          setProgress(pct, title);
          if (step) setStep(step, done);
        }
      });

      state.entries = local.entries || [];
      state.textFiles = local.textFiles || Object.create(null);
      state.classes = local.classes || [];
      state.classMap = Object.create(null);
      state.classes.forEach(function (cl) { state.classMap[cl.name] = cl; });
      state.report = local.report;

      setProgress(100, "Análisis completado");
      setStep(4, true);
      await delay(180);

      renderResults(local.report);
      dom.progress.classList.remove("is-visible");
      dom.results.classList.add("is-visible");
      dom.results.scrollIntoView({ behavior: "smooth", block: "start" });
    } catch (err) {
      dom.progress.classList.remove("is-visible");
      showError("No se pudo analizar el archivo", err && err.message ? err.message : String(err));
      toast("El análisis falló. Revisa el detalle del error.", true);
    } finally {
      state.scanning = false;
      dom.dropzone.classList.remove("is-busy");
    }
  }

  function applyScan(scanned) {
    state.entries = scanned.entries || [];
    state.textFiles = scanned.textFiles || Object.create(null);
    state.classes = scanned.classes || [];
    state.classMap = Object.create(null);
    state.classes.forEach(function (cl) { state.classMap[cl.name] = cl; });
    state.report = scanned.report;

    setProgress(100, "Análisis completado");
    setStep(4, true);
    renderResults(scanned.report);
    dom.progress.classList.remove("is-visible");
    dom.results.classList.add("is-visible");
    dom.results.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function scanWithWorker(file, buffer, hash) {
    return new Promise(function (resolve, reject) {
      var worker;
      try {
        worker = new global.Worker("assets/js/worker.js");
      } catch (e) {
        reject(e);
        return;
      }

      var settled = false;
      var timer = setTimeout(function () {
        finish(reject, new Error("El análisis tardó demasiado. Prueba con un archivo más pequeño."));
      }, 180000);

      function finish(fn, value) {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        try { worker.terminate(); } catch (e) { /* ignore */ }
        fn(value);
      }

      worker.onmessage = function (event) {
        var data = event.data || {};
        if (data.type === "progress") {
          setProgress(data.pct, data.title);
          if (data.step) setStep(data.step, data.done);
          return;
        }
        if (data.type === "done") {
          finish(resolve, {
            report: data.report,
            entries: data.entries,
            textFiles: data.textFiles,
            classes: data.classes
          });
        } else if (data.type === "error") {
          var analysisError = new Error(data.message || "El análisis en segundo plano falló.");
          analysisError.analysisError = true;
          finish(reject, analysisError);
        }
      };

      worker.onerror = function (event) {
        finish(reject, new Error(event && event.message ? event.message : "No se pudo iniciar el worker."));
      };

      try {
        worker.postMessage({
          buffer: buffer,
          fileName: file.name,
          fileSize: file.size,
          hash: hash
        });
      } catch (e) {
        finish(reject, e);
      }
    });
  }

  /* ---------------- rendering ---------------- */

  var LEVELS = {
    clean: { label: "Limpio", title: "No se detectaron señales de riesgo", tone: "var(--brand)", soft: "var(--brand-soft)" },
    low: { label: "Riesgo bajo", title: "Riesgo bajo: revisa las observaciones", tone: "var(--low)", soft: "var(--low-soft)" },
    medium: { label: "Riesgo medio", title: "Riesgo medio: hay patrones que requieren atención", tone: "var(--medium)", soft: "var(--medium-soft)" },
    high: { label: "Riesgo alto", title: "Riesgo alto: capacidades peligrosas detectadas", tone: "var(--high)", soft: "var(--high-soft)" },
    critical: { label: "Riesgo crítico", title: "Riesgo crítico: no instales este archivo sin auditarlo", tone: "var(--critical)", soft: "var(--critical-soft)" }
  };

  function summaryText(result) {
    var c = result.counts;
    var total = c.critical + c.high + c.medium + c.low + c.info;
    if (total === 0) {
      return "No se encontraron patrones de riesgo conocidos. Esto no garantiza que el plugin sea seguro: verifica siempre su origen.";
    }
    if (c.critical + c.high + c.medium + c.low === 0) {
      return "Solo hay " + c.info + " observación" + (c.info === 1 ? "" : "es") + " informativa" + (c.info === 1 ? "" : "s") + ". No se detectaron señales de riesgo relevantes.";
    }
    var parts = [];
    if (c.critical) parts.push(c.critical + " crítico" + (c.critical === 1 ? "" : "s"));
    if (c.high) parts.push(c.high + " alto" + (c.high === 1 ? "" : "s"));
    if (c.medium) parts.push(c.medium + " medio" + (c.medium === 1 ? "" : "s"));
    if (c.low) parts.push(c.low + " bajo" + (c.low === 1 ? "" : "s"));
    if (c.info) parts.push(c.info + " informativo" + (c.info === 1 ? "" : "s"));
    var extra = "";
    if (result.endpoints && result.endpoints.length) {
      var hosts = result.endpoints.filter(function (h) { return !h.local; });
      if (hosts.length) extra = " Se identificaron " + hosts.length + " host" + (hosts.length === 1 ? "" : "s") + " externo" + (hosts.length === 1 ? "" : "s") + ".";
    }
    return "Se detectaron " + total + " hallazgo" + (total === 1 ? "" : "s") + ": " + parts.join(", ") + "." + extra + " Revisa la evidencia antes de instalar.";
  }

  function renderResults(result) {
    var level = LEVELS[result.level] || LEVELS.clean;
    dom.verdict.style.setProperty("--tone", level.tone);
    dom.verdict.style.setProperty("--tone-soft", level.soft);
    dom.gauge.style.setProperty("--tone", level.tone);
    dom.gauge.style.setProperty("--value", "0");
    dom.gaugeScore.textContent = "0";
    dom.gauge.setAttribute("aria-label", "Puntuación de riesgo: " + result.score + " de 100");
    if (document.hidden) {
      dom.gauge.style.setProperty("--value", String(result.score));
      dom.gaugeScore.textContent = String(result.score);
    } else {
      // animate gauge
      requestAnimationFrame(function () {
        dom.gauge.style.setProperty("--value", String(result.score));
        var start = performance.now();
        var dur = 700;
        var target = result.score;
        function tick(now) {
          var t = Math.min(1, (now - start) / dur);
          var eased = 1 - Math.pow(1 - t, 3);
          dom.gaugeScore.textContent = String(Math.round(target * eased));
          if (t < 1) requestAnimationFrame(tick);
        }
        requestAnimationFrame(tick);
      });
      // Safety net: rAF can stay paused in occluded windows.
      setTimeout(function () {
        if (dom.gaugeScore.textContent !== String(result.score)) {
          dom.gaugeScore.textContent = String(result.score);
          dom.gauge.style.setProperty("--value", String(result.score));
        }
      }, 1400);
    }

    dom.verdictLabel.textContent = level.label;
    dom.verdictTitle.textContent = level.title;
    dom.verdictText.textContent = summaryText(result);

    // file chips
    clear(dom.verdictFile);
    var fileChip = el("span", "badge");
    fileChip.textContent = result.meta.fileName || "archivo";
    var sizeChip = el("span", "badge");
    sizeChip.textContent = formatBytes(result.meta.fileSize);
    var hashChip = el("span", "badge");
    hashChip.textContent = "sha256:" + shortHash(result.meta.sha256);
    hashChip.title = result.meta.sha256 || "hash no disponible";
    dom.verdictFile.appendChild(fileChip);
    dom.verdictFile.appendChild(sizeChip);
    dom.verdictFile.appendChild(hashChip);

    dom.statCritical.textContent = result.counts.critical;
    dom.statHigh.textContent = result.counts.high;
    dom.statMedium.textContent = result.counts.medium;
    dom.statLow.textContent = result.counts.low;

    renderMeta(result);
    renderFindings(result);
    renderEndpoints(result);
    renderTree(result);
    resetPreview();
  }

  function renderMeta(result) {
    var meta = result.meta;
    var stats = result.stats || {};
    clear(dom.metaGrid);
    var cells = [
      { label: "Nombre", value: meta.name || "No declarado" },
      { label: "Versión", value: meta.version || "—" },
      { label: "Plataforma", value: meta.platform || "Desconocida" },
      { label: "Clase principal", value: meta.main || "—", mono: true },
      { label: "Autor", value: meta.author || "—" },
      { label: "Archivos", value: meta.resourceCount + " recursos · " + meta.classCount + (meta.classCount === 1 ? " clase" : " clases") },
      { label: "Contenedores", value: (stats.archiveCount || 1) + " archivos ZIP · " + (stats.nestedArchiveCount || 0) + " anidados" },
      { label: "Cobertura", value: (stats.coverage ? stats.coverage.parsedClasses + "/" + stats.coverage.classEntries + " clases" : "—") + (stats.coverage && stats.coverage.truncated ? " · parcial" : "") },
      { label: "Análisis", value: (stats.methodCount || 0) + " métodos · " + (stats.instructionCount || 0) + " instrucciones" },
      { label: "Red", value: (stats.hostCount || 0) + " hosts · " + (stats.endpointCount || 0) + " endpoints" },
      { label: "Motor", value: result.engine === "worker" ? "Web Worker" : "Hilo principal" },
      { label: "Dependencias", value: (stats.dependencyClassCount || 0) + " clases empaquetadas" },
      { label: "Firma", value: meta.signed ? "Firmado" : "Sin firmar" },
      { label: "Tamaño", value: formatBytes(meta.fileSize) },
      { label: "Análisis (ms)", value: String(stats.durationMs || 0) }
    ];
    cells.forEach(function (cell) {
      var wrap = el("div", "meta-cell");
      var dt = el("dt", null, cell.label);
      var dd = el("dd", cell.mono ? "mono" : null, cell.value);
      wrap.appendChild(dt);
      wrap.appendChild(dd);
      dom.metaGrid.appendChild(wrap);
    });
  }

  function severityLabel(sev) {
    return { critical: "Crítico", high: "Alto", medium: "Medio", low: "Bajo", info: "Info" }[sev] || sev;
  }

  function renderFindings(result) {
    dom.findingsCount.textContent = String(result.findings.length);
    var counts = result.counts;
    dom.chips.forEach(function (chip) {
      var sev = chip.getAttribute("data-sev");
      var badge = chip.querySelector("[data-count]");
      if (badge) {
        badge.textContent = sev === "all"
          ? String(result.findings.length)
          : String(counts[sev] || 0);
      }
    });
    renderFilteredFindings();
  }

  function confidenceTone(n) {
    if (n >= 85) return "high";
    if (n >= 65) return "medium";
    if (n >= 40) return "low";
    return "verylow";
  }

  function findingHaystack(f) {
    var parts = [
      f.title, f.description, f.reason, f.category,
      f.class || "", f.method || "", f.api || "", f.endpoint || "",
      f.source || "", f.library || ""
    ];
    (f.evidence || []).forEach(function (e) { parts.push(e); });
    (f.falsePositives || []).forEach(function (e) { parts.push(e); });
    (f.chain || []).forEach(function (e) { parts.push(e); });
    (f.endpoints || []).forEach(function (e) { parts.push(e.url || ""); parts.push(e.host || ""); });
    (f.locations || []).forEach(function (l) { parts.push(l.className || ""); parts.push(l.method || ""); parts.push(l.source || ""); });
    return parts.join(" ").toLowerCase();
  }

  function findingLocationText(f) {
    if (f.class) {
      return f.class + (f.method ? "#" + f.method : "") + (f.line ? " · línea " + f.line : "");
    }
    if (f.source) return f.source + (f.line ? ":" + f.line : "");
    if (f.locations && f.locations.length && f.locations[0].source) return f.locations[0].source;
    return "Paquete completo";
  }

  function addFact(container, label, value, mono) {
    if (!value) return;
    var row = el("div", "fact");
    row.appendChild(el("span", "fact__label", label));
    var v = el(mono ? "code" : "span", "fact__value", value);
    row.appendChild(v);
    container.appendChild(row);
  }

  function renderFilteredFindings() {
    if (!state.report) return;
    var list = dom.findingsList;
    clear(list);
    var sev = state.activeSeverity;
    var q = state.query.trim().toLowerCase();

    var items = state.report.findings.filter(function (f) {
      if (sev !== "all" && f.severity !== sev) return false;
      if (!q) return true;
      return findingHaystack(f).indexOf(q) !== -1;
    });

    if (!items.length) {
      var empty = el("div", "empty-state");
      empty.textContent = state.report.findings.length === 0
        ? "No se detectaron comportamientos de riesgo con las reglas actuales."
        : "Ningún hallazgo coincide con el filtro o la búsqueda.";
      list.appendChild(empty);
      return;
    }

    items.forEach(function (f, index) {
      var details = el("details", "finding");
      details.setAttribute("data-sev", f.severity);
      if (index === 0 && (f.severity === "critical" || f.severity === "high")) details.open = true;

      var summary = document.createElement("summary");
      summary.className = "finding__summary";

      var sevPill = el("span", "sev sev--" + f.severity, severityLabel(f.severity));
      summary.appendChild(sevPill);

      var main = el("span", "finding__main");
      main.appendChild(el("span", "finding__title", f.title));
      var where = el("span", "finding__where");
      where.appendChild(el("code", null, findingLocationText(f)));
      if (f.dependency) where.appendChild(el("span", "tag tag--dep", "dependencia"));
      main.appendChild(where);
      summary.appendChild(main);

      var side = el("span", "finding__side");
      var conf = el("span", "conf conf--" + confidenceTone(f.confidence), "Confianza " + (f.confidenceLabel || "").toLowerCase() + " · " + f.confidence);
      side.appendChild(conf);
      side.appendChild(el("span", "finding__cat", f.category));
      summary.appendChild(side);
      details.appendChild(summary);

      var body = el("div", "finding__body");
      if (f.description) body.appendChild(el("p", "finding__desc", f.description));

      var facts = el("div", "finding__facts");
      addFact(facts, "API", f.api, true);
      if (f.endpoint && (!f.endpoints || f.endpoints.length <= 1)) addFact(facts, "Endpoint", f.endpoint, true);
      if (f.class) addFact(facts, "Clase", f.class, true);
      if (f.method) addFact(facts, "Método", f.method, true);
      if (f.source) addFact(facts, "Archivo", f.source, true);
      if (f.library) addFact(facts, "Dependencia", f.library, true);
      if (facts.childNodes.length) body.appendChild(facts);

      if (f.reason) {
        body.appendChild(el("h4", "finding__h", "Motivo de la clasificación"));
        body.appendChild(el("p", "finding__reason", f.reason));
      }

      if (f.evidence && f.evidence.length) {
        body.appendChild(el("h4", "finding__h", "Evidencia técnica"));
        var ev = el("ul", "evidence");
        f.evidence.forEach(function (value) {
          ev.appendChild(el("li", null, value));
        });
        body.appendChild(ev);
      }

      if (f.chain && f.chain.length > 1) {
        body.appendChild(el("h4", "finding__h", "Cadena de llamadas"));
        var chain = el("div", "chain");
        f.chain.forEach(function (step, i) {
          if (i) chain.appendChild(el("span", "chain__arrow", "→"));
          chain.appendChild(el("code", "chain__step", step));
        });
        body.appendChild(chain);
      }

      if (f.endpoints && f.endpoints.length > 1) {
        body.appendChild(el("h4", "finding__h", "Endpoints implicados"));
        var eps = el("ul", "endpoint-inline");
        f.endpoints.slice(0, 8).forEach(function (ep) {
          var li = el("li");
          li.appendChild(el("code", null, ep.url));
          if (ep.dynamic) li.appendChild(el("span", "tag tag--dynamic", "dinámico"));
          eps.appendChild(li);
        });
        body.appendChild(eps);
      }

      if (f.falsePositives && f.falsePositives.length) {
        body.appendChild(el("h4", "finding__h", "Posibles falsos positivos"));
        var fp = el("ul", "fp");
        f.falsePositives.forEach(function (value) { fp.appendChild(el("li", null, value)); });
        body.appendChild(fp);
      }

      if (f.recommendation) body.appendChild(el("p", "finding__rec", f.recommendation));

      if (f.locations && f.locations.length > 1) {
        var locs = document.createElement("details");
        locs.className = "locations";
        var locSummary = document.createElement("summary");
        locSummary.textContent = "Ubicaciones adicionales (" + (f.locations.length - 1) + ")";
        locs.appendChild(locSummary);
        var locList = el("ul");
        f.locations.forEach(function (loc) {
          if (loc.className === f.class && loc.method === f.method) return;
          var text = loc.className ? loc.className + (loc.method ? "#" + loc.method : "") + (loc.line ? " · línea " + loc.line : "") : (loc.source || "archivo");
          locList.appendChild(el("li", null, text));
        });
        locs.appendChild(locList);
        body.appendChild(locs);
      }

      details.appendChild(body);
      list.appendChild(details);
    });
  }

  /* ---------------- endpoints ---------------- */

  function riskLabel(sev) {
    return { critical: "Riesgo crítico", high: "Riesgo alto", medium: "Riesgo medio", low: "Riesgo bajo", info: "Informativo" }[sev] || "Informativo";
  }

  function focusSearch(value) {
    if (!dom.search) return;
    dom.search.value = value;
    state.query = value;
    renderFilteredFindings();
    var panel = dom.findingsList.closest(".panel");
    if (panel) panel.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function renderEndpoints(result) {
    if (!dom.endpointsList) return;
    clear(dom.endpointsList);
    clear(dom.endpointSummary);
    var hosts = result.endpoints || [];
    dom.endpointsCount.textContent = String(hosts.length);

    var risky = hosts.filter(function (h) { return h.risk === "critical" || h.risk === "high"; }).length;
    var ips = hosts.filter(function (h) { return h.ip; }).length;
    var hooks = hosts.filter(function (h) { return h.webhook || h.tunnel; }).length;
    var summaryBits = [
      (result.endpointCount || 0) + " endpoints",
      hosts.length + " hosts"
    ];
    if (ips) summaryBits.push(ips + " IP");
    if (hooks) summaryBits.push(hooks + " webhook/túnel");
    if (risky) summaryBits.push(risky + " de riesgo alto");
    dom.endpointSummary.textContent = summaryBits.join(" · ");

    if (!hosts.length) {
      dom.endpointsList.appendChild(el("div", "empty-state", "No se identificaron hosts externos en el bytecode ni en los recursos del JAR."));
      return;
    }

    hosts.forEach(function (host) {
      var card = el("div", "endpoint-host");
      card.setAttribute("data-risk", host.risk || "info");

      var head = el("div", "endpoint-host__head");
      var titleWrap = el("div", "endpoint-host__title");
      titleWrap.appendChild(el("code", "endpoint-host__name", host.host));
      if (host.webhook) titleWrap.appendChild(el("span", "tag tag--warn", "webhook"));
      if (host.tunnel) titleWrap.appendChild(el("span", "tag tag--warn", "túnel"));
      if (host.ip) titleWrap.appendChild(el("span", "tag", "IP"));
      if (host.local) titleWrap.appendChild(el("span", "tag", "local"));
      if (host.schemes && host.schemes.indexOf("http") !== -1) titleWrap.appendChild(el("span", "tag tag--warn", "sin TLS"));
      if (host.schemes && host.schemes.indexOf("https") !== -1) titleWrap.appendChild(el("span", "tag tag--ok", "TLS"));
      head.appendChild(titleWrap);

      var actions = el("div", "endpoint-host__actions");
      var searchBtn = el("button", "btn btn--sm btn--ghost", "Buscar en hallazgos");
      searchBtn.type = "button";
      searchBtn.addEventListener("click", function () { focusSearch(host.host); });
      actions.appendChild(searchBtn);
      actions.appendChild(el("span", "risk-pill risk-pill--" + (host.risk || "info"), riskLabel(host.risk)));
      head.appendChild(actions);
      card.appendChild(head);

      var metaBits = [host.count + " endpoint" + (host.count === 1 ? "" : "s")];
      if (host.classes.length) metaBits.push(host.classes.length + " clase" + (host.classes.length === 1 ? "" : "s"));
      if (host.methods.length) metaBits.push(host.methods.length + " método" + (host.methods.length === 1 ? "" : "s"));
      card.appendChild(el("div", "endpoint-host__meta", metaBits.join(" · ")));

      var ul = el("ul", "endpoint-list");
      function buildEndpointItem(ep) {
        var li = el("li");
        var line1 = el("div", "endpoint-line");
        line1.appendChild(el("code", "endpoint-url", ep.url));
        if (ep.dynamic) line1.appendChild(el("span", "tag tag--dynamic", "dinámico"));
        if (ep.write) line1.appendChild(el("span", "tag tag--warn", "escritura"));
        if (ep.dataFlow) line1.appendChild(el("span", "tag tag--warn", "flujo de datos"));
        li.appendChild(line1);
        var whereBits = [];
        if (ep.className) whereBits.push(ep.className + (ep.method ? "#" + ep.method : ""));
        else if (ep.source) whereBits.push(ep.source + (ep.line ? ":" + ep.line : ""));
        if (ep.line && ep.className) whereBits.push("línea " + ep.line);
        if (ep.api) whereBits.push(ep.api);
        if (whereBits.length) li.appendChild(el("div", "endpoint-where", whereBits.join(" · ")));
        return li;
      }

      host.endpoints.slice(0, 3).forEach(function (ep) {
        ul.appendChild(buildEndpointItem(ep));
      });
      card.appendChild(ul);

      if (host.endpoints.length > 3) {
        var more = el("button", "btn btn--sm btn--ghost endpoint-more-btn", "Ver " + (host.endpoints.length - 3) + " endpoints más");
        more.type = "button";
        more.addEventListener("click", function () {
          host.endpoints.slice(3).forEach(function (ep) { ul.appendChild(buildEndpointItem(ep)); });
          more.remove();
        });
        card.appendChild(more);
      }
      dom.endpointsList.appendChild(card);
    });
  }

  /* ---------------- file tree ---------------- */

  function buildTree(entries) {
    function makeNode(name, isArchive) {
      return { name: name, dirs: Object.create(null), files: [], archive: !!isArchive };
    }
    var root = makeNode("");
    entries.forEach(function (entry) {
      if (entry.isDir) return;
      var parts = entry.name.split("/");
      var node = root;
      for (var i = 0; i < parts.length - 1; i++) {
        var raw = parts[i];
        if (!raw) continue;
        var isArchive = /!$/.test(raw);
        var part = isArchive ? raw.slice(0, -1) : raw;
        if (!node.dirs[part]) node.dirs[part] = makeNode(part, isArchive);
        node = node.dirs[part];
      }
      var last = parts[parts.length - 1] || entry.name;
      node.files.push({
        label: last,
        entry: entry,
        isArchive: /!$/.test(last) || entry.magic === "zip"
      });
    });
    return root;
  }

  function renderTree(result) {
    clear(dom.tree);
    var entries = result.__entries || state.entries;
    dom.entriesCount.textContent = String(entries.filter(function (e) { return !e.isDir; }).length);

    var flaggedClasses = Object.create(null);
    var riskyFiles = Object.create(null);
    (result.findings || []).forEach(function (f) {
      if (f.class) flaggedClasses[f.class] = true;
      if (f.source) riskyFiles[f.source] = true;
      (f.locations || []).forEach(function (loc) {
        if (loc.className) flaggedClasses[loc.className] = true;
        if (loc.source) riskyFiles[loc.source] = true;
      });
    });

    var tree = buildTree(entries);
    var rendered = 0;
    var maxNodes = 900;

    function renderNode(node, container, depth) {
      Object.keys(node.dirs).sort().forEach(function (dirName) {
        if (rendered >= maxNodes) return;
        var child = node.dirs[dirName];
        var details = document.createElement("details");
        if (depth < 1) details.open = true;
        if (child.archive) details.classList.add("tree-archive");
        var summary = document.createElement("summary");
        summary.textContent = dirName + (child.archive ? " · archivo comprimido" : "") + "/";
        if (child.archive) summary.title = "Archivo comprimido anidado; su contenido se analizó por separado.";
        details.appendChild(summary);
        renderNode(child, details, depth + 1);
        container.appendChild(details);
        rendered++;
      });

      node.files.sort(function (a, b) { return a.label.localeCompare(b.label); }).forEach(function (file) {
        if (rendered >= maxNodes) return;
        var btn = el("button", "leaf");
        btn.type = "button";
        var entryName = file.entry.name;
        var info = state.classMap ? state.classMap[entryName] : null;
        var isClass = /\.class$/i.test(entryName);
        var className = info ? info.className : (isClass ? entryName.split("!/").pop().replace(/\.class$/i, "").replace(/\//g, ".") : null);
        var risky = riskyFiles[entryName] || (className && flaggedClasses[className]) ||
          /\.(dll|so|dylib|exe)$/i.test(entryName) || entryName.indexOf("../") !== -1 ||
          file.isArchive;
        if (risky) btn.classList.add("is-risk");
        if (file.isArchive) btn.classList.add("leaf--archive");
        var nameSpan = el("span", null, file.label + (file.isArchive ? " · zip" : ""));
        var sizeSpan = el("span", "size", formatBytes(file.entry.size));
        btn.appendChild(nameSpan);
        btn.appendChild(sizeSpan);
        btn.title = entryName +
          (file.entry.archive ? " · dentro de " + file.entry.archive : "") +
          (risky ? " · con hallazgos o contenido comprimido" : "");
        btn.addEventListener("click", function () {
          $$(".leaf", dom.tree).forEach(function (n) { n.classList.remove("is-selected"); });
          btn.classList.add("is-selected");
          previewEntry(file.entry);
        });
        container.appendChild(btn);
        rendered++;
      });
    }

    renderNode(tree, dom.tree, 0);

    if (rendered >= maxNodes) {
      dom.tree.appendChild(el("div", "empty-state", "Vista limitada a 900 elementos."));
    }
  }

  function resetPreview() {
    dom.previewName.textContent = "Selecciona un archivo";
    dom.previewBadge.textContent = "—";
    clear(dom.previewBody);
    dom.previewBody.appendChild(el("p", null, "Haz clic en un archivo de texto o en una clase para inspeccionarlo."));
  }

  function methodLabel(name, desc) {
    if (name === "<init>") return "constructor" + describeParams(desc);
    if (name === "<clinit>") return "<clinit>";
    return name + describeParams(desc);
  }

  function describeParams(desc) {
    var m = /^\((.*)\)/.exec(desc || "");
    if (!m) return "";
    var body = m[1];
    var out = [];
    var i = 0;
    while (i < body.length) {
      var arrays = 0;
      while (body[i] === "[") { arrays++; i++; }
      var c = body[i];
      if (c === "L") {
        var end = body.indexOf(";", i);
        if (end < 0) break;
        out.push(body.slice(i + 1, end).split("/").pop() + "[]".repeat(arrays));
        i = end + 1;
      } else {
        var map = { I: "int", J: "long", D: "double", F: "float", Z: "boolean", B: "byte", C: "char", S: "short" };
        out.push((map[c] || c || "?") + "[]".repeat(arrays));
        i++;
      }
    }
    return "(" + out.join(", ") + ")";
  }

  function firstMethodLine(m) {
    if (!m.lineNumbers) return null;
    var min = Infinity;
    Object.keys(m.lineNumbers).forEach(function (k) {
      var n = m.lineNumbers[k];
      if (n < min) min = n;
    });
    return isFinite(min) ? min : null;
  }

  async function previewEntry(entry) {
    dom.previewName.textContent = entry.name;
    dom.previewBadge.textContent = formatBytes(entry.size);
    clear(dom.previewBody);

    if (/\.class$/i.test(entry.name) && state.classMap) {
      var info = state.classMap[entry.name];
      if (info) {
        var findings = (state.report && state.report.findings ? state.report.findings : []).filter(function (f) {
          if (f.class === info.className) return true;
          return (f.locations || []).some(function (l) { return l.className === info.className; });
        });

        var box = el("div", "file-meta");
        var rows = [
          ["Clase", info.className || entry.name],
          ["Superclase", info.superName || "—"],
          ["Contenedor", info.archive ? info.archive : "raíz (archivo subido)"],
          ["Profundidad", String(info.depth || 0)],
          ["Versión", "major " + info.major + " · minor " + info.minor],
          ["Métodos", String((info.methods || []).length)],
          ["Instrucciones", String((info.methods || []).reduce(function (n, m) {
            return n + (m.instructionCount != null ? m.instructionCount : (m.instructions ? m.instructions.length : 0));
          }, 0))],
          ["Cadenas", String((info.strings || []).length)],
          ["Clases referenciadas", String((info.classRefs || []).length)]
        ];
        if (info.decodeErrors && info.decodeErrors.length) {
          rows.push(["Errores de decodificación", String(info.decodeErrors.length)]);
        }
        rows.forEach(function (r) {
          var line = el("div");
          line.appendChild(el("b", null, r[0] + ": "));
          line.appendChild(document.createTextNode(String(r[1])));
          box.appendChild(line);
        });

        var classStat = state.report && state.report.classStats
          ? (state.report.classStats[info.uid] || state.report.classStats[info.className])
          : null;
        if (classStat && classStat.apiCounts) {
          var apis = Object.keys(classStat.apiCounts).sort(function (a, b) {
            return classStat.apiCounts[b] - classStat.apiCounts[a];
          }).slice(0, 6);
          if (apis.length) {
            var apiLine = el("div");
            apiLine.appendChild(el("b", null, "APIs destacadas: "));
            apiLine.appendChild(document.createTextNode(apis.join(", ")));
            box.appendChild(apiLine);
          }
        }

        if (findings.length) {
          var found = el("div", "preview-findings");
          found.appendChild(el("b", null, "Hallazgos (" + findings.length + "): "));
          findings.slice(0, 4).forEach(function (f) {
            var tag = el("span", "preview-finding sev--" + f.severity, severityLabel(f.severity) + " · " + f.title);
            found.appendChild(tag);
          });
          box.appendChild(found);
        }

        dom.previewBody.appendChild(box);

        if (info.methods && info.methods.length) {
          var methodBox = el("div", "method-box");
          var head = el("div", "method-box__head");
          head.appendChild(el("b", null, "Métodos y bytecode"));
          head.appendChild(el("span", null, info.methods.length > 30 ? "mostrando 30 de " + info.methods.length : info.methods.length + " métodos"));
          methodBox.appendChild(head);
          var list = el("div", "method-list");
          info.methods.slice(0, 30).forEach(function (m) {
            var label = methodLabel(m.name, m.descriptor);
            var line = firstMethodLine(m);
            var related = findings.filter(function (f) { return f.method === label; });
            var row = el("div", "method-row" + (m.synthetic ? " is-synth" : "") + (related.length ? " is-risk" : ""));
            row.appendChild(el("code", "method-row__name", label));
            var bits = [];
            if (line) bits.push("línea " + line);
            bits.push((m.instructionCount != null ? m.instructionCount : (m.instructions ? m.instructions.length : 0)) + " instr.");
            if (m.synthetic) bits.push("sintético");
            if (related.length) bits.push(related.length + " hallazgo" + (related.length === 1 ? "" : "s"));
            row.appendChild(el("span", "method-row__meta", bits.join(" · ")));
            row.title = related.length ? related.map(function (f) { return f.title; }).join(" · ") : label;
            list.appendChild(row);
          });
          methodBox.appendChild(list);
          dom.previewBody.appendChild(methodBox);
        }
        return;
      }
    }

    if (!GX.zip.isTextName(entry.name)) {
      var meta = el("div", "file-meta");
      var kind = entry.magic === "zip" ? "archivo ZIP/JAR anidado"
        : entry.magic === "MZ" || entry.magic === "ELF" || entry.magic === "MACHO" ? "ejecutable nativo (" + entry.magic + ")"
        : entry.magic === "class" ? "clase Java con extensión distinta a .class"
        : "binario";
      var bits = [
        ["Tipo", kind],
        ["Tamaño", formatBytes(entry.size)],
        ["Contenedor", entry.archive ? entry.archive : "raíz (archivo subido)"],
        ["Profundidad", String(entry.depth || 0)],
        ["Compresión", entry.method === 0 ? "sin comprimir" : "deflate"],
        ["CRC32", "0x" + (entry.crc >>> 0).toString(16)]
      ];
      if (entry.encrypted) bits.push(["Cifrado", "sí (no se puede leer sin contraseña)"]);
      if (entry.dataDescriptor) bits.push(["Data descriptor", "sí"]);
      bits.forEach(function (b) {
        var line = el("div");
        line.appendChild(el("b", null, b[0] + ": "));
        line.appendChild(document.createTextNode(b[1]));
        meta.appendChild(line);
      });
      dom.previewBody.appendChild(meta);
      if (entry.magic === "zip") {
        dom.previewBody.appendChild(el("p", null, "Este archivo se abrió de forma recursiva: sus clases, recursos y endpoints aparecen en el árbol y en los hallazgos con la ruta anidada."));
      }
      return;
    }

    if (entry.size > 512 * 1024) {
      dom.previewBody.appendChild(el("p", null, "Archivo demasiado grande para previsualizar."));
      return;
    }

    var cached = state.textFiles[entry.name];
    if (cached != null) {
      dom.previewBody.appendChild(buildPre(cached));
      return;
    }

    try {
      var buffer = await state.file.arrayBuffer();
      var bytes = (entry.locator && entry.locator.length)
        ? await GX.zip.readNestedEntry(buffer, entry, GX.zip.MAX_TOTAL_BYTES)
        : await GX.zip.readEntry(buffer, entry, GX.zip.MAX_TOTAL_BYTES);
      var text = GX.zip.textOf(bytes);
      state.textFiles[entry.name] = text;
      dom.previewBody.appendChild(buildPre(text));
    } catch (e) {
      dom.previewBody.appendChild(el("p", null, "No se pudo leer esta entrada: " + (e && e.message ? e.message : e)));
    }
  }

  function buildPre(text) {
    var pre = document.createElement("pre");
    var max = 20000;
    pre.textContent = text.length > max ? text.slice(0, max) + "\n\n… (vista truncada)" : text;
    return pre;
  }

  /* ---------------- export / copy ---------------- */
  function buildReport() {
    var r = state.report;
    if (!r) return null;
    var stats = r.stats || {};
    return {
      tool: "GuardX",
      version: "2.1.0",
      generatedAt: new Date().toISOString(),
      file: {
        name: r.meta.fileName,
        size: r.meta.fileSize,
        sha256: r.meta.sha256 || null
      },
      summary: {
        score: r.score,
        level: r.level,
        engine: r.engine || "main",
        counts: r.counts,
        findings: r.findings.length,
        hosts: (r.endpoints || []).length,
        endpoints: r.endpointCount || 0,
        classes: stats.classCount || 0,
        methods: stats.methodCount || 0,
        instructions: stats.instructionCount || 0,
        dependencies: (r.dependencies || []).length,
        archives: stats.archiveCount || 1,
        nestedArchives: stats.nestedArchiveCount || 0,
        capabilities: (r.capabilities || []).length,
        durationMs: stats.durationMs || 0
      },
      metadata: r.meta,
      coverage: r.coverage,
      archives: r.archives,
      nestedArchives: r.nestedArchives,
      stats: stats,
      obfuscation: r.obfuscation,
      capabilities: r.capabilities,
      dependencies: r.dependencies,
      endpoints: r.endpoints,
      findings: r.findings,
      urls: r.urls,
      entries: state.entries.map(function (e) {
        return {
          name: e.name,
          innerName: e.innerName,
          archive: e.archive || null,
          depth: e.depth || 0,
          size: e.size,
          method: e.method,
          magic: e.magic || null,
          encrypted: !!e.encrypted,
          crc32: "0x" + (e.crc >>> 0).toString(16)
        };
      })
    };
  }

  function exportJson() {
    var report = buildReport();
    if (!report) return;
    var blob = new Blob([JSON.stringify(report, null, 2)], { type: "application/json" });
    var url = URL.createObjectURL(blob);
    var a = document.createElement("a");
    var safeName = (report.file.name || "archivo").replace(/[^a-z0-9._-]+/gi, "_");
    a.href = url;
    a.download = "guardx-report-" + safeName + ".json";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(function () { URL.revokeObjectURL(url); }, 1500);
    toast("Informe JSON descargado.");
  }

  async function copySummary() {
    var report = buildReport();
    if (!report) return;
    var summary = report.summary;
    var lines = [
      "GuardX · informe de seguridad",
      "Archivo: " + report.file.name + " (" + formatBytes(report.file.size) + ")",
      "SHA-256: " + (report.file.sha256 || "no disponible"),
      "Puntuación: " + summary.score + "/100 · " + (LEVELS[report.level] || {}).label,
      "Hallazgos: " + summary.findings + " (" + summary.counts.critical + " críticos, " + summary.counts.high + " altos, " + summary.counts.medium + " medios, " + summary.counts.low + " bajos, " + summary.counts.info + " info)",
      "Análisis: " + summary.classes + " clases · " + summary.methods + " métodos · " + summary.instructions + " instrucciones",
      "Contenedores: " + summary.archives + " archivos ZIP · " + summary.nestedArchives + " anidados",
      "Red: " + summary.hosts + " hosts · " + summary.endpoints + " endpoints",
      ""
    ];
    report.findings.slice(0, 8).forEach(function (f) {
      var where = f.class ? " — " + f.class + (f.method ? "#" + f.method : "") : (f.source ? " — " + f.source : "");
      lines.push("- [" + f.severity.toUpperCase() + "] " + f.title + where);
    });
    if (report.endpoints && report.endpoints.length) {
      lines.push("");
      lines.push("Hosts externos:");
      report.endpoints.slice(0, 6).forEach(function (h) {
        lines.push("- " + h.host + " · " + h.count + " endpoint(s) · " + riskLabel(h.risk));
      });
    }
    var text = lines.join("\n");
    try {
      await navigator.clipboard.writeText(text);
      toast("Resumen copiado al portapapeles.");
    } catch (e) {
      var ta = document.createElement("textarea");
      ta.value = text;
      document.body.appendChild(ta);
      ta.select();
      try { document.execCommand("copy"); toast("Resumen copiado."); }
      catch (err) { toast("No se pudo copiar el resumen.", true); }
      document.body.removeChild(ta);
    }
  }

  /* ---------------- errors / reset ---------------- */
  function showError(title, text) {
    dom.errorTitle.textContent = title;
    dom.errorText.textContent = text || "";
    dom.error.classList.add("is-visible");
  }
  function hideError() {
    dom.error.classList.remove("is-visible");
  }

  function resetScan() {
    state.report = null;
    state.entries = [];
    state.classes = [];
    state.textFiles = {};
    state.classMap = null;
    state.hash = null;
    state.query = "";
    state.activeSeverity = "all";
    dom.search.value = "";
    dom.chips.forEach(function (c) { c.classList.toggle("is-active", c.getAttribute("data-sev") === "all"); });
    dom.results.classList.remove("is-visible");
    dom.progress.classList.remove("is-visible");
    hideError();
    dom.fileInput.value = "";
    dom.findingsList.innerHTML = "";
    if (dom.endpointsList) dom.endpointsList.innerHTML = "";
    if (dom.endpointSummary) dom.endpointSummary.textContent = "";
    if (dom.endpointsCount) dom.endpointsCount.textContent = "0";
    document.getElementById("scanner").scrollIntoView({ behavior: "smooth", block: "start" });
  }

  /* ---------------- wiring ---------------- */
  function wire() {
    dom.btnChoose.addEventListener("click", function () { dom.fileInput.click(); });
    dom.dropzone.addEventListener("click", function (ev) {
      if (ev.target === dom.fileInput) return;
      dom.fileInput.click();
    });
    dom.dropzone.addEventListener("keydown", function (ev) {
      if (ev.key === "Enter" || ev.key === " " || ev.key === "Spacebar") {
        ev.preventDefault();
        dom.fileInput.click();
      }
    });
    dom.fileInput.addEventListener("change", function () {
      var file = dom.fileInput.files && dom.fileInput.files[0];
      if (file) handleFile(file);
    });

    ["dragenter", "dragover"].forEach(function (type) {
      dom.dropzone.addEventListener(type, function (ev) {
        ev.preventDefault();
        ev.stopPropagation();
        if (!state.scanning) dom.dropzone.classList.add("is-drag");
      });
    });
    ["dragleave", "dragend"].forEach(function (type) {
      dom.dropzone.addEventListener(type, function (ev) {
        ev.preventDefault();
        dom.dropzone.classList.remove("is-drag");
      });
    });
    dom.dropzone.addEventListener("drop", function (ev) {
      ev.preventDefault();
      ev.stopPropagation();
      dom.dropzone.classList.remove("is-drag");
      var file = ev.dataTransfer && ev.dataTransfer.files && ev.dataTransfer.files[0];
      if (file) handleFile(file);
    });
    ["dragover", "drop"].forEach(function (type) {
      global.addEventListener(type, function (ev) { ev.preventDefault(); });
    });

    dom.btnDemo.addEventListener("click", function () {
      if (state.scanning) return;
      try {
        var bytes = GX.demo.build();
        var file = new File([bytes], "GuardX-Demo.jar", { type: "application/java-archive" });
        handleFile(file);
      } catch (e) {
        showError("No se pudo generar la muestra", e && e.message ? e.message : String(e));
      }
    });

    dom.chips.forEach(function (chip) {
      chip.addEventListener("click", function () {
        state.activeSeverity = chip.getAttribute("data-sev");
        dom.chips.forEach(function (c) { c.classList.toggle("is-active", c === chip); });
        renderFilteredFindings();
      });
    });

    dom.search.addEventListener("input", function () {
      state.query = dom.search.value;
      renderFilteredFindings();
    });

    dom.btnExport.addEventListener("click", exportJson);
    dom.btnCopy.addEventListener("click", copySummary);
    dom.btnReset.addEventListener("click", resetScan);
  }

  function init() {
    cacheDom();
    if (!dom.dropzone) return;
    initTheme();
    initTopbar();
    wire();
    // broad detection disabled: only supported formats
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }

  GX.app = {
    state: state,
    handleFile: handleFile,
    exportJson: exportJson
  };
})(window);
