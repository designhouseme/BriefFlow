import test from "node:test";
import assert from "node:assert/strict";
import { deflateSync } from "node:zlib";
import type { Section } from "../src/shared/types.ts";
import { freshTemplateSections, fromBase64, LOGO_MAX_BYTES, toBase64, validateLogo, validateTemplateSections } from "../src/server/account-resources.ts";

// Small real raster fixtures, generated once using Pillow. Runtime tests need no image dependency.
const PNG = "iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAIAAAD91JpzAAAAEklEQVR4nGNU9a9jYGBgYgADAAspAPbEZzy/AAAAAElFTkSuQmCC";
const JPEG = "/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/2wBDAQkJCQwLDBgNDRgyIRwhMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjL/wAARCAACAAIDASIAAhEBAxEB/8QAHwAAAQUBAQEBAQEAAAAAAAAAAAECAwQFBgcICQoL/8QAtRAAAgEDAwIEAwUFBAQAAAF9AQIDAAQRBRIhMUEGE1FhByJxFDKBkaEII0KxwRVS0fAkM2JyggkKFhcYGRolJicoKSo0NTY3ODk6Q0RFRkdISUpTVFVWV1hZWmNkZWZnaGlqc3R1dnd4eXqDhIWGh4iJipKTlJWWl5iZmqKjpKWmp6ipqrKztLW2t7i5usLDxMXGx8jJytLT1NXW19jZ2uHi4+Tl5ufo6erx8vP09fb3+Pn6/8QAHwEAAwEBAQEBAQEBAQAAAAAAAAECAwQFBgcICQoL/8QAtREAAgECBAQDBAcFBAQAAQJ3AAECAxEEBSExBhJBUQdhcRMiMoEIFEKRobHBCSMzUvAVYnLRChYkNOEl8RcYGRomJygpKjU2Nzg5OkNERUZHSElKU1RVVldYWVpjZGVmZ2hpanN0dXZ3eHl6goOEhYaHiImKkpOUlZaXmJmaoqOkpaanqKmqsrO0tba3uLm6wsPExcbHyMnK0tPU1dbX2Nna4uPk5ebn6Onq8vP09fb3+Pn6/9oADAMBAAIRAxEAPwDh6KKK9w8k/9k=";
const WEBP = "UklGRjYAAABXRUJQVlA4ICoAAACQAQCdASoCAAIAAUAmJZgCdLoAA5gA/vSIh/4ILaj0w6UP8W0joVGgAAA=";

test("logo accepts actual PNG, JPEG and WebP, and storage encoding roundtrips all bytes", () => {
  for (const [fixture, mime] of [[PNG, "image/png"], [JPEG, "image/jpeg"], [WEBP, "image/webp"]]) {
    const bytes = Buffer.from(fixture, "base64");
    assert.equal(validateLogo(bytes, mime), mime);
    assert.deepEqual(Buffer.from(fromBase64(toBase64(bytes))), bytes);
  }
});

test("logo rejects SVG, mismatched MIME, damaged/truncated containers and excessive size", () => {
  assert.throws(() => validateLogo(Buffer.from("<svg xmlns='http://www.w3.org/2000/svg'/>"), "image/svg+xml"));
  assert.throws(() => validateLogo(Buffer.from(PNG, "base64"), "image/jpeg"));
  for (const [fixture, mime] of [[PNG, "image/png"], [JPEG, "image/jpeg"], [WEBP, "image/webp"]]) {
    const bytes = Buffer.from(fixture, "base64");
    assert.throws(() => validateLogo(bytes.subarray(0, bytes.length - 2), mime));
    assert.throws(() => validateLogo(Buffer.concat([bytes, Buffer.from("unexpected")]), mime));
  }
  const damaged = Buffer.from(PNG, "base64");
  damaged[44] ^= 0xff;
  assert.throws(() => validateLogo(damaged, "image/png"));
  assert.throws(() => validateLogo(new Uint8Array(LOGO_MAX_BYTES + 1), "image/png"), /512 KB/);
});

function png(width: number, height: number): Buffer {
  const crc32 = (bytes: Buffer) => {
    let crc = 0xffffffff;
    for (const byte of bytes) {
      crc ^= byte;
      for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
    }
    return (crc ^ 0xffffffff) >>> 0;
  };
  const chunk = (name: string, data: Buffer) => {
    const payload = Buffer.concat([Buffer.from(name), data]);
    const size = Buffer.alloc(4); size.writeUInt32BE(data.length);
    const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(payload));
    return Buffer.concat([size, payload, crc]);
  };
  const header = Buffer.alloc(13); header.writeUInt32BE(width, 0); header.writeUInt32BE(height, 4); header[8] = 8; header[9] = 2;
  const scanlines = Buffer.alloc((width * 3 + 1) * height);
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk("IHDR", header), chunk("IDAT", deflateSync(scanlines)), chunk("IEND", Buffer.alloc(0))]);
}

test("logo dimensions prevent a very small compressed image expanding into a huge raster", () => {
  const wide = png(2049, 1);
  assert.ok(wide.length < 200);
  assert.throws(() => validateLogo(wide, "image/png"), /2048/);
  assert.equal(validateLogo(png(2048, 1), "image/png"), "image/png");
});

const sections: Section[] = [{ id: "section", title: "Pytania", fields: [
  { id: "choice", label: "Zakres", required: true, type: "single_choice", origin: "agency", options: [{ id: "shop", label: "Sklep", quote: true }, { id: "site", label: "Strona" }] },
  { id: "dependent", label: "Produkty", required: false, type: "short_text", origin: "ai", reason: "Pole dodane przez AI", showIf: { fieldId: "choice", equals: "shop" } },
  { id: "boolean", label: "Masz logo?", required: false, type: "yes_no", origin: "agency" },
  { id: "logo", label: "Link do logo", required: false, type: "material", origin: "agency", showIf: { fieldId: "boolean", equals: "yes" } },
] }, { id: "conditional-section", title: "Sklep", showIf: { fieldId: "choice", equals: "shop" }, fields: [] }];

test("saved template cloning remaps section, question and option conditions without changing source", () => {
  const original = structuredClone(sections);
  let counter = 0;
  const cloned = freshTemplateSections(sections, () => String(++counter));
  assert.deepEqual(sections, original);
  assert.notEqual(cloned[0].id, sections[0].id);
  const [choice, dependent, boolean, logo] = cloned[0].fields;
  assert.notEqual(choice.id, "choice");
  assert.notEqual(choice.options![0].id, "shop");
  assert.equal(choice.options![0].quote, true);
  assert.deepEqual(dependent.showIf, { fieldId: choice.id, equals: choice.options![0].id });
  assert.deepEqual(cloned[1].showIf, dependent.showIf);
  assert.deepEqual(logo.showIf, { fieldId: boolean.id, equals: "yes" });
  assert.equal(dependent.origin, "template");
  assert.equal(dependent.reason, undefined);
  const again = freshTemplateSections(sections, () => String(++counter));
  assert.notEqual(again[0].fields[0].id, choice.id);
});

test("templates reject dangling dependencies, duplicate ids and excessive count/size", () => {
  const missing = structuredClone(sections); missing[0].fields[1].showIf!.fieldId = "missing";
  assert.throws(() => validateTemplateSections(missing), /nieistniejącego/);
  const duplicate = structuredClone(sections); duplicate[1].id = duplicate[0].fields[0].id;
  assert.throws(() => validateTemplateSections(duplicate), /identyfikatory/);
  const missingOption = structuredClone(sections); missingOption[0].fields[1].showIf!.equals = "missing-option";
  assert.throws(() => validateTemplateSections(missingOption), /nieistniejącej opcji/);
  assert.throws(() => validateTemplateSections([]), /sekcji/);
  assert.throws(() => validateTemplateSections(Array.from({ length: 31 }, (_, i) => ({ id: String(i), title: "Sekcja", fields: [] }))), /sekcji/);
  assert.throws(() => validateTemplateSections([{ id: "s", title: "Sekcja", fields: Array.from({ length: 301 }, (_, i) => ({ id: `f${i}`, label: "Pytanie", required: false, type: "short_text", origin: "agency" })) }]), /300/);
  const huge = structuredClone(sections); huge[0].description = "x".repeat(300_000);
  assert.throws(() => validateTemplateSections(huge), /256 KB/);
});
