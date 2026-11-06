# Technical notes: what changed and why

Each section: **the problem → why it happens → the fix → the idea to remember.**

## 1. Touch tracking

**Problem.** The old code did `e.touches.clientX`. That is `undefined`, so on phones the spotlight never moved.
**Why.** `event.touches` is a **TouchList**, an array-like list of every finger on the screen. `clientX` lives on each individual **Touch** in that list. (`targetTouches` = fingers that started on the same element; `changedTouches` = fingers that changed in this event.)
**Fix.** `const t = e.touches[0]; setPointer(t.clientX, t.clientY)`. Also added `touchend` / `touchcancel` (remove the spotlight when the last finger lifts), ignored touches that begin on the control panel (so dragging the slider doesn't steer the rain), ignored the *emulated* mouse events browsers fire right after a touch, and set CSS `touch-action: none` on the canvas so the browser doesn't steal the drag for scrolling (it would cancel the touch).
**Remember.** Read the docs for what an event property *is*. A wrong type is silent in JavaScript: you get `undefined`, not an error.

## 2. Resize

**Problem.** `columns` and `rainDrops` were calculated once. Widen the window and the new area stayed empty (I measured 0 rain pixels there); narrow it and the array had useless extra entries.
**Why.** Derived values (here: columns = width / font size) go stale unless something recomputes them when their input changes. Also, assigning `canvas.width` **clears the canvas and resets the context state** (font, colours, shadows).
**Fix.** One `resizeCanvas()` that resizes, repaints the background, re-sets the font, then grows or shrinks `rainDrops` while *keeping* existing drops. It is triggered by `resize` and `orientationchange`, coalesced with `requestAnimationFrame` (resize fires many times while dragging). `Math.ceil` instead of `floor` so the last partial column isn't left blank.
**Remember.** When a value is computed from something that can change, put the computation in a function you can call again.

## 3. Network status wording

**Problem.** "ONLINE / SECURE" was hard-coded for `navigator.onLine === true`.
**Why.** `navigator.onLine` only says the browser has *some* network connection. It cannot know the internet works, and "secure" is about HTTPS, a different question entirely. Showing "SECURE" was a false claim.
**Fix.** Shows `ONLINE` / `OFFLINE`, updated by the `online` / `offline` events, with a tooltip explaining the limits. The section is now titled "Browser-Reported Status" instead of "Hardware Telemetry", which it never was.
**Remember.** UI text is a promise. Only claim what the API actually guarantees.
**Related fix.** Battery: if `level` was unknown the old code displayed **100%** (invented data). It now shows `UNKNOWN`. Also `Math.floor(0.57 * 100)` is `56` because of floating-point error (`56.99999999999999`), so it uses `Math.round`. And the `getBattery()` promise had no `.catch()`, so a refusal left the panel stuck on "PENDING".

## 4. Web Audio performance

**Problem.** Every `mousemove` created a **new oscillator and gain node** (I counted 300 oscillators for 300 mouse moves). Mouse events can fire over 100 times a second, so that is a lot of short-lived objects, overlapping sounds that add up in volume, and garbage-collection work.
**Why.** Audio nodes are cheap to *change* but comparatively costly to *create and discard*. An oscillator also can't be restarted once stopped, which is why people often create new ones. But you don't have to start and stop one: you can keep one running and control its **volume** instead.
**Fix.** One oscillator + one gain node, created once inside the button's click handler (that's where browsers allow audio to start). Pointer movement only changes the oscillator's frequency and fades the gain up; after the pointer stops, the gain fades to 0. Updates are throttled to one per 30 ms. `setTargetAtTime` glides between values, which avoids clicks. Muting fades out and calls `audioContext.suspend()`, so the audio thread isn't running for nothing. Missing or blocked Web Audio shows `AUDIO N/A` instead of throwing.
**Remember.** Create expensive objects once, reuse them, and drive them with parameters.

## 5. Animation loop

**Problem.** `setInterval(draw, 110 - speed)` isn't synchronised with the screen, keeps running in hidden tabs, and could "tick" faster than the display can show (at speed 100 it asked for 100 steps/s on a 60 Hz screen). The slider also destroyed and recreated the timer on every input.
**Fix.** `requestAnimationFrame` loop that runs a step only when `110 - speed` ms have passed. I measured the step rate at four speeds: 9.5, 12.5, 25 steps/s match the old values exactly; at 100 it is capped at the display rate (60/s). So the look is unchanged. The slider now just updates a variable the loop reads.
**Drawing efficiency.** (a) Squared-distance comparison with an early horizontal reject, no `Math.sqrt`. (b) `fillStyle` and `shadowBlur` are only assigned when they actually change. (c) The font is set once after sizing, not every frame.
**A real bug found on the way.** Canvas shadows apply to *every* draw call, including the full-screen `fillRect` fade. If the last glyph drawn had a glow, the next frame's fade rectangle was drawn with a glow too, which could tint the background. The step now resets `shadowBlur` first.
**Remember.** Use `requestAnimationFrame` for drawing. Canvas state is "sticky": whatever you set stays set.

## 6. Unsupported APIs

Canvas 2D (message instead of a blank page), Web Audio (`AUDIO N/A`; wrapped in `try/catch`; handles `webkitAudioContext`), Battery API (missing, rejected), `matchMedia` (older Safari used `addListener`). The principle is **feature detection** ("does it exist?"), never browser sniffing ("is this Safari?"). I tested each by deliberately removing the API and checking for errors.

## 7 and 8. Controls and accessibility

- **Hidden panel was still focusable.** `opacity: 0; pointer-events: none` hides things visually but keyboard users could still Tab into invisible buttons. `visibility: hidden` removes it from tab order and screen readers; focus is moved to the remaining button.
- **Colour swatches had no text** (only a `title` tooltip, which touch screens never show): added `aria-label` and `aria-pressed`, plus a visible ring on the selected colour.
- **Slider label wasn't linked** to the input: `<label for>`. Its old name, "Data Streams Throttle", was also backwards (higher = faster), so it is now "Stream Speed".
- **Focus outline was removed** from the slider (`outline: none`): restored for everything via `:focus-visible`.
- **Mobile layout.** Fixed `330px` panel + `24px` margin overflowed 320px phones: now `min(330px, 100vw - 32px)` with scrolling if the screen is short. 9px button text → 11px. Targets ≥ 44px tall on touch screens. Hover effects only where hovering exists (`@media (hover: hover)`), so buttons don't stay "stuck" highlighted after a tap.
- **Theme colour.** JS used to set ~10 inline styles per colour change and missed some (the "show" button text and all hover colours stayed green). Now JS sets one CSS variable, `--theme`, and the stylesheet does the rest.
- **Reduced motion.** An always-moving page needs a way to stop (WCAG 2.2.2) and should respect the OS "reduce motion" setting: it starts paused with a still picture; the PLAY / PAUSE button works any time. The status heading changes to `[PAUSED]` instead of staying `[ACTIVE]`.
- **Contrast.** Small grey text was 3.7:1; now 7.0:1 (AA needs 4.5:1).
- **Semantics.** The panel title is now an `<h1>` (the page had no top-level heading) and no longer contains the buttons, which previously became part of the heading's name.
- **Fonts.** The Google Fonts links pointed at `googleapis.com` / `gstatic.com`; the real hosts are `fonts.googleapis.com` / `fonts.gstatic.com`, so the font never loaded.

## What I could not verify

Tested in headless Chromium with real input events (including touch via the DevTools protocol), not on physical phones, Safari or Firefox. I checked the audio signal graph (gain and frequency values, node counts, suspend/resume), but not what it *sounds* like. The peak volume (`TONE_GAIN = 0.02`) is a guess; adjust to taste. iOS-specific behaviour (silent switch, `interrupted` audio state) is handled from documentation, not tested.
