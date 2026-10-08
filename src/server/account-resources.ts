import type { Section, ShowIf } from "../shared/types";

export const LOGO_MAX_BYTES = 512 * 1024;
export const LOGO_MAX_DIMENSION = 2048;
export const TEMPLATE_LIMIT = 50;
export const TEMPLATE_MAX_BYTES = 256 * 1024;
export const TEMPLATE_ID = /^custom_[A-Za-z0-9]{16}$/;

export interface StoredLogo {
  data: string;
  mimeType: "image/png" | "image/jpeg" | "image/webp";
  updatedAt: number;
}

const invalidLogo = () => new Error("To nie jest poprawny plik PNG, JPG albo WebP.");
const u32be = (bytes: Uint8Array, offset: number) => new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).getUint32(offset);
const u32le = (bytes: Uint8Array, offset: number) => new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).getUint32(offset, true);
const ascii = (bytes: Uint8Array, offset: number, length: number) => String.fromCharCode(...bytes.subarray(offset, offset + length));

function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function pngDimensions(bytes: Uint8Array): [number, number] {
  if (bytes.length < 45 || ![137, 80, 78, 71, 13, 10, 26, 10].every((byte, i) => bytes[i] === byte)) throw invalidLogo();
  let cursor = 8;
  let dimensions: [number, number] | undefined;
  let hasPixels = false;
  while (cursor + 12 <= bytes.length) {
    const size = u32be(bytes, cursor);
    if (size > bytes.length - cursor - 12) throw invalidLogo();
    const name = ascii(bytes, cursor + 4, 4);
    const end = cursor + 8 + size;
    if (crc32(bytes.subarray(cursor + 4, end)) !== u32be(bytes, end)) throw invalidLogo();
    if (cursor === 8 && (name !== "IHDR" || size !== 13)) throw invalidLogo();
    if (name === "IHDR") {
      if (dimensions || size !== 13 || bytes[cursor + 18] !== 0 || bytes[cursor + 19] !== 0 || bytes[cursor + 20] > 1) throw invalidLogo();
      const depths: Record<number, number[]> = { 0: [1, 2, 4, 8, 16], 2: [8, 16], 3: [1, 2, 4, 8], 4: [8, 16], 6: [8, 16] };
      if (!depths[bytes[cursor + 17]]?.includes(bytes[cursor + 16])) throw invalidLogo();
      dimensions = [u32be(bytes, cursor + 8), u32be(bytes, cursor + 12)];
    }
    if (name === "acTL") throw new Error("Logo musi być nieruchomym obrazem.");
    if (name === "IDAT" && size > 0) hasPixels = true;
    cursor = end + 4;
    if (name === "IEND") {
      if (size !== 0 || cursor !== bytes.length || !hasPixels || !dimensions) throw invalidLogo();
      return dimensions;
    }
  }
  throw invalidLogo();
}

function jpegDimensions(bytes: Uint8Array): [number, number] {
  if (bytes.length < 20 || bytes[0] !== 0xff || bytes[1] !== 0xd8) throw invalidLogo();
  let cursor = 2;
  let dimensions: [number, number] | undefined;
  let hasScan = false;
  while (cursor < bytes.length) {
    if (bytes[cursor++] !== 0xff) throw invalidLogo();
    while (bytes[cursor] === 0xff) cursor++;
    const marker = bytes[cursor++];
    if (marker === 0xd9) {
      if (!dimensions || !hasScan || cursor !== bytes.length) throw invalidLogo();
      return dimensions;
    }
    if (marker === undefined || marker === 0 || marker === 0xd8 || (marker >= 0xd0 && marker <= 0xd7) || cursor + 2 > bytes.length) throw invalidLogo();
    const size = (bytes[cursor] << 8) | bytes[cursor + 1];
    if (size < 2 || cursor + size > bytes.length) throw invalidLogo();
    if ([0xc0, 0xc1, 0xc2].includes(marker)) {
      if (dimensions || size < 8 || bytes[cursor + 2] !== 8 || size !== 8 + 3 * bytes[cursor + 7]) throw invalidLogo();
      dimensions = [(bytes[cursor + 5] << 8) | bytes[cursor + 6], (bytes[cursor + 3] << 8) | bytes[cursor + 4]];
    }
    cursor += size;
    if (marker === 0xda) {
      const scanComponents = bytes[cursor - size + 2];
      if (!dimensions || scanComponents < 1 || scanComponents > 4 || size !== 6 + 2 * scanComponents) throw invalidLogo();
      hasScan = true;
      // Entropy-coded data allows escaped FF bytes and restart markers. Next real marker
      // may start another scan (progressive JPEG), or terminate the image.
      while (cursor < bytes.length) {
        if (bytes[cursor] !== 0xff) { cursor++; continue; }
        const next = bytes[cursor + 1];
        if (next === 0 || (next >= 0xd0 && next <= 0xd7)) { cursor += 2; continue; }
        break;
      }
    }
  }
  throw invalidLogo();
}

function webpDimensions(bytes: Uint8Array): [number, number] {
  if (bytes.length < 26 || ascii(bytes, 0, 4) !== "RIFF" || ascii(bytes, 8, 4) !== "WEBP" || u32le(bytes, 4) !== bytes.length - 8) throw invalidLogo();
  let cursor = 12;
  let dimensions: [number, number] | undefined;
  let canvas: [number, number] | undefined;
  while (cursor + 8 <= bytes.length) {
    const name = ascii(bytes, cursor, 4);
    const size = u32le(bytes, cursor + 4);
    const start = cursor + 8;
    if (size > bytes.length - start) throw invalidLogo();
    if (name === "ANIM" || name === "ANMF") throw new Error("Logo musi być nieruchomym obrazem.");
    if (name === "VP8X") {
      if (canvas || size !== 10 || (bytes[start] & 2) !== 0) throw invalidLogo();
      const read24 = (offset: number) => bytes[offset] | (bytes[offset + 1] << 8) | (bytes[offset + 2] << 16);
      canvas = [read24(start + 4) + 1, read24(start + 7) + 1];
    }
    if (name === "VP8 ") {
      if (dimensions || size < 10 || (bytes[start] & 1) !== 0 || ascii(bytes, start + 3, 3) !== "\x9d\x01\x2a") throw invalidLogo();
      dimensions = [(bytes[start + 6] | (bytes[start + 7] << 8)) & 0x3fff, (bytes[start + 8] | (bytes[start + 9] << 8)) & 0x3fff];
    }
    if (name === "VP8L") {
      if (dimensions || size < 6 || bytes[start] !== 0x2f) throw invalidLogo();
      const packed = u32le(bytes, start + 1);
      if (packed >>> 29 !== 0) throw invalidLogo();
      dimensions = [(packed & 0x3fff) + 1, ((packed >>> 14) & 0x3fff) + 1];
    }
    cursor = start + size + (size % 2);
  }
  if (cursor !== bytes.length || !dimensions || (canvas && (canvas[0] !== dimensions[0] || canvas[1] !== dimensions[1]))) throw invalidLogo();
  return dimensions;
}

/** Raster types only. Check the container, not the filename or user supplied MIME. */
export function validateLogo(bytes: Uint8Array, mimeType: string): StoredLogo["mimeType"] {
  if (bytes.length === 0 || bytes.length > LOGO_MAX_BYTES) throw new Error("Logo może mieć maksymalnie 512 KB.");
  let dimensions: [number, number];
  if (mimeType === "image/png") dimensions = pngDimensions(bytes);
  else if (mimeType === "image/jpeg") dimensions = jpegDimensions(bytes);
  else if (mimeType === "image/webp") dimensions = webpDimensions(bytes);
  else throw invalidLogo();
  if (dimensions.some((size) => size < 1 || size > LOGO_MAX_DIMENSION)) throw new Error("Logo może mieć maksymalnie 2048 × 2048 pikseli.");
  return mimeType;
}

export function toBase64(bytes: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < bytes.length; i += 8192) binary += String.fromCharCode(...bytes.subarray(i, i + 8192));
  return btoa(binary);
}

export function fromBase64(value: string): Uint8Array<ArrayBuffer> {
  return Uint8Array.from(atob(value), (character) => character.charCodeAt(0));
}

/** Snapshot contains question structure only; answers and the brief's clientName are excluded. */
export function validateTemplateSections(sections: Section[]): void {
  if (!Array.isArray(sections) || sections.length < 1 || sections.length > 30) throw new Error("Szablon może mieć od 1 do 30 sekcji.");
  if (new TextEncoder().encode(JSON.stringify(sections)).length > TEMPLATE_MAX_BYTES) throw new Error("Szablon jest za duży (maksymalnie 256 KB).");
  const fields = sections.flatMap((section) => section.fields);
  if (fields.length > 300) throw new Error("Szablon może mieć maksymalnie 300 pytań.");
  const ids = [...sections.map((section) => section.id), ...fields.map((field) => field.id)];
  if (new Set(ids).size !== ids.length || ids.some((id) => typeof id !== "string" || !id)) throw new Error("Szablon ma nieprawidłowe identyfikatory pytań.");
  const fieldMap = new Map(fields.map((field) => [field.id, field]));
  for (const condition of [...sections.map((section) => section.showIf), ...fields.map((field) => field.showIf)]) {
    if (condition && !fieldMap.has(condition.fieldId)) throw new Error("Warunek szablonu odwołuje się do nieistniejącego pytania.");
    if (condition) {
      const source = fieldMap.get(condition.fieldId)!;
      const choices = source.type === "yes_no" ? ["yes", "no"] : (source.type === "single_choice" || source.type === "multi_choice") ? source.options?.map((option) => option.id) : undefined;
      if (!choices?.includes(condition.equals)) throw new Error("Warunek szablonu odwołuje się do nieistniejącej opcji.");
    }
  }
}

/** Fresh question/section/choice ids avoid sharing identity across independent briefs. */
export function freshTemplateSections(sections: Section[], makeId = () => crypto.randomUUID()): Section[] {
  validateTemplateSections(sections);
  const cloned = structuredClone(sections);
  const fieldIds = new Map(sections.flatMap((section) => section.fields).map((field) => [field.id, `f_${makeId()}`]));
  const optionIds = new Map<string, Map<string, string>>();
  for (const section of cloned) {
    section.id = `s_${makeId()}`;
    for (const field of section.fields) {
      const oldId = field.id;
      field.id = fieldIds.get(oldId)!;
      field.templateKey ??= oldId;
      field.origin = "template";
      delete field.reason;
      if ((field.type === "single_choice" || field.type === "multi_choice") && field.options) {
        const remap = new Map(field.options.map((option) => [option.id, `o_${makeId()}`]));
        optionIds.set(oldId, remap);
        for (const option of field.options) {
          option.templateKey ??= option.id;
          option.id = remap.get(option.id)!;
        }
      }
    }
  }
  const remapCondition = (condition?: ShowIf) => {
    if (!condition) return;
    condition.equals = optionIds.get(condition.fieldId)?.get(condition.equals) ?? condition.equals;
    condition.fieldId = fieldIds.get(condition.fieldId)!;
  };
  for (const section of cloned) {
    remapCondition(section.showIf);
    section.fields.forEach((field) => remapCondition(field.showIf));
  }
  return cloned;
}
