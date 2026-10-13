// The rules for a video's text (T150 of specs/001-self-hosted-club-site): the successors of the build guards of
// getVideos(). Pure functions, so no database. The same cases are repeated through the importer in import.test.ts, which
// proves they are wired, not only defined.

import assert from "node:assert/strict";
import { test } from "node:test";
import {
  videoTextProblems,
  yandexDiskAddress,
  youtubeAddress,
} from "../../src/content/video-guards.js";

const codes = (input: Parameters<typeof videoTextProblems>[0]): string[] =>
  videoTextProblems(input).map((p) => p.code);

test("a plain paid lecture and a plain public one break no rule", () => {
  assert.deepEqual(codes({ paid: true, body: "Text of the lecture." }), []);
  assert.deepEqual(
    codes({ paid: false, body: "Text, with a link to https://youtu.be/x." }),
    [],
  );
});

test("a YouTube address in a paid lecture is refused in every form", () => {
  for (const address of [
    "https://www.youtube.com/watch?v=abcdefghijk",
    "https://youtu.be/abcdefghijk?t=60",
    "https://www.youtube-nocookie.com/embed/abcdefghijk",
    "https://i.ytimg.com/vi/abcdefghijk/hqdefault.jpg",
  ]) {
    assert.deepEqual(
      codes({ paid: true, body: `Watch ${address} now.` }),
      ["youtube_in_paid"],
      address,
    );
  }
});

test("a Yandex Disk address in a paid lecture is refused in every form, a members-only block included", () => {
  for (const address of [
    "https://disk.yandex.ru/i/AbCdEf",
    "https://disk.yandex.com/d/AbCdEf",
    "https://disk.360.yandex.ru/i/AbCdEf",
    "https://yadi.sk/i/AbCdEf",
    "https://downloader.disk.yandex.ru/disk/abc/",
  ]) {
    assert.deepEqual(
      codes({
        paid: true,
        body: `Public.\n\n<div data-members-only>\n\nFile: ${address}\n\n</div>\n`,
      }),
      ["yandex_in_paid"],
      address,
    );
  }
});

test("the front matter description is held to the same address rules", () => {
  assert.deepEqual(
    codes({
      paid: true,
      body: "Text.",
      description: "Lecture, https://youtu.be/abcdefghijk",
    }),
    ["youtube_in_paid"],
  );
});

test("a members-only block in a public lecture is refused", () => {
  assert.deepEqual(
    codes({
      paid: false,
      body: "Public.\n\n<div data-members-only>\n\nHandout.\n\n</div>\n",
    }),
    ["block_in_public"],
  );
});

test("a block that cannot be recognised is refused", () => {
  const cases: Record<string, string> = {
    "an attribute spelled differently":
      '<div data-members-only="true">\n\nText.\n\n</div>',
    "no closing tag": "<div data-members-only>\n\nText.\n",
    "another div inside":
      "<div data-members-only>\n\n<div>inner</div>\n\nText.\n\n</div>",
    "an uppercase tag": "<DIV data-members-only>\n\nText.\n\n</DIV>",
  };
  for (const [name, block] of Object.entries(cases)) {
    assert.deepEqual(
      codes({ paid: true, body: `Public.\n\n${block}\n` }),
      ["block_unrecognised"],
      name,
    );
  }
});

test("a well-formed block in a paid lecture is accepted", () => {
  assert.deepEqual(
    codes({
      paid: true,
      body: "Public.\n\n<div data-members-only>\n\n## Materials\n\nText.\n\n</div>\n",
    }),
    [],
  );
});

test("the two address patterns are the ones the old build guard used", () => {
  assert.ok(youtubeAddress.test("http://youtu.be/x"));
  assert.ok(!youtubeAddress.test("https://example.org/youtube"));
  assert.ok(yandexDiskAddress.test("https://disk.yandex.ru/i/x"));
  assert.ok(!yandexDiskAddress.test("https://yandex.ru/search"));
});
