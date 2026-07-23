# DOM event flow for interactivity — how a handler actually reaches an element

*Taught: 2026-07-23 · Source: `ui-timer` branch, `src/components/TimerDial.jsx` (working-tree edits) · Patterns: capture→target→bubble propagation · pointer capture · lift-handler-to-the-owning-layer*

## The problem
You added `onMouseUp` handlers to the clock hands in `<TimerDial>` and nothing fired.
The goal was: interacting with a hand runs a function (e.g. cycle which hand is "active").
The edits looked reasonable but three separate parts of the DOM/React event model
were each enough on their own to swallow the handler. This lesson is about *reading*
that model so you can diagnose "my handler didn't run" without guessing.

## How it works

### The three reasons the handler never ran, grounded in the file

**(a) A prop you don't destructure is dropped, not forwarded.**
`Hand` reads only `{ hand, length, width, colorClass, active, animate }`
([TimerDial.jsx:49](../../src/components/TimerDial.jsx#L49)). Writing
`<Hand onMouseUp={...}>` ([lines 185–201](../../src/components/TimerDial.jsx#L185))
puts `onMouseUp` into `Hand`'s props object — and `Hand` never reads it, so it
evaporates. A React component is a *function*: it renders whatever DOM it renders,
and unread props do **not** get spread onto that DOM automatically (that only happens
if you write `<g {...rest}>`). The only handler that reached a real DOM node was the
literal one hardcoded on the `<g>` at [line 63](../../src/components/TimerDial.jsx#L63).

**(b) Events travel up, never down — and pointer capture moves the target.**
A browser event is delivered in three phases: **capture** (root → down to the target),
**target**, then **bubble** (target → up to the root). React listens in the bubble
phase by default. Crucially, a handler on an element only runs if that element is the
event's *target or one of its ancestors*. The `<g>` is a **child** of the `<svg>`, so
an event whose target is the svg never visits the `<g>`.

That is exactly what pointer capture forces. The svg calls
`e.currentTarget.setPointerCapture(e.pointerId)` on pointer-down
([TimerDial.jsx:119](../../src/components/TimerDial.jsx#L119)). After that call, the
browser retargets **every** subsequent pointer event for that pointer — moves and the
release — to the svg, no matter what's visually under the cursor. So the release's
target is the svg; the `<g>` is downstream of it and never sees it. (Capture is there
on purpose: it's what lets a drag keep tracking when your finger slides off the thin
hand or even outside the svg.)

**(c) Mouse events and pointer events are different streams.**
The face's whole pipeline is `onPointerDown/Move/Up`
([TimerDial.jsx:148–151](../../src/components/TimerDial.jsx#L148)). `onMouseUp` belongs
to the legacy *mouse* event stream. Browsers synthesize "compatibility" mouse events
from a pointer, but while a pointer is captured they suppress/retarget those, and on a
touchscreen there is no mouse stream at all. Mixing `onPointer*` on the parent with
`onMouseUp` on the child is inherently flaky.

Also note the dead helper `nextActiveHand`
([TimerDial.jsx:51–57](../../src/components/TimerDial.jsx#L51)): it calls
`setActiveHand`, which is defined in `TimerDial`'s scope
([line 89](../../src/components/TimerDial.jsx#L89)), not inside `Hand`, and it assigns
`next_index` with no `let`/`const` — a `ReferenceError` under ES-module strict mode
(all Vite modules are strict). It is never called.

### Where interactivity *does* live today
State lives in the parent `TimerDial`: `hands`, `activeHand`, `dragging`
([lines 88–90](../../src/components/TimerDial.jsx#L88)). One unified pointer pipeline on
the svg — `onPointerDown` → `setFromPointer` → `applyHands`
([lines 107–129](../../src/components/TimerDial.jsx#L107)) — converts a screen point to
a clock angle (`xyToClockAngle`) to a snapped hand value (`clockAngleToValue`) and
pushes it up via `onChange`. `Hand` is a **pure presentational** component: it takes a
value, rotates a `<line>`, and draws a knob. That division is why the fix belongs in
the parent, not the hand.

### The fix that fits this architecture
Since capture guarantees the svg is the target for the whole gesture, do hand-selection
*there*, not per-`<g>`. Inside `onPointerDown` (before/instead of `setFromPointer`),
convert the point to a value for each hand and pick the nearest hand, then
`setActiveHand(thatHand)`. No prop forwarding, no mouse/pointer mixing, no fighting
capture — it rides the pipeline that already works. (If you truly wanted a per-hand
DOM handler, you'd have to forward it in `Hand` onto the `<g>` *and* stop the svg from
capturing for that gesture — which would break drag. Not worth it here.)

## Dependencies, and what each is doing for you
- **Pointer Events API** (browser platform: `onPointerDown/Move/Up`, `setPointerCapture`)
  — one input model that unifies mouse, touch, and pen, plus capture so a drag survives
  the cursor leaving the element. Without it: separate `mousedown/mousemove/mouseup` +
  `touchstart/touchmove/touchend` handlers, a manual `document`-level move/up listener to
  emulate capture, and your own touch/mouse de-duplication.
- **React synthetic events** (library) — React wraps native events, delegates them at a
  root listener, and normalizes them cross-browser; `onMouseUp={fn}` on JSX registers into
  that system. Without it: `addEventListener`/`removeEventListener` in an effect, wired and
  torn down by hand on every render.
- **SVG DOM** (platform) — `<g>`, `<line>`, `<circle>` are real, event-targetable DOM nodes,
  so the same capture/bubble rules as HTML apply. Without it: `<canvas>`, where there are no
  child nodes to click and you hit-test coordinates against your own geometry yourself.

## Pattern: capture → target → bubble propagation
**Also known as:** event bubbling / event propagation; the "event flow" (DOM Level 3 Events).
**Problem it solves:** deciding *which* handlers run, and in what order, when one event
happens inside nested elements.
**The recipe:**
1. The event has one **target**: the deepest element the event occurred on.
2. It runs **capture-phase** listeners from the root down to the target.
3. It runs **target-phase** listeners on the target.
4. It **bubbles** back up, running bubble-phase listeners on each ancestor.
5. A handler runs **only** if its element is the target or an ancestor of it — never a
   sibling and never a descendant.
6. `stopPropagation()` halts the remaining walk; `preventDefault()` cancels the browser's
   default action but does **not** stop propagation.
**Here:** the svg's `onPointerDown` fires because the pointer's target (a hand `<line>` or
the face) is a descendant of the svg, so the event bubbles up to it
([TimerDial.jsx:148](../../src/components/TimerDial.jsx#L148)). A handler on the child `<g>`
would only fire if the `<g>` were the target or an ancestor — which capture prevents.
**Reach for it again when:** you want one handler on a container to serve many children
(event delegation), or you're asking "why did/didn't this nested handler run?".
**Not when:** you need to stop a specific child's event from reaching the container — then
`stopPropagation()` on the child, but know it also blocks delegation above it.

## Pattern: pointer capture
**Also known as:** pointer lock-on / drag capture (distinct from Pointer *Lock*, which hides
the cursor — different API).
**Problem it solves:** keeping a drag glued to one element after the pointer moves off it (or
off the page), without global document listeners.
**The recipe:**
1. On pointer-down, call `element.setPointerCapture(e.pointerId)`.
2. Until release, **all** events for that pointer target that element, wherever the pointer is.
3. Handle move/up on the capturing element; capture auto-releases on up, or call
   `releasePointerCapture(id)`.
4. Consequence: descendant elements will **not** receive their own pointer events during the
   capture — the capturing element owns the gesture.
**Here:** `setPointerCapture` at [line 119](../../src/components/TimerDial.jsx#L119),
`releasePointerCapture` in `endDrag` at [line 128](../../src/components/TimerDial.jsx#L128).
Step 4 is precisely why the per-hand `onMouseUp` couldn't fire.
**Reach for it again when:** sliders, dials, drag-resize, canvas painting — anything where the
cursor legitimately leaves the target mid-gesture. **Not when:** a plain click/tap — capture
adds nothing and can swallow child handlers you wanted.

## Pattern: lift the handler to the owning layer
**Also known as:** state/handlers live at the owner; "lifting state up"; single source of truth.
**Problem it solves:** where to put an interaction when the visual element and the state it
mutates live in different components.
**The recipe:**
1. Find where the state being changed is declared (the owner).
2. Put the handler that mutates it in that owner, not in the leaf that was clicked.
3. Give leaves data + minimal callbacks; keep them presentational.
4. If the leaf must originate the event, pass a callback prop down and have the leaf *call it*
   — but only if the event can actually reach the leaf (see propagation + capture above).
**Here:** `activeHand`/`hands` and their setters live in `TimerDial`
([lines 88–90](../../src/components/TimerDial.jsx#L88)); `Hand` is presentational. The
selection logic therefore belongs in the parent's pointer pipeline, keyed off the target the
svg already receives — not in `Hand`.
**Reach for it again when:** a child needs to change parent state, or two children need to stay
in sync. **Not when:** the state is genuinely local to the leaf (e.g. a hover flag) — keep it
there.

## Do it yourself next time
When a handler "doesn't fire," ask in this order:
1. **Is it even on a DOM node?** If it's a prop on a *component*, does that component
   destructure it and put it on real DOM (or `{...rest}`)? If not, it's dead.
2. **What is the event's target, and is my element the target or an ancestor?** A handler on a
   child of the target never runs.
3. **Is pointer capture (or `stopPropagation` upstream) redirecting the event?** Search the file
   for `setPointerCapture` and `stopPropagation`.
4. **Am I mixing event streams?** `onPointer*` vs `onMouse*` vs `onTouch*` — pick one family;
   prefer pointer events.
5. **Verify cheaply:** drop a `console.log` in the *parent's* existing handler first to confirm
   the event reaches that layer, then decide where the logic belongs.
First file to open here: [src/components/TimerDial.jsx](../../src/components/TimerDial.jsx) —
trace `onPointerDown` → `setFromPointer` → `applyHands`.

## Further reading
- MDN — *Event bubbling and capture*: https://developer.mozilla.org/en-US/docs/Learn/JavaScript/Building_blocks/Events#event_bubbling
- MDN — *Pointer events* & `setPointerCapture`: https://developer.mozilla.org/en-US/docs/Web/API/Pointer_events
- React — *Responding to Events* (synthetic events, propagation): https://react.dev/learn/responding-to-events
