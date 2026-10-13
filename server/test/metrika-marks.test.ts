// Yandex Metrika's Session Replay must not record what a person types or what the pages print about a person (T145 of
// specs/001-self-hosted-club-site; METRIKA.md section 3.1; the standing rule of 2026-10-12 is that the counter itself
// stays, which server/test/metrika.test.ts guards). Tests written first, red until the unmarked places are marked.
//
// Metrika has two CSS classes for it (Yandex's help, "Enabling and configuring Session Replay", as METRIKA.md quotes
// them): `ym-disable-keys` on a field, whose contents are then recorded as asterisks, and `ym-hide-content` on any
// element, whose text is then replaced with random characters.
//
// What is fixed here, by reading the sources (the page markup is Astro's and the scripts fill it in at run time, so the
// marks are on the elements the scripts write into, which the sources name by id):
// - Every text-like field of the pages where a person types something personal carries `ym-disable-keys`: the three
//   account pages and the recovery and setup pages (they use one field component), the settings page, the feedback form
//   of the site, the comment box, and the search fields of the panel's users and feedback pages.
// - Every element a script fills with a person's name or address as TEXT carries `ym-hide-content`: the address on
//   the account page, the hand-over banner and state, the list of administrators the role can go to, and the recipient
//   and the pending address of the settings page.
// - Not covered on purpose: what an editor types into a post or a video (the text of an entry, its title, its tags).
//   It is content of the public site, and a draft in the panel is not personal data; marking it would also blind the
//   owner's own look at how editors work. The panel's lists of posts and videos are public content as well.

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const root = new URL("../../../../", import.meta.url);
const read = (file: string): string =>
  readFileSync(fileURLToPath(new URL(file, root)), "utf8");

/** Every opening tag of a given element name in a source, from `<name` to the first `>` outside braces and quotes. */
function openingTags(source: string, name: string): string[] {
  const tags: string[] = [];
  const start = new RegExp(`<${name}(?=[\\s/>])`, "g");
  for (let m = start.exec(source); m !== null; m = start.exec(source)) {
    let depth = 0;
    let quote = "";
    let end = m.index;
    for (; end < source.length; end += 1) {
      const ch = source[end]!;
      if (quote !== "") {
        if (ch === quote) quote = "";
      } else if (ch === '"' || ch === "'") {
        quote = ch;
      } else if (ch === "{") {
        depth += 1;
      } else if (ch === "}") {
        depth -= 1;
      } else if (ch === ">" && depth === 0) {
        break;
      }
    }
    tags.push(source.slice(m.index, end + 1));
  }
  return tags;
}

/** Controls that hold no text a person typed: they need no mark. */
const notText =
  /type="(?:hidden|checkbox|radio|submit|button|file|date)"|aria-hidden="true"|tabindex="-1"/;

const formPages = [
  "src/pages/auth/signin.astro",
  "src/pages/auth/signup.astro",
  "src/pages/auth/account.astro",
  "src/pages/auth/recover.astro",
  "src/pages/auth/setup.astro",
  "src/pages/admin/settings/index.astro",
  "src/pages/admin/users/index.astro",
  "src/pages/admin/feedback/index.astro",
  "src/components/AuthField.astro",
  "src/components/ContactModal.astro",
  "src/components/Comments.astro",
];

test("every text field where a person types something personal carries ym-disable-keys", () => {
  for (const file of formPages) {
    const source = read(file);
    for (const name of ["input", "textarea"]) {
      for (const tag of openingTags(source, name)) {
        if (notText.test(tag)) continue;
        // The field component names its class through a constant (`class:list={[inputClass, ...]}`) whose string holds
        // the mark; every other field spells it out in its own tag.
        const viaConstant =
          /inputClass/.test(tag) &&
          /inputClass\s*=\s*"[^"]*ym-disable-keys/.test(source);
        assert.ok(
          tag.includes("ym-disable-keys") || viaConstant,
          `${file}: ${tag.replace(/\s+/g, " ").slice(0, 140)}`,
        );
      }
    }
  }
});

/**
 * The opening tag of the element the needle belongs to: the needle is an attribute inside the tag, or the text the
 * element starts with, so in both cases it is the nearest "<" before it.
 */
function elementWith(source: string, needle: string): string {
  const at = source.indexOf(needle);
  assert.ok(at >= 0, `not found: ${needle}`);
  const open = source.lastIndexOf("<", at);
  const name = /^<([A-Za-z][\w-]*)/.exec(source.slice(open))?.[1] ?? "";
  return openingTags(source.slice(open), name)[0] ?? "";
}

test("every element a script or a template fills with a person's name or address carries ym-hide-content", () => {
  const slots: [string, string][] = [
    // The member's own address, printed as text beside the profile fields.
    ["src/pages/auth/account.astro", "{account.email}"],
    // The open hand-over of the superuser's role names the other side and its address.
    ["src/pages/auth/account.astro", 'id="handover-banner-text"'],
    ["src/pages/auth/account.astro", 'id="superuser-handover-state"'],
    // The administrators the role can go to are listed by name and address.
    ["src/pages/auth/account.astro", 'id="handover-target"'],
    // The superuser's settings: the recipient now and the address a code was sent to.
    ["src/pages/admin/settings/index.astro", 'id="settings-recipient-now"'],
    ["src/pages/admin/settings/index.astro", 'id="settings-pending-text"'],
  ];
  for (const [file, needle] of slots) {
    const tag = elementWith(read(file), needle);
    assert.ok(
      tag.includes("ym-hide-content"),
      `${file}: ${needle}: ${tag.replace(/\s+/g, " ").slice(0, 140)}`,
    );
  }
});
