/* =========================================================================
   Sakina — Face Expression Capture & Lock  (سكينة)
   -------------------------------------------------------------------------
   Fixes:
     1. Bar keeps jumping  -> predictions are SMOOTHED over a rolling window.
     2. Sad not detected   -> decision uses averaged probability + margin,
                              not a single noisy frame.
     3. Nothing is saved   -> once a stable reading is found the app LOCKS:
                              loop stops, camera pauses, frame + result are
                              held in memory for the whole session/analysis.
     4. Restart            -> only SakinaFace.restart() unlocks and allows a
                              new reading.

   Everything stays in the device. Nothing is uploaded or written to disk.
   ========================================================================= */

const SakinaFace = (() => {
  // ----------------------------- CONFIG ---------------------------------
  const CFG = {
    MODEL_URL:      "./model/",   // your Teachable Machine export folder
    FPS:            5,            // ~5 frames per second
    WINDOW:         15,           // rolling window (15 frames ≈ 3 seconds)
    MIN_CONF:       0.70,         // averaged confidence needed to lock
    MIN_MARGIN:     0.15,         // top must beat 2nd place by this much
    STABLE_FRAMES:  8,            // consecutive frames the winner must hold
    MAX_SCAN_MS:    15000,        // give up after 15s -> "uncertain"
    SIZE:           224,          // webcam square size
    FLIP:           true,         // front camera mirror
    // class names EXACTLY as in your Teachable Machine model
    CLASSES: { sad: "Sad", happy: "Happy", angry: "Angry" }
  };

  // ----------------------------- STATE ----------------------------------
  const STATE = { IDLE: "idle", SCANNING: "scanning", LOCKED: "locked" };

  let model = null;
  let webcam = null;
  let state = STATE.IDLE;
  let rafId = null;
  let lastTick = 0;
  let scanStart = 0;

  let buffer = [];        // rolling window of raw prediction arrays
  let stableCount = 0;
  let stableLabel = null;

  // THE TEMPORARY RESULT — survives until restart()
  let capture = null;
  /* capture = {
       label, labelAr, confidence, scores, imageDataUrl, timestamp, uncertain
     } */

  const listeners = { tick: [], lock: [], restart: [], error: [] };
  const emit = (ev, data) => listeners[ev].forEach(fn => { try { fn(data); } catch (e) { console.error(e); } });

  const AR = { Sad: "حزن", Happy: "سعادة", Angry: "غضب" };

  // --------------------------- INIT / CAMERA ----------------------------
  async function init(videoContainerEl) {
    if (model) return;
    model  = await tmImage.load(CFG.MODEL_URL + "model.json",
                                CFG.MODEL_URL + "metadata.json");
    webcam = new tmImage.Webcam(CFG.SIZE, CFG.SIZE, CFG.FLIP);
    await webcam.setup({ facingMode: "user" });
    if (videoContainerEl) videoContainerEl.appendChild(webcam.canvas);
  }

  // ---------------------------- SCANNING --------------------------------
  async function start() {
    if (state === STATE.LOCKED) return;      // must restart() first
    if (!model) throw new Error("call SakinaFace.init() first");

    resetBuffers();
    state     = STATE.SCANNING;
    scanStart = performance.now();
    lastTick  = 0;
    await webcam.play();
    rafId = requestAnimationFrame(loop);
  }

  function loop(now) {
    if (state !== STATE.SCANNING) return;
    rafId = requestAnimationFrame(loop);

    // throttle to CFG.FPS
    if (now - lastTick < 1000 / CFG.FPS) return;
    lastTick = now;

    webcam.update();
    predictOnce();
  }

  async function predictOnce() {
    const raw = await model.predict(webcam.canvas);   // [{className, probability}]

    // push into rolling window
    buffer.push(raw);
    if (buffer.length > CFG.WINDOW) buffer.shift();

    // ---- SMOOTHING: average each class across the window -----------------
    const avg = {};
    raw.forEach(p => { avg[p.className] = 0; });
    buffer.forEach(frame =>
      frame.forEach(p => { avg[p.className] += p.probability / buffer.length; })
    );

    const ranked = Object.entries(avg)
      .map(([label, score]) => ({ label, score }))
      .sort((a, b) => b.score - a.score);

    const top = ranked[0], second = ranked[1] || { score: 0 };
    const margin = top.score - second.score;

    // UI reads the SMOOTHED values -> the bar stops jittering
    emit("tick", {
      ranked,
      top: top.label,
      confidence: top.score,
      margin,
      progress: Math.min(1, stableCount / CFG.STABLE_FRAMES),
      warmingUp: buffer.length < CFG.WINDOW
    });

    if (buffer.length < CFG.WINDOW) return;   // not enough history yet

    // ---- STABILITY CHECK -------------------------------------------------
    const good = top.score >= CFG.MIN_CONF && margin >= CFG.MIN_MARGIN;

    if (good && top.label === stableLabel) {
      stableCount++;
    } else if (good) {
      stableLabel = top.label;
      stableCount = 1;
    } else {
      stableCount = Math.max(0, stableCount - 1);   // decay, don't hard reset
    }

    if (stableCount >= CFG.STABLE_FRAMES) {
      lock(top.label, top.score, avg, false);
      return;
    }

    // ---- TIMEOUT ---------------------------------------------------------
    if (performance.now() - scanStart > CFG.MAX_SCAN_MS) {
      lock(top.label, top.score, avg, true);       // best guess, flagged
    }
  }

  // ------------------------------ LOCK ----------------------------------
  function lock(label, confidence, scores, uncertain) {
    state = STATE.LOCKED;
    cancelAnimationFrame(rafId);
    rafId = null;

    // freeze the exact frame that produced the reading (in memory only)
    let imageDataUrl = null;
    try { imageDataUrl = webcam.canvas.toDataURL("image/jpeg", 0.8); } catch (e) {}

    webcam.pause();                 // camera stops — no more moving bar

    capture = {
      label,
      labelAr: AR[label] || label,
      confidence,
      scores,
      imageDataUrl,                 // kept only for this session
      timestamp: Date.now(),
      uncertain
    };

    emit("lock", capture);
  }

  // ----------------------------- RESTART --------------------------------
  async function restart() {
    capture = null;                 // discard the frozen frame
    resetBuffers();
    state = STATE.IDLE;
    emit("restart", null);
    await start();
  }

  function resetBuffers() {
    buffer = [];
    stableCount = 0;
    stableLabel = null;
  }

  // ------------------------------ API -----------------------------------
  function stop() {
    if (rafId) cancelAnimationFrame(rafId);
    rafId = null;
    state = STATE.IDLE;
    if (webcam) webcam.pause();
  }

  function dispose() {                     // full teardown, releases camera
    stop();
    if (webcam) webcam.stop();
    capture = null;
  }

  return {
    init, start, restart, stop, dispose,
    on: (ev, fn) => { if (listeners[ev]) listeners[ev].push(fn); },
    get result()  { return capture; },     // read anywhere during analysis
    get state()   { return state; },
    get isLocked(){ return state === STATE.LOCKED; },
    CFG
  };
})();
