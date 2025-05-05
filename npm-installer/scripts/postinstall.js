#!/usr/bin/env node
/* eslint-disable no-console */

const fs = require("fs");
const path = require("path");
const os = require("os");
const http = require("http");
const https = require("https");
const zlib = require("zlib");
const tar = require("tar");
const unzip = require("unzipper");
const { version } = require("../package.json");

// Skip download during local development (e.g., bun i in monorepo root)
// Only run download if CODEBUFF_INSTALL_TYPE is 'deploy' or undefined
if (process.env.CODEBUFF_INSTALL_TYPE && process.env.CODEBUFF_INSTALL_TYPE !== 'deploy') {
  console.log(`Codebuff: Skipping binary download (CODEBUFF_INSTALL_TYPE=${process.env.CODEBUFF_INSTALL_TYPE})`);
  process.exit(0);
}

// This placeholder will be replaced during deploy with the actual download base URL
const baseURL = `__CODEBUFF_DOWNLOAD_BASE_PLACEHOLDER__`;

const platform = os.platform(); // darwin | linux | win32
const arch = os.arch(); // x64 | arm64
const isWin = platform === "win32";
const ext = isWin ? "zip" : "tar.gz";
const binary = isWin ? "codebuff.exe" : "codebuff";

const url = `${baseURL}/codebuff-${platform}-${arch}.${ext}`;
const destDir = path.join(__dirname, "../bin");
const destPath = path.join(destDir, binary);

(async () => {
  if (fs.existsSync(destPath)) {
    process.stdout.write("Codebuff: binary already exists ✓\n");
    return;
  }

  process.stdout.write("Codebuff: downloading binary...\n");
  await fs.promises.mkdir(destDir, { recursive: true });

  await new Promise((resolve, reject) => {
    const get = url.startsWith("https:") ? https.get : http.get;

    get(url, (res) => {
      if (res.statusCode !== 200) {
        reject(new Error(`HTTP ${res.statusCode} ${res.statusMessage}`));
        return;
      }

      const onDone = () => {
        resolve();
      };
      const onErr = (err) => {
        console.error("Codebuff: extraction error:", err);
        reject(err);
      };

      if (ext === "zip") {
        res
          .pipe(unzip.Extract({ path: destDir }))
          .once("close", onDone)
          .once("error", onErr);
      } else {
        const gunzip = zlib.createGunzip();
        const untar = tar
          .x({ C: destDir, strip: 0 })
          .once("close", onDone)
          .once("error", onErr);

        res.pipe(gunzip).pipe(untar);
      }
    }).on("error", (err) => {
      console.error("Codebuff: download error:", err);
      reject(err);
    });
  });

  // verify before chmod
  if (!fs.existsSync(destPath)) {
    console.error("Codebuff: extraction finished but binary not found at", destPath);
    console.error("Codebuff: contents of", destDir, ":", fs.readdirSync(destDir));
    throw new Error(
      `Extraction finished but ${destPath} does not exist.\n` +
        'Archive must contain a single top-level file named "' +
        binary +
        '".',
    );
  }

  if (!isWin) {
    fs.chmodSync(destPath, 0o755);
  }
  process.stdout.write("Codebuff installed successfully ✓\n");
})().catch((err) => {
  console.error("Codebuff postinstall failed:", err.message);
  console.error("You can retry with: npm rebuild codebuff --force");
  process.exit(1);
});