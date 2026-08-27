import test from "node:test";
import assert from "node:assert/strict";

import { getMediaExtension } from "./getMediaExtension.js";

const cases = [
  ["file:///a.JPG", "jpg"],
  ["file:///a.JPEG?token=1", "jpeg"],
  ["file:///a.png#fragment", "png"],
  ["file:///a.webp", "webp"],
  ["file:///a.mp4", "mp4"],
  ["file:///a.MOV", "mov"],
  ["file:///a.webm", "webm"],
  ["file:///a.3gp", "3gp"],
  ["file:///a.m4a", "m4a"],
  ["file:///a.mp3", "mp3"],
  ["file:///a.wav", "wav"],
  ["file:///a.aac", "aac"],
];

for (const [uri, expected] of cases) {
  test(`preserves recognized extension from ${uri}`, () => {
    assert.equal(getMediaExtension({ uri }), expected);
  });
}

test("recognized URI extension wins over broad media type", () => {
  assert.equal(getMediaExtension({ uri: "file:///clip.mov", type: "video" }), "mov");
});

test("exact MIME is used when URI has no recognized extension", () => {
  assert.equal(
    getMediaExtension({ uri: "file:///clip", mimeType: "video/quicktime", type: "video" }),
    "mov",
  );
  assert.equal(
    getMediaExtension({ uri: "file:///voice", contentType: "audio/mpeg", type: "audio" }),
    "mp3",
  );
});

test("broad media type provides safe fallback", () => {
  assert.equal(getMediaExtension({ uri: "file:///photo", type: "image" }), "jpg");
  assert.equal(getMediaExtension({ uri: "file:///video", type: "video" }), "mp4");
  assert.equal(getMediaExtension({ uri: "file:///voice", type: "audio" }), "m4a");
});

test("unknown media falls back to jpg", () => {
  assert.equal(getMediaExtension({ uri: "file:///unknown.bin" }), "jpg");
});
