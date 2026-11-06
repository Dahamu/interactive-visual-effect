(function () {
    'use strict';

    /* ======================================================================
       Configuration
       ====================================================================== */
    const ALPHABET = '0123456789ABCDEF//[]{}<>-+_*&^%$#@!X';
    const FONT_SIZE = 14;                 // px; also the width of one column and height of one row
    const SPOTLIGHT_RADIUS = 140;         // px around the pointer
    const BG_SOLID = '#030712';
    const FADE_INSTANT = 'rgba(3, 7, 18, 0.06)';   // each step paints this over the old frame
    const FADE_LONG = 'rgba(3, 7, 18, 0.015)';     // lower alpha = old frames linger longer
    const STATIC_FRAME_STEPS = 40;        // steps pre-rendered for the paused / reduced-motion picture

    // Audio: pitch follows the pointer's vertical position (see README)
    const FREQ_MIN = 150;                 // Hz at the top of the viewport
    const FREQ_MAX = 350;                 // Hz at the bottom of the viewport
    const TONE_GAIN = 0.02;               // peak volume (0..1), deliberately quiet
    const TONE_UPDATE_MS = 30;            // at most one audio update per 30 ms
    const TONE_HOLD_S = 0.1;              // keep sounding this long after the last movement

    /* ======================================================================
       DOM + canvas (with a graceful failure if 2D canvas is unavailable)
       ====================================================================== */
    const $ = (id) => document.getElementById(id);
    const canvas = $('matrixCanvas');
    const ctx = canvas && canvas.getContext ? canvas.getContext('2d') : null;

    if (!ctx) {
        const box = $('fallback');
        box.textContent = 'This browser cannot draw the effect: HTML5 Canvas 2D is not available.';
        box.hidden = false;
        $('controlPanel').hidden = true;
        $('showHUDButton').hidden = true;
        return;
    }

    const el = {
        panel: $('controlPanel'),
        showBtn: $('showHUDButton'),
        hideBtn: $('hideButton'),
        muteBtn: $('muteButton'),
        pauseBtn: $('pauseBtn'),
        trailBtn: $('trailToggleBtn'),
        slider: $('speedSlider'),
        runState: $('runState'),
        net: $('netStatus'),
        battery: $('batteryStatus'),
        swatches: Array.prototype.slice.call(document.querySelectorAll('[data-color]'))
    };

    /* ======================================================================
       State
       ====================================================================== */
    let themeColor = '#10b981';
    let speed = Number(el.slider.value);      // 5..100, higher = faster
    let longTrailMode = false;
    let paused = false;

    let columns = 0;                          // how many character columns fit across the canvas
    let rainDrops = [];                       // rainDrops[i] = current ROW of column i's leading glyph
    let sized = false;                        // has the canvas been sized at least once?

    const pointer = { x: null, y: null };     // null = no pointer / finger on the page
    let lastTouchTime = -Infinity;            // used to ignore emulated mouse events after a touch

    /* ======================================================================
       Sizing: runs on load AND on every resize
       ====================================================================== */
    let lastW = -1, lastH = -1;

    function randomRow() {
        return Math.floor(Math.random() * Math.ceil(canvas.height / FONT_SIZE));
    }

    function resizeCanvas() {
        const w = window.innerWidth;
        const h = window.innerHeight;
        if (w === lastW && h === lastH) return;          // nothing changed (e.g. duplicate events)
        lastW = w; lastH = h;

        // Assigning width/height clears the bitmap AND resets all context state
        // (font, fillStyle, shadows...), so everything is re-applied afterwards.
        canvas.width = w;
        canvas.height = h;
        ctx.fillStyle = BG_SOLID;
        ctx.fillRect(0, 0, w, h);
        ctx.font = FONT_SIZE + 'px monospace';

        // ceil: the last, partly visible column is drawn too (floor left a blank strip)
        const newColumns = Math.ceil(w / FONT_SIZE);
        if (newColumns < rainDrops.length) {
            rainDrops.length = newColumns;               // narrower: drop the extra columns
        } else {
            // wider: keep existing columns, add new ones.
            // On the very first run keep the original "everything starts at the top" look;
            // afterwards start new columns at random rows so no visible seam appears.
            for (let i = rainDrops.length; i < newColumns; i++) {
                rainDrops.push(sized ? randomRow() : 1);
            }
        }
        columns = newColumns;
        sized = true;

        if (paused) renderStaticFrame();                 // the clear above wiped the picture
    }

    let resizeQueued = false;
    function onResize() {                                // coalesce bursts of resize events into one
        if (resizeQueued) return;
        resizeQueued = true;
        requestAnimationFrame(function () { resizeQueued = false; resizeCanvas(); });
    }

    /* ======================================================================
       One animation step: fade the old frame, draw one glyph per column, advance
       ====================================================================== */
    function step() {
        const height = canvas.height;

        // Canvas shadows apply to EVERY draw call, including fillRect, so make sure a glow
        // left over from the previous step can't tint the whole-canvas fade below.
        ctx.shadowBlur = 0;
        ctx.fillStyle = longTrailMode ? FADE_LONG : FADE_INSTANT;
        ctx.fillRect(0, 0, canvas.width, height);

        const pointerActive = pointer.x !== null;
        const r2 = SPOTLIGHT_RADIUS * SPOTLIGHT_RADIUS;   // compare squared distances: no Math.sqrt
        const flicker = speed > 75;
        let currentFill = null;                           // avoid re-assigning an identical fillStyle
        let glowing = false;

        for (let i = 0; i < columns; i++) {
            const x = i * FONT_SIZE;
            const y = rainDrops[i] * FONT_SIZE;

            let near = false;
            if (pointerActive) {
                const dx = x - pointer.x;
                if (dx * dx < r2) {                       // cheap horizontal reject first
                    const dy = y - pointer.y;
                    near = dx * dx + dy * dy < r2;
                }
            }

            let color = themeColor;
            let visible = true;
            if (near) {
                if (flicker && Math.random() > 0.85) visible = false;   // spotlight "glitch" at high speed
                else color = '#ffffff';
            } else if (Math.random() > 0.98) {
                color = '#ffffff';                                       // occasional bright sparkle
            }

            if (visible) {
                if (near !== glowing) {                   // only touch shadow state when it changes
                    if (near) ctx.shadowColor = themeColor;
                    ctx.shadowBlur = near ? 20 : 0;
                    glowing = near;
                }
                if (color !== currentFill) { ctx.fillStyle = color; currentFill = color; }
                ctx.fillText(ALPHABET.charAt(Math.floor(Math.random() * ALPHABET.length)), x, y);
            }

            if (y > height && Math.random() > 0.975) rainDrops[i] = 0;
            rainDrops[i]++;
        }

        if (glowing) ctx.shadowBlur = 0;                  // leave the context in a clean state
    }

    /* ======================================================================
       Animation loop: requestAnimationFrame + fixed step interval
       ====================================================================== */
    // The slider sets a step interval of (110 - speed) ms, exactly as before. rAF drives the
    // timing, so drawing is synced to the display and stops in background tabs; a step runs
    // only when enough time has passed. Rates above the display refresh are capped by it.
    let rafId = 0;
    let lastStepTime = 0;

    function frame(now) {
        rafId = requestAnimationFrame(frame);
        const interval = 110 - speed;
        const elapsed = now - lastStepTime;
        if (elapsed >= interval) {
            lastStepTime = now - (elapsed % interval);    // keep the average rate accurate
            step();
        }
    }

    function startLoop() {
        if (rafId) return;
        lastStepTime = performance.now();
        rafId = requestAnimationFrame(frame);
    }

    function stopLoop() {
        cancelAnimationFrame(rafId);
        rafId = 0;
    }

    // A still picture for the paused / reduced-motion state.
    function renderStaticFrame() {
        ctx.shadowBlur = 0;
        ctx.fillStyle = BG_SOLID;
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        for (let i = 0; i < rainDrops.length; i++) rainDrops[i] = randomRow();
        for (let n = 0; n < STATIC_FRAME_STEPS; n++) step();
    }

    function applyPausedUI() {
        el.pauseBtn.textContent = paused ? 'PLAY ANIMATION' : 'PAUSE ANIMATION';
        el.runState.textContent = paused ? '[PAUSED]' : '[ACTIVE]';
    }

    function setPaused(value) {
        if (paused === value) return;
        paused = value;
        applyPausedUI();
        if (paused) stopLoop(); else startLoop();
    }

    // When paused nothing repaints on its own, so settings changes redraw the still frame.
    function refreshIfPaused() { if (paused) renderStaticFrame(); }

    /* ======================================================================
       Pointer input: mouse + Touch API
       ====================================================================== */
    function setPointer(x, y) {
        pointer.x = x;
        pointer.y = y;
        updateTone(y);
    }

    function clearPointer() { pointer.x = null; pointer.y = null; }

    window.addEventListener('mousemove', function (e) {
        // After a touch, browsers fire emulated mouse events; ignore them so they
        // don't re-place the spotlight where the finger just lifted.
        if (performance.now() - lastTouchTime < 800) return;
        setPointer(e.clientX, e.clientY);
    }, { passive: true });

    document.addEventListener('mouseout', function (e) {
        if (!e.relatedTarget) clearPointer();             // pointer left the browser window
    });

    function onTouch(e) {
        lastTouchTime = performance.now();
        // Touches that begin on the control panel belong to the controls (e.g. dragging the slider).
        if (e.target.closest && e.target.closest('.control-panel, .show-hud-btn')) return;
        // e.touches is a TouchList (array-like), NOT a single Touch: read its first entry.
        const t = e.touches[0];
        if (t) setPointer(t.clientX, t.clientY);
    }

    function onTouchEnd(e) {
        lastTouchTime = performance.now();
        if (e.touches.length === 0) clearPointer();       // last finger lifted
        resumeAudioIfNeeded();                            // touchend counts as a user gesture on iOS
    }

    window.addEventListener('touchstart', onTouch, { passive: true });
    window.addEventListener('touchmove', onTouch, { passive: true });
    window.addEventListener('touchend', onTouchEnd, { passive: true });
    window.addEventListener('touchcancel', onTouchEnd, { passive: true });

    /* ======================================================================
       Audio: ONE oscillator for the whole session
       ====================================================================== */
    const AudioCtor = window.AudioContext || window.webkitAudioContext;
    const audio = { ctx: null, osc: null, gain: null, enabled: false, lastUpdate: 0, supported: !!AudioCtor };

    function ensureAudio() {
        if (audio.ctx) return true;
        if (!audio.supported) return false;
        try {
            const ac = new AudioCtor();
            const osc = ac.createOscillator();
            const gain = ac.createGain();
            osc.type = 'sine';
            osc.frequency.value = FREQ_MIN;
            gain.gain.value = 0;                          // silent until the pointer moves
            osc.connect(gain);
            gain.connect(ac.destination);
            osc.start();
            audio.ctx = ac; audio.osc = osc; audio.gain = gain;
            return true;
        } catch (err) {
            console.warn('Web Audio could not be initialised:', err);
            audio.supported = false;
            return false;
        }
    }

    function resumeAudioIfNeeded() {
        if (audio.enabled && audio.ctx && audio.ctx.state !== 'running') {
            const p = audio.ctx.resume();
            if (p && p.catch) p.catch(function () {});
        }
    }

    function updateTone(clientY) {
        if (!audio.enabled || !audio.ctx || audio.ctx.state !== 'running') return;
        const now = performance.now();
        if (now - audio.lastUpdate < TONE_UPDATE_MS) return;       // throttle
        audio.lastUpdate = now;

        const t = audio.ctx.currentTime;
        const ratio = Math.min(1, Math.max(0, clientY / window.innerHeight));
        const freq = FREQ_MIN + ratio * (FREQ_MAX - FREQ_MIN);

        // setTargetAtTime glides smoothly instead of jumping, which avoids clicks.
        audio.osc.frequency.setTargetAtTime(freq, t, 0.03);
        const g = audio.gain.gain;
        g.cancelScheduledValues(t);                                 // replace the pending fade-out
        g.setTargetAtTime(TONE_GAIN, t, 0.02);                      // fade in
        g.setTargetAtTime(0, t + TONE_HOLD_S, 0.06);                // fade out if movement stops
    }

    function setAudioUnavailable(reason) {
        audio.enabled = false;
        el.muteBtn.textContent = 'AUDIO N/A';
        el.muteBtn.disabled = true;
        el.muteBtn.title = reason;
    }

    function setAudioEnabled(on) {
        if (on) {
            // Must run inside the click handler: autoplay policies only allow starting audio
            // from a user gesture.
            if (!ensureAudio()) { setAudioUnavailable('Web Audio API is not available in this browser'); return; }
            audio.enabled = true;
            el.muteBtn.textContent = 'AUDIO ON';
            const p = audio.ctx.resume();
            const verify = function () {
                if (audio.enabled && audio.ctx.state !== 'running') {   // blocked by the browser
                    audio.enabled = false;
                    el.muteBtn.textContent = 'AUDIO OFF';
                    el.muteBtn.title = 'The browser blocked audio; try tapping the button again';
                }
            };
            if (p && p.then) p.then(verify, verify); else verify();
        } else {
            audio.enabled = false;
            el.muteBtn.textContent = 'AUDIO OFF';
            if (audio.ctx) {
                const t = audio.ctx.currentTime;
                audio.gain.gain.cancelScheduledValues(t);
                audio.gain.gain.setTargetAtTime(0, t, 0.015);       // quick fade, no click
                setTimeout(function () {                            // then stop all audio processing
                    if (!audio.enabled && audio.ctx.state === 'running') audio.ctx.suspend();
                }, 150);
            }
        }
    }

    if (!audio.supported) setAudioUnavailable('Web Audio API is not available in this browser');
    el.muteBtn.addEventListener('click', function () { setAudioEnabled(!audio.enabled); });

    document.addEventListener('visibilitychange', function () {
        if (!audio.ctx) return;
        if (document.hidden) audio.ctx.suspend(); else resumeAudioIfNeeded();
    });

    /* ======================================================================
       Controls
       ====================================================================== */
    function setTheme(color) {
        themeColor = color;
        document.documentElement.style.setProperty('--theme', color);   // CSS does the rest
        el.swatches.forEach(function (b) {
            b.setAttribute('aria-pressed', String(b.getAttribute('data-color') === color));
        });
        refreshIfPaused();
    }
    el.swatches.forEach(function (b) {
        b.addEventListener('click', function () { setTheme(b.getAttribute('data-color')); });
    });

    el.slider.addEventListener('input', function () { speed = Number(el.slider.value); });  // loop reads it live

    el.trailBtn.addEventListener('click', function () {
        longTrailMode = !longTrailMode;
        el.trailBtn.textContent = longTrailMode ? 'TRAIL PROCESSING: DEEP FIELD' : 'TRAIL PROCESSING: INSTANT FADE';
        refreshIfPaused();
    });

    el.pauseBtn.addEventListener('click', function () { setPaused(!paused); });

    function setPanelVisible(visible) {
        el.panel.classList.toggle('hidden', !visible);
        el.showBtn.classList.toggle('hidden', visible);
        el.hideBtn.setAttribute('aria-expanded', String(visible));
        el.showBtn.setAttribute('aria-expanded', String(visible));
        // Hidden elements leave the tab order (visibility:hidden); move focus to the control that remains.
        (visible ? el.hideBtn : el.showBtn).focus({ preventScroll: true });
    }
    el.hideBtn.addEventListener('click', function () { setPanelVisible(false); });
    el.showBtn.addEventListener('click', function () { setPanelVisible(true); });

    /* ======================================================================
       Browser-reported status (network, battery)
       ====================================================================== */
    function updateNetworkStatus() {
        const online = navigator.onLine;
        if (typeof online !== 'boolean') { el.net.textContent = 'UNKNOWN'; return; }
        el.net.textContent = online ? 'ONLINE' : 'OFFLINE';
        el.net.classList.toggle('is-offline', !online);
        el.net.title = 'From navigator.onLine. "Online" only means the browser has a network connection; ' +
                       'it does not guarantee internet access, and says nothing about security.';
    }
    window.addEventListener('online', updateNetworkStatus);
    window.addEventListener('offline', updateNetworkStatus);
    updateNetworkStatus();

    function initBattery() {
        const unavailable = function (why) { el.battery.textContent = 'UNAVAILABLE'; el.battery.title = why; };
        if (!navigator.getBattery) {
            unavailable('Battery Status API is not supported here (Firefox and Safari do not implement it; it also needs HTTPS or localhost).');
            return;
        }
        navigator.getBattery().then(function (battery) {
            function render() {
                // Math.round, not floor: 0.57 * 100 is 56.99999999999999 in floating point.
                const pct = Number.isFinite(battery.level) ? Math.round(battery.level * 100) + '%' : 'UNKNOWN';
                el.battery.textContent = pct + (battery.charging ? ' (PLUGGED IN)' : ' (ON BATTERY)');
            }
            render();
            battery.addEventListener('levelchange', render);
            battery.addEventListener('chargingchange', render);
        }).catch(function () {
            unavailable('The browser refused access to battery information.');
        });
    }
    initBattery();

    /* ======================================================================
       Start-up
       ====================================================================== */
    window.addEventListener('resize', onResize);
    window.addEventListener('orientationchange', onResize);

    resizeCanvas();
    setTheme(themeColor);

    // Respect the OS "reduce motion" setting: start paused (with a still picture) and
    // pause if the setting is switched on while the page is open. The user can still press PLAY.
    const motionQuery = window.matchMedia ? window.matchMedia('(prefers-reduced-motion: reduce)') : null;
    if (motionQuery) {
        const onMotionChange = function (e) { setPaused(e.matches); if (e.matches) renderStaticFrame(); };
        if (motionQuery.addEventListener) motionQuery.addEventListener('change', onMotionChange);
        else if (motionQuery.addListener) motionQuery.addListener(onMotionChange);   // older Safari
    }

    if (motionQuery && motionQuery.matches) {
        paused = true;
        applyPausedUI();
        renderStaticFrame();
    } else {
        startLoop();
    }
})();
