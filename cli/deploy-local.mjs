#!/usr/bin/env bun
import { spawnSync, spawn } from "node:child_process";
import {
  readFileSync,
  writeFileSync,
  mkdirSync,
  existsSync,
  statSync,
} from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import os from "node:os";
import { gzipSync } from "node:zlib";
import { createGzip } from "node:zlib";
import { pipeline } from "node:stream/promises";
import { createReadStream, createWriteStream } from "node:fs";
import * as dotenv from "dotenv";

// Get deploy URL from command line args first, then fall back to env
const deployUrlArg = process.argv[3]; // After script name and version
let deployUrl = deployUrlArg;

if (!deployUrl) {
  // Load environment variables from .env.local as fallback
  dotenv.config({ path: ".env.local" });
  deployUrl = process.env.NEXT_PUBLIC_APP_URL;
}

if (!deployUrl) {
  console.error("Error: No deploy URL provided.");
  console.error("Please either:");
  console.error("1. Pass URL as argument: deploy-local.mjs <version> <url>");
  console.error("2. Set NEXT_PUBLIC_APP_URL in .env.local");
  process.exit(1);
}

// Extract port from NEXT_PUBLIC_APP_URL
const baseUrl = new URL(deployUrl);
const port = baseUrl.port;

////////////////////////////////////////////////////////////////////////////////
// helpers
////////////////////////////////////////////////////////////////////////////////
const sh = (cmd, opts = {}) => {
  console.log(`Running command: ${cmd}`);
  const res = spawnSync(cmd, [], {
    stdio: "inherit",
    shell: true, // Run command in a shell (for PATH resolution)
    ...opts,
  });
  if (res.status !== 0) {
    throw new Error(`❌ "${cmd}" exited ${res.status}`);
  }
};

const here = dirname(fileURLToPath(import.meta.url));
const projectRoot = join(here, '..');

const bumpJSON = (file, version) => {
  const json = JSON.parse(readFileSync(file, "utf8"));
  json.version = version;
  writeFileSync(file, JSON.stringify(json, null, 2));
};

////////////////////////////////////////////////////////////////////////////////
// postinstall.js placeholder replacement
////////////////////////////////////////////////////////////////////////////////
const postinstallPath = join(here, "npm-installer/scripts/postinstall.js");
const originalPostinstall = readFileSync(postinstallPath, "utf8");

// Replace placeholder with actual download base URL
const modifiedPostinstall = originalPostinstall.replace(
  "__CODEBUFF_DOWNLOAD_BASE_PLACEHOLDER__",
  process.env.NEXT_PUBLIC_APP_URL,
);
writeFileSync(postinstallPath, modifiedPostinstall);

// Function to restore original postinstall.js
const restorePostinstall = () => {
  writeFileSync(postinstallPath, originalPostinstall);
};

// Ensure we restore postinstall.js on exit
process.on("exit", restorePostinstall);
process.on("SIGINT", () => {
  restorePostinstall();
  process.exit(1);
});

////////////////////////////////////////////////////////////////////////////////
// 0 — get version
////////////////////////////////////////////////////////////////////////////////
const ver = process.argv[2];
if (!ver) {
  console.error("Usage: node deploy-local.mjs <version>");
  process.exit(1);
}
console.log(`▶ Deploying v${ver}`);

////////////////////////////////////////////////////////////////////////////////
// 1 — bump versions
////////////////////////////////////////////////////////////////////////////////
// npm-app/package.json is already bumped by the bump script
bumpJSON(join(here, "npm-installer/package.json"), ver);

////////////////////////////////////////////////////////////////////////////////
// 2 — build Bun binary
////////////////////////////////////////////////////////////////////////////////
console.log("▶ Building Bun executable …");
const binaryPath = join(here, "npm-installer/bin/codebuff");
sh("bun build src/index.ts --compile --outfile ../cli/npm-installer/bin/codebuff", {
  cwd: join(projectRoot, "npm-app"),
});

// Check if binary was created
if (!existsSync(binaryPath)) {
  console.error("❌ Binary not found after build at:", binaryPath);
  console.error("The bun build command may have failed silently.");
  process.exit(1);
}

// Check binary size
const binaryStats = statSync(binaryPath);
if (binaryStats.size === 0) {
  console.error("❌ Binary file exists but is empty:", binaryPath);
  process.exit(1);
}

console.log(`✓ Binary created successfully (${binaryStats.size} bytes)`);

////////////////////////////////////////////////////////////////////////////////
// 3 — bundle into bundles/
////////////////////////////////////////////////////////////////////////////////
const plat =
  os.platform() === "win32"
    ? "win32"
    : os.platform() === "darwin"
      ? "darwin"
      : "linux";
const arch = os.arch(); // x64 | arm64

const bundleDir = join(projectRoot, "bundles");
mkdirSync(bundleDir, { recursive: true });

if (plat === "win32") {
  // zip (use PowerShell Compress-Archive if available)
  const zip = join(bundleDir, `codebuff-${plat}-${arch}.zip`);
  sh(
    `powershell -NoLogo -Command "Compress-Archive -Path npm-installer/bin/codebuff.exe -DestinationPath ${zip}"`,
    { shell: true },
  );
} else {
  const tarPath = join(bundleDir, `codebuff-${plat}-${arch}.tar.gz`);
  
  // Verify source file exists and is readable
  if (!existsSync(join(here, "npm-installer/bin/codebuff"))) {
    console.error("❌ Source file not found:", join(here, "npm-installer/bin/codebuff"));
    process.exit(1);
  }

  // Create tar.gz containing a single file "codebuff"
  sh(`tar -C ${join(here, "npm-installer/bin")} -czf ${tarPath} codebuff`);

  // Verify the tarball exists and has content
  if (!existsSync(tarPath)) {
    console.error("❌ Failed to create tarball at", tarPath);
    process.exit(1);
  }
  const stats = statSync(tarPath);
  if (stats.size === 0) {
    console.error("❌ Created tarball is empty:", tarPath);
    process.exit(1);
  }
  console.log(`  → created ${tarPath} (${stats.size} bytes)`);
}
console.log("  → bundle ready");

////////////////////////////////////////////////////////////////////////////////
// 4 — (ensure) http-server at specified port
////////////////////////////////////////////////////////////////////////////////
// Kill any existing server on the port
const { stdout: pid } = spawnSync("lsof", ["-t", `-i:${port}`], {
  encoding: "utf8",
});
if (pid.trim()) {
  console.log(`▶ Killing existing server on port ${port}...`);
  sh(`kill ${pid.trim()}`);
  // Give it a moment to die
  await new Promise((resolve) => setTimeout(resolve, 500));
}

console.log(`▶ Starting http-server on port ${port} …`);
spawn("npx", ["--yes", "http-server", "bundles", "-p", port], {
  stdio: "ignore",
  detached: true,
}).unref();

// Give the server time to start up and index files
console.log("  → waiting for server to start...");
await new Promise((resolve) => setTimeout(resolve, 5000));

// Test if the server can serve our file
const testUrl = `${process.env.NEXT_PUBLIC_APP_URL}/codebuff-${plat}-${arch}.${plat === "win32" ? "zip" : "tar.gz"}`;
console.log(`  → testing server with curl ${testUrl}`);
sh(`curl -f ${testUrl} -o /dev/null`, { stdio: "inherit" });

////////////////////////////////////////////////////////////////////////////////
// 5 — pack wrapper & reinstall globally
////////////////////////////////////////////////////////////////////////////////
console.log("▶ Packing wrapper …");
sh("npm install -ddd --ignore-scripts", { cwd: join(here, "npm-installer") });
const { stdout: tgz } = spawnSync("npm", ["pack", "--silent"], {
  cwd: join(here, "npm-installer"),
  encoding: "utf8",
});
const tarballRel = tgz.trim();
const tarball = join(here, "npm-installer", tarballRel); // ← absolute path

console.log("  →", tarball);

console.log("▶ Installing globally from tarball …");
sh("npm uninstall -g codebuff", { stdio: "ignore" });
sh(`npm --foreground-scripts install -g ${tarball}`, {
  env: {
    ...process.env,
    NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL,
    CODEBUFF_INSTALL_TYPE: "deploy",
  },
});

////////////////////////////////////////////////////////////////////////////////
// 6 — smoke test
////////////////////////////////////////////////////////////////////////////////
console.log("▶ Smoke test:");

// Get global npm root directory
const { stdout: npmRoot } = spawnSync("npm", ["root", "-g"], {
  encoding: "utf8",
});

// Construct path to globally installed launcher script
const launcherPath = join(npmRoot.trim(), "codebuff/bin/launcher.js");

// Run the launcher script directly with node
sh(`node ${launcherPath} --version`);

console.log(`✅ CodeBuff v${ver} deployed locally`);