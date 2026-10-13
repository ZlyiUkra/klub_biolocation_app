// The adapters of the video providers, one by one (T175, 2026-10-12, the owner's order that every provider must be
// guaranteed to work): what an editor may paste for each host, the canonical reference that is stored, the address of
// the player that comes out of it, and that the host is one the page accepts (src/config.ts `playerHosts`).
// Yandex Disk's `resolve` asks the network and is covered by video-access.test.ts with a stand-in; here only `parse`.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import {
  normalizeReference,
  playableProviders,
  resolveSource,
} from "../src/video/providers/index.js";
import { sourceProviders } from "../src/content/rules.js";

const cases: [string, string, string | null][] = [
  // YouTube
  ["youtube", "dQw4w9WgXcQ", "dQw4w9WgXcQ"],
  [
    "youtube",
    "https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=10s",
    "dQw4w9WgXcQ",
  ],
  ["youtube", "youtu.be/dQw4w9WgXcQ?si=abc", "dQw4w9WgXcQ"],
  ["youtube", "https://youtube.com/shorts/dQw4w9WgXcQ", "dQw4w9WgXcQ"],
  ["youtube", "https://www.youtube.com/embed/dQw4w9WgXcQ", "dQw4w9WgXcQ"],
  [
    "youtube",
    '<iframe width="560" src="https://www.youtube.com/embed/dQw4w9WgXcQ?si=x" title="t"></iframe>',
    "dQw4w9WgXcQ",
  ],
  ["youtube", "https://www.youtube.com/watch?v=short", null],
  ["youtube", "https://example.com/watch?v=dQw4w9WgXcQ", null],
  ["youtube", "https://vk.com/video-1_2", null],
  // VK
  ["vk", "-12345_67890", "-12345_67890"],
  ["vk", "https://vk.com/video-12345_67890", "-12345_67890"],
  ["vk", "https://vkvideo.ru/video-12345_67890", "-12345_67890"],
  [
    "vk",
    "https://vk.com/video_ext.php?oid=-12345&id=67890&hash=0a1b2c3d4e",
    "-12345_67890_0a1b2c3d4e",
  ],
  [
    "vk",
    '<iframe src="https://vk.com/video_ext.php?oid=-1&id=2&hd=2&hash=abcdef12" width="640"></iframe>',
    "-1_2_abcdef12",
  ],
  ["vk", "https://vk.com/feed?z=video-12345_67890%2Fpl_wall", "-12345_67890"],
  ["vk", "https://vk.com/id1", null],
  // Rutube
  [
    "rutube",
    "0123456789abcdef0123456789abcdef",
    "0123456789abcdef0123456789abcdef",
  ],
  [
    "rutube",
    "https://rutube.ru/video/0123456789abcdef0123456789abcdef/",
    "0123456789abcdef0123456789abcdef",
  ],
  [
    "rutube",
    "https://rutube.ru/play/embed/0123456789abcdef0123456789abcdef/?p=KeY_1-2",
    "0123456789abcdef0123456789abcdef?p=KeY_1-2",
  ],
  [
    "rutube",
    "https://rutube.ru/video/private/0123456789abcdef0123456789abcdef/?p=Secret9",
    "0123456789abcdef0123456789abcdef?p=Secret9",
  ],
  ["rutube", "https://rutube.ru/channel/123/", null],
  // Vimeo
  ["vimeo", "123456789", "123456789"],
  ["vimeo", "https://vimeo.com/123456789", "123456789"],
  ["vimeo", "https://vimeo.com/123456789/abcdef1234", "123456789/abcdef1234"],
  [
    "vimeo",
    "https://player.vimeo.com/video/123456789?h=abcdef1234",
    "123456789/abcdef1234",
  ],
  ["vimeo", "https://vimeo.com/channels/staffpicks/123456789", "123456789"],
  ["vimeo", "https://vimeo.com/user", null],
  // Odnoklassniki
  ["ok", "9876543210", "9876543210"],
  ["ok", "https://ok.ru/video/9876543210", "9876543210"],
  ["ok", "https://m.ok.ru/video/9876543210", "9876543210"],
  ["ok", "https://ok.ru/videoembed/9876543210", "9876543210"],
  ["ok", "https://ok.ru/profile/12345", null],
  // Yandex Disk: one file's public link
  [
    "yandex-disk",
    "https://disk.yandex.ru/i/AbC-123_x",
    "https://disk.yandex.ru/i/AbC-123_x",
  ],
  [
    "yandex-disk",
    "https://yadi.sk/i/AbC-123_x",
    "https://disk.yandex.ru/i/AbC-123_x",
  ],
  [
    "yandex-disk",
    "https://disk.yandex.com/i/AbC-123_x/?utm=1",
    "https://disk.yandex.com/i/AbC-123_x",
  ],
  ["yandex-disk", "https://disk.yandex.ru/d/folderKey", null],
  ["yandex-disk", "https://example.com/i/AbC", null],
  // No provider of that name
  ["tiktok", "dQw4w9WgXcQ", null],
];

for (const [provider, text, expected] of cases) {
  test(`${provider}: ${text.slice(0, 60)} -> ${expected ?? "refused"}`, () => {
    assert.equal(normalizeReference(provider, text), expected);
  });
}

test("every provider the panel accepts has an adapter, so none can be saved and then not play", () => {
  assert.deepEqual([...sourceProviders].sort(), [...playableProviders].sort());
});

test("the player addresses are the hosts' embed pages, on hosts the page accepts", async () => {
  const config = readFileSync(
    fileURLToPath(new URL("../../../../src/config.ts", import.meta.url)),
    "utf8",
  );
  const expected: [string, string, string][] = [
    [
      "youtube",
      "dQw4w9WgXcQ",
      "https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ?rel=0",
    ],
    ["vk", "-1_2", "https://vk.com/video_ext.php?oid=-1&id=2"],
    [
      "vk",
      "-1_2_abcdef12",
      "https://vk.com/video_ext.php?oid=-1&id=2&hash=abcdef12",
    ],
    [
      "rutube",
      "0123456789abcdef0123456789abcdef",
      "https://rutube.ru/play/embed/0123456789abcdef0123456789abcdef",
    ],
    ["vimeo", "123456789", "https://player.vimeo.com/video/123456789"],
    [
      "vimeo",
      "123456789/abcdef1234",
      "https://player.vimeo.com/video/123456789?h=abcdef1234",
    ],
    ["ok", "9876543210", "https://ok.ru/videoembed/9876543210"],
  ];
  for (const [provider, reference, address] of expected) {
    const resolved = await resolveSource(provider, reference);
    assert.deepEqual(resolved, { embedUrl: address });
    const host = new URL(address).hostname;
    assert.ok(
      config.includes(`"${host}"`),
      `${host} is in src/config.ts playerHosts, or the page refuses ${provider}`,
    );
  }
});
