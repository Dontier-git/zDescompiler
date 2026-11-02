/* ============================================================
   GuardX · Scan worker
   Runs the shared pipeline off the main thread: recursive ZIP
   discovery, class parsing, package rules and bytecode analysis.
   Returns only serializable data (no functions, no DOM).
   ============================================================ */
/* The modules use `window` as their global; give them one. */
self.window = self;

importScripts("zip.js", "classfile.js", "rules.js", "analysis.js", "analysis-flow.js", "pipeline.js");

self.onmessage = async function (event) {
  var data = event.data || {};
  var buffer = data.buffer;
  var fileName = data.fileName || "archivo.jar";
  var fileSize = data.fileSize || (buffer ? buffer.byteLength : 0);
  var hash = data.hash || null;

  if (!buffer) {
    self.postMessage({ type: "error", message: "No se recibió el archivo." });
    return;
  }

  try {
    var result = await GX.pipeline.scan({
      buffer: buffer,
      fileName: fileName,
      fileSize: fileSize,
      hash: hash,
      engine: "worker",
      onProgress: function (pct, title, step, done) {
        self.postMessage({ type: "progress", pct: pct, title: title, step: step, done: !!done });
      }
    });

    self.postMessage({
      type: "done",
      report: result.report,
      entries: result.entries,
      textFiles: result.textFiles,
      classes: result.classes
    });
  } catch (err) {
    self.postMessage({
      type: "error",
      message: err && err.message ? err.message : String(err)
    });
  }
};
