// The tag cloud turns like a globe. Added 2026-09-22 with the cloud itself
// (src/components/TagCloud.astro) and rewritten the same evening, when the owner named the
// reference: telo.by runs the WordPress plugin html5-cumulus, which is jQuery TagCanvas - a
// sphere of tags that spins, takes its speed from where the pointer is, and draws an outline box
// around the tag under the cursor. He asked for that behaviour without the box and without the
// colours, which is what this file does.
//
// WHY NOT TAGCANVAS ITSELF
//
// It needs jQuery and it paints into a canvas. The canvas is the part that matters: on the
// reference page every tag link sits in a list marked display:none beside it, so the picture a
// visitor sees carries no links at all, and the library has to reimplement hit testing, focus and
// the pointer cursor on top of a bitmap. Here the words stay anchors. The script moves them; it
// never draws them, so a crawler, a screen reader, a keyboard and the browser's own find-in-page
// all keep working, and the cloud is styled in CSS like the rest of the site.
//
// HOW IT WORKS
//
// The words are placed on a sphere once, by the spiral that spreads points evenly over one
// (phi from acos, theta from the golden-section step): an even spread matters because a naive
// latitude and longitude grid crowds the poles, which is where a cloud looks bald. Every frame
// the sphere is turned by two angles, each point is rotated and then projected onto the screen,
// and the word is moved with one transform, scaled and faded by how far away it now is. Nothing
// is measured during the loop except on resize, so a frame costs arithmetic and one style write
// per word.
//
// The speed follows the pointer the way the reference does: the further the pointer is from the
// middle of the block, the faster the sphere turns, and the direction is the direction of the
// pointer. With no pointer on it, it drifts slowly on its own instead of stopping, which is what
// makes the block read as alive rather than as broken.
//
// WHAT STAYS IN CSS
//
// The word under the pointer grows and the others fall back. That is a hover rule on the anchor,
// while this file transforms the span around it, so the two compose without either having to know
// about the other - see the note beside those rules in the component.
//
// WHEN IT DOES NOT RUN
//
// A visitor who asked for less motion never gets the sphere: the words stay in the wrapping row
// they are rendered as, which is also what a visitor without JavaScript sees. The row is the
// markup; the sphere is a class this script adds. The block itself is display:none on one side of
// 640px - it and the home page's round menu links trade places there - so the loop is stopped
// while the media query says so, rather than turning a sphere nobody can see. Which side that is
// changed on the evening of 2026-09-22: the cloud was the wide half and is the narrow one now,
// below 640px, at the owner's word. The query a few lines down is the only place that decides it.
//
// DRAGGING AND THE NARROWEST SCREENS (2026-09-28)
//
// The colleague's review, taken up by the owner. On a phone - the only place the cloud is shown -
// there is no pointer to steer with: a finger on the cloud used to scroll the page and the sphere
// took no notice. Now a finger (or a mouse button held down) grabs the sphere and turns it in any
// direction, the word under the finger following it; letting go leaves it spinning the way it was
// thrown, and it eases back into the idle drift. A finger held still stops it, so a word can be
// waited for and tapped. A tap still opens the tag, a drag never does. The mouse steering above
// stays for a mouse that is only hovering.
//
// On the narrowest screens (a 280px phone) the widest word left no room for even the smallest
// sphere, and the words hung past the edge of the screen. The whole globe now shrinks there, words
// and radius together, until it fits (`fit` below). And the words are measured again once the web
// fonts have arrived, since they are drawn in a fallback font until then and measured too narrow.
const cloud = document.querySelector<HTMLElement>(".tag-cloud");
const sky = cloud?.querySelector<HTMLElement>(".tag-cloud__sky");
const words = sky
  ? Array.from(sky.querySelectorAll<HTMLElement>(".tag-cloud__word"))
  : [];

// 640px is Tailwind's sm, which is where Header.astro swaps its menu for a hamburger. It is
// written out here because a script cannot read a Tailwind breakpoint; if that rule moves, this
// number moves with it.
//
// The test was (min-width: 640px) until the owner reversed the pair on the evening of 2026-09-22:
// the cloud is the narrow-screen half now and the row of round menu links is the wide one. 639.98
// rather than 639 is the usual complement of a min-width query - a viewport can be 639.5px wide on
// a scaled display, and neither query may claim it.
const cloudShown = window.matchMedia("(max-width: 639.98px)");
const stillPlease = window.matchMedia("(prefers-reduced-motion: reduce)");

if (cloud && sky && words.length > 0) {
  /** A point on the unit sphere, and the numbers that make one word breathe. */
  type Placed = {
    node: HTMLElement;
    x: number;
    y: number;
    z: number;
    drift: number;
    breath: number;
    phase: number;
  };

  const number = (
    node: HTMLElement,
    name: string,
    fallback: number,
  ): number => {
    const raw = Number.parseFloat(node.dataset[name] ?? "");
    return Number.isFinite(raw) ? raw : fallback;
  };

  // The even spread. phi walks the sphere from pole to pole in equal steps of height, which is
  // what keeps the density constant (the surface of a sphere between two heights depends only on
  // the distance between them), and theta advances by an irrational fraction of a turn so that no
  // two rings ever line up into a seam.
  const placed: Placed[] = words.map((node, index) => {
    const phi = Math.acos(-1 + (2 * index + 1) / words.length);
    const theta = Math.sqrt(words.length * Math.PI) * phi;
    return {
      node,
      x: Math.cos(theta) * Math.sin(phi),
      y: Math.sin(theta) * Math.sin(phi),
      z: Math.cos(phi),
      drift: number(node, "drift", 4),
      breath: number(node, "breath", 8),
      phase: number(node, "phase", 0),
    };
  });

  // How far the sphere reaches, in pixels, and where its middle is. Measured on entry and on
  // resize only: reading it in the loop would force a layout every frame.
  let radius = 0;
  // Added 2026-09-28: how much every word is shrunk so that the sphere fits a screen too narrow
  // for its smallest size; 1 everywhere else (see the end of measure()).
  let fit = 1;

  const measure = () => {
    const box = cloud.getBoundingClientRect();
    // A third of the shorter side. The words are wide and stand at the equator at their widest,
    // so a larger sphere pushes the longest of them past the edge of the block.
    const wanted = Math.min(box.width, box.height) * 0.36;

    // And no wider than the longest word allows. Added on the evening of 2026-09-22, when the
    // owner moved the cloud to the narrow half of the breakpoint: on a 390px phone the block is
    // about 358px wide, "Геопатогенные Зоны" is some 150px of it, and a sphere sized on height
    // alone hangs that word over the edge. `main` carries overflow-x-auto below 640px, so the
    // overhang would not be clipped - it would give the whole page a horizontal scrollbar.
    //
    // 1.15 is how far from the middle a word can travel: at the sides of the sphere the depth
    // factor is about 1, and a little more where the word is both to the side and towards the
    // viewer. offsetWidth is the layout width and ignores the transform this script writes, which
    // is what makes it the right number to reserve room with.
    let widest = 0;
    for (const word of placed) widest = Math.max(widest, word.node.offsetWidth);
    const room = (box.width - widest) / 2 / 1.15;

    // The floor keeps a sphere on a very narrow screen rather than collapsing it into a knot of
    // overlapping words; below it the words simply crowd, which is what a tag cloud does anyway.
    // radius = Math.max(60, Math.min(wanted, room));
    //
    // Changed 2026-09-28 after the colleague saw words past the edge of the smallest phones: the
    // line above held the floor even where the floor itself did not fit, so on a 280px screen the
    // widest word overshot the edge by dozens of pixels. Where the room is at least the floor
    // nothing changes. Below it the globe is scaled down as a whole - the radius and every word by
    // the same factor, `fit` - to the largest size at which a floor-sized sphere with the widest
    // word at its side still fits the block.
    const floor = 60;
    const natural = Math.min(wanted, room);
    if (natural >= floor) {
      radius = natural;
      fit = 1;
    } else {
      fit = Math.min(1, box.width / 2 / (1.15 * floor + widest / 2));
      radius = floor * fit;
    }
  };

  // The two angles of the sphere and the speed each is turning at. The idle speed is what the
  // cloud falls back to when the pointer is elsewhere: slow enough to read a word while it moves.
  let angleX = 0.35;
  let angleY = 0;
  let speedX = 0;
  let speedY = 0.0016;
  const idleY = 0.0016;
  const fastest = 0.02;

  let pointer: { x: number; y: number } | null = null;
  let frame = 0;
  let last = 0;

  // Added 2026-09-28 (the header, "Dragging"): the finger or the mouse button currently holding
  // the sphere, where it was last seen, and how far it has travelled. Below `grab` pixels it is
  // still a tap and turns nothing, so a tap on a word opens the word.
  const grab = 6;
  let drag: {
    id: number;
    x: number;
    y: number;
    t: number;
    moved: number;
  } | null = null;
  // The turn per frame the drag was making when it last moved, handed to the speeds on release.
  let flingX = 0;
  let flingY = 0;
  // A click that ends a drag is not a click on a word: it is swallowed until this moment.
  let swallowUntil = 0;
  const flingMost = fastest * 2;
  const clampFling = (value: number): number =>
    Math.max(-flingMost, Math.min(flingMost, value));

  const draw = (now: number) => {
    frame = requestAnimationFrame(draw);

    // Frame time, clamped: a tab that was in the background for a minute would otherwise come
    // back and spin the sphere through a hundred turns in one step. 16.7ms is one frame at 60Hz,
    // so the speeds above read as "per frame" on an ordinary screen and stay the same on a 120Hz
    // one.
    const step = Math.min(now - last, 50) / 16.7;
    last = now;

    // Added 2026-09-28: while a finger or a button holds the sphere it turns only as far as the
    // finger moves it (the pointermove listener), so the speeds are zero - which is also what
    // stops it under a finger held still.
    if (drag) {
      speedX = 0;
      speedY = 0;
    } else if (pointer) {
      // The reference takes its speed from the pointer's distance to the middle, and so does
      // this: at the edge of the block the sphere turns fastest, in the middle it nearly stops.
      speedY += (pointer.x * fastest - speedY) * 0.08;
      speedX += (-pointer.y * fastest - speedX) * 0.08;
    } else {
      // Back to the idle drift, gently, so that letting go of the cloud does not stop it dead.
      speedY += (idleY - speedY) * 0.02;
      speedX += (0 - speedX) * 0.02;
    }

    angleY += speedY * step;
    angleX += speedX * step;

    const cosY = Math.cos(angleY);
    const sinY = Math.sin(angleY);
    const cosX = Math.cos(angleX);
    const sinX = Math.sin(angleX);
    const breathing = now / 1000;

    for (const word of placed) {
      // Around the vertical axis, then around the horizontal one.
      const x1 = word.x * cosY - word.z * sinY;
      const z1 = word.x * sinY + word.z * cosY;
      const y1 = word.y * cosX - z1 * sinX;
      const z2 = word.y * sinX + z1 * cosX;

      // The projection. 2 is the eye distance in sphere radii: the nearer half of the sphere
      // spreads out and the far half draws in, which is the depth cue that makes a flat block of
      // text read as a globe. A smaller number exaggerates it until the front words fly apart.
      const near = 2 / (2 - z2);
      const front = (z2 + 1) / 2;
      const bob =
        word.drift *
        Math.sin((breathing / word.breath) * Math.PI * 2 + word.phase);

      word.node.style.transform =
        "translate(-50%, -50%)" +
        ` translate3d(${(x1 * radius * near).toFixed(1)}px, ${(y1 * radius * near + bob).toFixed(1)}px, 0)` +
        // The floor was 0.62 until 2026-09-22, when the owner asked for the small words to be
        // easier to hit: a one-entry tag is the smallest step to begin with, and 0.62 of that on
        // the far side of the sphere was a target of a few pixels. 0.78 keeps the depth readable
        // and gives back about a quarter of the area. The same request raised the smallest font
        // step in the component.
        // Changed 2026-09-28: times `fit`, which is 1 unless the screen is too narrow for the
        // smallest sphere (measure()).
        ` scale(${((0.78 + 0.34 * front) * fit).toFixed(3)})`;
      word.node.style.opacity = (0.45 + 0.55 * front).toFixed(3);
      // So that a word in front is also in front for the pointer, not only to the eye.
      word.node.style.zIndex = String(Math.round(front * 100));
    }
  };

  const start = () => {
    if (frame !== 0) return;
    cloud.classList.add("tag-cloud--sphere");
    measure();
    last = performance.now();
    frame = requestAnimationFrame(draw);
  };

  const stop = () => {
    if (frame !== 0) cancelAnimationFrame(frame);
    frame = 0;
    // Added 2026-09-28: a drag cut short by the switch to the row must not outlive it.
    drag = null;
    cloud.classList.remove("tag-cloud--sphere");
    // The row the words are rendered as has no use for what the loop wrote on them, and leaving
    // a transform behind would hold them wherever the last frame put them.
    for (const word of placed) {
      word.node.style.removeProperty("transform");
      word.node.style.removeProperty("opacity");
      word.node.style.removeProperty("z-index");
    }
  };

  const decide = () => {
    if (cloudShown.matches && !stillPlease.matches) start();
    else stop();
  };

  // Added 2026-09-28 (the header, "Dragging"). A press on the sphere - a finger, or the main mouse
  // button - takes hold of it. Nothing turns yet: see `grab`.
  cloud.addEventListener("pointerdown", (event: PointerEvent) => {
    if (frame === 0) return;
    if (event.pointerType === "mouse" && event.button !== 0) return;
    drag = {
      id: event.pointerId,
      x: event.clientX,
      y: event.clientY,
      t: event.timeStamp,
      moved: 0,
    };
    flingX = 0;
    flingY = 0;
    pointer = null;
  });

  // The drag itself. The pointer is captured only once it has moved past `grab`: capturing on the
  // press would send the click of a plain tap to the block instead of the word, and the link would
  // not open. The turn is the distance over twice the radius, because a word at the front of the
  // sphere is drawn twice as far out (the projection in draw()), so that word follows the finger.
  cloud.addEventListener("pointermove", (event: PointerEvent) => {
    if (!drag || event.pointerId !== drag.id) return;
    const dx = event.clientX - drag.x;
    const dy = event.clientY - drag.y;
    const dt = Math.max(event.timeStamp - drag.t, 1);
    drag.x = event.clientX;
    drag.y = event.clientY;
    drag.t = event.timeStamp;
    drag.moved += Math.abs(dx) + Math.abs(dy);
    if (drag.moved < grab || radius === 0) return;
    if (!cloud.hasPointerCapture(event.pointerId)) {
      cloud.setPointerCapture(event.pointerId);
    }
    // Right moves the front to the right and down moves it down: see the rotation in draw(),
    // where a larger angle carries the front point left and up.
    const turnY = -dx / (radius * 2);
    const turnX = -dy / (radius * 2);
    angleY += turnY;
    angleX += turnX;
    // Per frame at 60Hz, like the speeds, and smoothed over the last few moves.
    flingY += ((turnY / dt) * 16.7 - flingY) * 0.5;
    flingX += ((turnX / dt) * 16.7 - flingX) * 0.5;
  });

  // Letting go. A drag hands its last speed to the sphere, which then eases back into the idle
  // drift by itself (draw()); a finger that stopped before it lifted throws nothing. The click
  // that follows the release of a drag would open whatever word ended up under the finger, so it
  // is swallowed.
  const letGo = (event: PointerEvent) => {
    if (!drag || event.pointerId !== drag.id) return;
    if (drag.moved >= grab) {
      const still = event.timeStamp - drag.t > 80;
      speedY = still ? 0 : clampFling(flingY);
      speedX = still ? 0 : clampFling(flingX);
      swallowUntil = event.timeStamp + 400;
    }
    drag = null;
  };
  cloud.addEventListener("pointerup", letGo);
  cloud.addEventListener("pointercancel", letGo);
  cloud.addEventListener(
    "click",
    (event: MouseEvent) => {
      if (event.timeStamp < swallowUntil) {
        event.preventDefault();
        event.stopPropagation();
      }
    },
    true,
  );
  // A mouse drag that starts on a word would otherwise pick the link up and carry it off as a
  // drag-and-drop, which ends the pointer's events at once.
  cloud.addEventListener("dragstart", (event: DragEvent) => {
    if (frame !== 0) event.preventDefault();
  });

  cloud.addEventListener("pointermove", (event: PointerEvent) => {
    // Added 2026-09-28: the steering is for a mouse that hovers. While the sphere is held it
    // turns with the drag, and a finger only ever drags.
    if (drag || event.pointerType !== "mouse") return;
    const box = cloud.getBoundingClientRect();
    if (box.width === 0 || box.height === 0) return;
    // -1 at one edge of the block, +1 at the other.
    pointer = {
      x: ((event.clientX - box.left) / box.width - 0.5) * 2,
      y: ((event.clientY - box.top) / box.height - 0.5) * 2,
    };
  });

  const release = () => {
    pointer = null;
  };
  cloud.addEventListener("pointerleave", release);
  cloud.addEventListener("pointercancel", release);

  window.addEventListener("resize", () => {
    if (frame !== 0) measure();
  });

  cloudShown.addEventListener("change", decide);
  stillPlease.addEventListener("change", decide);
  decide();

  // Added 2026-09-28: the site's fonts come from Google with display=swap, so the words are first
  // drawn - and measured - in a fallback face, and grow when the real one arrives. Measuring again
  // then keeps the widest word inside the block on a slow connection.
  void document.fonts.ready.then(() => {
    if (frame !== 0) measure();
  });
}
