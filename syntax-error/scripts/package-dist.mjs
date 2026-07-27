/**
 * Package `dist/` into a deployable ZIP using only Node built-ins.
 *
 * The previous `zip` script shelled out to `mkdir -p` and `zip`, neither of
 * which exists on Windows, and wrote the archive inside the very directory it
 * was compressing. This writes a standard ZIP with `node:zlib` so the command
 * behaves identically on Windows, macOS, Linux and CI.
 */
import { deflateRawSync } from "node:zlib";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const PROJECT_ROOT = resolve(fileURLToPath(new URL("..", import.meta.url)));
const DIST_DIR = resolve(PROJECT_ROOT, "dist");
const OUTPUT_DIR = resolve(PROJECT_ROOT, "release");
const OUTPUT_FILE = resolve(OUTPUT_DIR, "syntax-error.zip");
const EXCLUDED_NAMES = new Set([".DS_Store", "Thumbs.db"]);

const CRC_TABLE = (() => {
  const table = new Int32Array(256);
  for (let index = 0; index < 256; index += 1) {
    let value = index;
    for (let bit = 0; bit < 8; bit += 1) {
      value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
    }
    table[index] = value;
  }
  return table;
})();

function crc32(buffer) {
  let crc = -1;
  for (let index = 0; index < buffer.length; index += 1) {
    crc = (crc >>> 8) ^ CRC_TABLE[(crc ^ buffer[index]) & 0xff];
  }
  return (crc ^ -1) >>> 0;
}

/** ZIP stores timestamps as packed MS-DOS date/time fields. */
function toDosDateTime(date) {
  const year = Math.max(1980, date.getFullYear());
  return {
    time: (date.getHours() << 11) | (date.getMinutes() << 5) | (date.getSeconds() >> 1),
    date: ((year - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate(),
  };
}

function collectFiles(directory) {
  const found = [];
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    if (EXCLUDED_NAMES.has(entry.name)) continue;
    const absolute = join(directory, entry.name);
    if (entry.isDirectory()) found.push(...collectFiles(absolute));
    else if (entry.isFile()) found.push(absolute);
  }
  return found;
}

function buildZip(files, baseDirectory) {
  const localParts = [];
  const centralParts = [];
  let offset = 0;
  let entryCount = 0;

  for (const absolute of files) {
    // ZIP entry names always use forward slashes, regardless of host platform.
    const name = relative(baseDirectory, absolute).split(sep).join("/");
    const contents = readFileSync(absolute);
    const deflated = deflateRawSync(contents, { level: 9 });
    // Only compress when it actually helps; otherwise store the bytes.
    const useDeflate = deflated.length < contents.length;
    const payload = useDeflate ? deflated : contents;
    const method = useDeflate ? 8 : 0;
    const checksum = crc32(contents);
    const { time, date } = toDosDateTime(statSync(absolute).mtime);
    const nameBytes = Buffer.from(name, "utf8");

    const localHeader = Buffer.alloc(30);
    localHeader.writeUInt32LE(0x04034b50, 0);
    localHeader.writeUInt16LE(20, 4);
    localHeader.writeUInt16LE(0, 6);
    localHeader.writeUInt16LE(method, 8);
    localHeader.writeUInt16LE(time, 10);
    localHeader.writeUInt16LE(date, 12);
    localHeader.writeUInt32LE(checksum, 14);
    localHeader.writeUInt32LE(payload.length, 18);
    localHeader.writeUInt32LE(contents.length, 22);
    localHeader.writeUInt16LE(nameBytes.length, 26);
    localHeader.writeUInt16LE(0, 28);
    localParts.push(localHeader, nameBytes, payload);

    const centralHeader = Buffer.alloc(46);
    centralHeader.writeUInt32LE(0x02014b50, 0);
    centralHeader.writeUInt16LE(20, 4);
    centralHeader.writeUInt16LE(20, 6);
    centralHeader.writeUInt16LE(0, 8);
    centralHeader.writeUInt16LE(method, 10);
    centralHeader.writeUInt16LE(time, 12);
    centralHeader.writeUInt16LE(date, 14);
    centralHeader.writeUInt32LE(checksum, 16);
    centralHeader.writeUInt32LE(payload.length, 20);
    centralHeader.writeUInt32LE(contents.length, 24);
    centralHeader.writeUInt16LE(nameBytes.length, 28);
    centralHeader.writeUInt16LE(0, 30);
    centralHeader.writeUInt16LE(0, 32);
    centralHeader.writeUInt16LE(0, 34);
    centralHeader.writeUInt16LE(0, 36);
    centralHeader.writeUInt32LE(0, 38);
    centralHeader.writeUInt32LE(offset, 42);
    centralParts.push(centralHeader, nameBytes);

    offset += localHeader.length + nameBytes.length + payload.length;
    entryCount += 1;
  }

  const centralDirectory = Buffer.concat(centralParts);
  const endRecord = Buffer.alloc(22);
  endRecord.writeUInt32LE(0x06054b50, 0);
  endRecord.writeUInt16LE(0, 4);
  endRecord.writeUInt16LE(0, 6);
  endRecord.writeUInt16LE(entryCount, 8);
  endRecord.writeUInt16LE(entryCount, 10);
  endRecord.writeUInt32LE(centralDirectory.length, 12);
  endRecord.writeUInt32LE(offset, 16);
  endRecord.writeUInt16LE(0, 20);

  return Buffer.concat([...localParts, centralDirectory, endRecord]);
}

if (!existsSync(join(DIST_DIR, "index.html"))) {
  console.error("dist/index.html is missing; run `npm run build` first.");
  process.exit(1);
}

const files = collectFiles(DIST_DIR);
if (files.length === 0) {
  console.error("dist/ contains no files to package.");
  process.exit(1);
}

mkdirSync(OUTPUT_DIR, { recursive: true });
const archive = buildZip(files, DIST_DIR);
writeFileSync(OUTPUT_FILE, archive);

const sizeKB = (archive.length / 1024).toFixed(1);
console.log(
  `Packaged ${files.length} files into ${relative(PROJECT_ROOT, OUTPUT_FILE)} (${sizeKB} kB)`,
);
