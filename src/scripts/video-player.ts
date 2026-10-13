// Renamed 2026-10-11 (T083): this file was src/scripts/paid-video.ts. It is the browser half of VideoPlayer.astro for
// every video and no longer talks to any access service or to Clerk; the note "Changed 2026-10-11 (T137, T082)" below
// says what it does now. The text under it is the history of the first design.
//
// The player of a paid video, in the browser. Added 2026-09-28; the design is the consilium verdict
// in .specify/consilium/2026-09-28-paid-video-access.md, the markup is src/components/PaidVideo.astro
// and the service it asks is workers/video-access/.
//
// Steps, cheapest first, so that a guest pays for none of Clerk:
// 1. No stub on the page (a public video): return. Astro puts this script on every video page.
// 2. The header's flag says nobody is signed in: show the sign-in link. The flag is presentation
//    (auth-flag.ts), which is fine here: a wrong "signed in" only costs a Clerk load and ends in
//    step 3, and a wrong "signed out" shows a link to the sign-in page, which sends a signed-in
//    visitor straight back.
// 3. Load Clerk through a dynamic import of auth.ts, the one place an instance is created, and
//    take a session token. No session or no token: the sign-in link.
// 4. Ask the service for this slug with the token. 200 carries the player address; 401 means the
//    token was refused (tried once more with a fresh token, since Clerk refreshes them every 60
//    seconds); 403 means signed in but not a member; 404 means the service does not know the
//    slug yet. Anything else, or no answer, is "unavailable", with the reason in the console.
// 5. The player address is used only when it is https on one of site.videoAccess.playerHosts.
//
// Changed later on 2026-09-28, the owner's decision on who sees what on a paid lecture: a guest
// gets block 1 and the sign-in link; a signed-in visitor without access also gets the comments,
// so that they can be instructed there before paying; a member gets the player, block 2 and the
// comments. So once step 3 has confirmed a session, this script sends
// site.videoAccess.signedInEvent, which shows the comments (Disqus.astro), and only after that
// does it look at the service. The check for an empty service address, which came first, moved
// behind step 3 for the same reason: it used to show "unavailable" even to a guest.
//
// Changed 2026-10-11 (T137, T082; plan phase 4): everything above about Clerk, the flag and the access service is
// history. The player now asks the site's own server, with the session cookie the browser already sends:
// GET /api/videos/<slug>/source (server/src/video/source-routes.ts), which applies the one lecture rule (the SQL
// function lecture_view) and answers 200 {embedUrl} or {videoUrl}, or one of: 401 signed_out (the sign-in link), 403
// forbidden (signed in, no right: "denied"), 403 blocked, 403 expired (the page renders its own notice; shown as
// "failed" here only if the date passed while the page was open), 404 no_source ("missing"), 503 unavailable
// ("failed"). A session proves itself by the answer: any answer but 401 means signed in, which shows the comments
// (signedInEvent) as before. The address checks of play() and playFile() stay: a broken server cannot make the page
// load a frame or a file from anywhere else.
import { site } from "../config";

// Changed 2026-10-11 (T082): the component names its states as the lecture rule does, `no_access` instead of
// `denied`; "expired" is rendered by the server only.
type State =
  "loading" | "guest" | "no_access" | "missing" | "failed" | "blocked";

const stub = document.querySelector<HTMLElement>("[data-paid-video]");
if (stub !== null) void run(stub);

async function run(box: HTMLElement): Promise<void> {
  const slug = box.dataset.paidVideo ?? "";
  const show = (state: State) => {
    for (const element of box.querySelectorAll<HTMLElement>("[data-state]")) {
      element.hidden = element.dataset.state !== state;
    }
  };

  // Added 2026-10-11 (T082, T149): the server decided the state at render (`data-initial`). Only an open video asks
  // the source route. A visitor who is signed in but not let in (no_access, blocked) is still told to the comments, and
  // "check again" is a plain reload, because a reload is what asks the server again; a guest has nothing to do.
  const initial = box.dataset.initial ?? "open";
  if (initial !== "open") {
    if (initial === "no_access" || initial === "blocked") {
      document.dispatchEvent(new CustomEvent(site.videoAccess.signedInEvent));
    }
    box
      .querySelector<HTMLButtonElement>("[data-recheck]")
      ?.addEventListener("click", () => location.reload());
    return;
  }

  const check = async (): Promise<void> => {
    show("loading");
    try {
      const answer = await fetch(
        `/api/videos/${encodeURIComponent(slug)}/source`,
        { headers: { Accept: "application/json" } },
      );
      if (answer.status === 401) {
        show("guest");
        return;
      }
      // Anything else than 401 means a session exists: the comments may show.
      document.dispatchEvent(new CustomEvent(site.videoAccess.signedInEvent));
      if (answer.status === 200) {
        play(box, await answer.json());
      } else if (answer.status === 403) {
        const refusal: unknown = await answer.json().catch(() => undefined);
        const code =
          typeof refusal === "object" && refusal !== null && "error" in refusal
            ? refusal.error
            : undefined;
        show(
          code === "blocked"
            ? "blocked"
            : code === "expired"
              ? "failed"
              : "no_access",
        );
      } else if (answer.status === 404) {
        show("missing");
      } else {
        console.error("Paid video: the server answered", answer.status);
        show("failed");
      }
    } catch (error) {
      console.error("Paid video: the server could not be asked.", error);
      show("failed");
    }
  };

  // "Check again" after a 403: the administrator may have granted access a moment ago.
  const recheck = box.querySelector<HTMLButtonElement>("[data-recheck]");
  recheck?.addEventListener("click", async () => {
    recheck.disabled = true;
    await check();
    recheck.disabled = false;
  });

  await check();

  function play(target: HTMLElement, body: unknown): void {
    // Added 2026-09-30: a lecture stored as a file (Yandex Disk) comes as {"videoUrl"}, played in a
    // video element; the rest of this function is the frame for a player page, as before.
    if (typeof body === "object" && body !== null && "videoUrl" in body) {
      playFile(target, body.videoUrl);
      return;
    }
    const address =
      typeof body === "object" && body !== null && "embedUrl" in body
        ? body.embedUrl
        : undefined;
    const hosts: readonly string[] = site.videoAccess.playerHosts;
    let url: URL | undefined;
    try {
      url = typeof address === "string" ? new URL(address) : undefined;
    } catch {
      url = undefined;
    }
    const template = document.querySelector<HTMLTemplateElement>(
      "template[data-paid-player]",
    );
    const frame = template?.content.firstElementChild?.cloneNode(true);
    if (
      url === undefined ||
      url.protocol !== "https:" ||
      !hosts.includes(url.hostname) ||
      !(frame instanceof HTMLIFrameElement)
    ) {
      console.error("Paid video: refused the player address", address);
      show("failed");
      return;
    }
    frame.src = url.href;
    target.replaceWith(frame);
    // Added 2026-09-28: the comments of a paid video are shown only now (the owner's choice), and
    // Disqus.astro owns that block, so it is told by an event rather than reached into.
    document.dispatchEvent(new CustomEvent(site.videoAccess.grantedEvent));
  }

  // Added 2026-09-30: the same steps as play() for a direct file address - https on one of
  // site.videoAccess.fileHosts or nothing, then the video element from its template - so a broken
  // or taken-over service cannot make the page load a file from anywhere else.
  function playFile(target: HTMLElement, address: unknown): void {
    // Added 2026-10-11 (T080): a file on the club's own server comes as the site's own path `/media/video/<slug>`,
    // which the server checks again on every range; it is accepted as it is, and nothing else without a host.
    const own =
      typeof address === "string" &&
      /^\/media\/video\/[a-z0-9%-]+$/.test(address)
        ? address
        : undefined;
    const hosts: readonly string[] = site.videoAccess.fileHosts;
    let url: URL | undefined;
    try {
      url =
        typeof address === "string"
          ? new URL(own ?? address, location.origin)
          : undefined;
    } catch {
      url = undefined;
    }
    const template = document.querySelector<HTMLTemplateElement>(
      "template[data-paid-file]",
    );
    const video = template?.content.firstElementChild?.cloneNode(true);
    if (
      url === undefined ||
      (own === undefined &&
        (url.protocol !== "https:" || !hosts.includes(url.hostname))) ||
      !(video instanceof HTMLVideoElement)
    ) {
      console.error("Paid video: refused the file address", address);
      show("failed");
      return;
    }
    video.src = url.href;
    target.replaceWith(video);
    document.dispatchEvent(new CustomEvent(site.videoAccess.grantedEvent));
  }
}
