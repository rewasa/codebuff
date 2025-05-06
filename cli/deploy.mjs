#!/usr/bin/env bun
import { spawnSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import * as dotenv from "dotenv";

// Get deploy URL from command line args first, then fall back to env
const deployUrlArg = process.argv[3]; // After script name and version
let deployUrl = deployUrlArg;

if (!deployUrl) {
  // Load environment variables from .env.production as fallback
  dotenv.config({ path: ".env.production" });
  deployUrl = process.env.NEXT_PUBLIC_APP_URL;
}

if (!deployUrl) {
  console.error("Error: No deploy URL provided.");
  console.error("Please either:");
  console.error("1. Pass URL as argument: deploy.mjs <version> <url>");
  console.error("2. Set NEXT_PUBLIC_APP_URL in .env.production");
  process.exit(1);
}

console.log(`Using deploy URL: ${deployUrl}`);

////////////////////////////////////////////////////////////////////////////////
// helpers
////////////////////////////////////////////////////////////////////////////////
const sh = (cmd, opts = {}) => {
  const [bin, ...args] = cmd.split(" ");
  const res = spawnSync(bin, args, { stdio: "inherit", ...opts });
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
  deployUrl,
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
  console.error("Usage: node deploy.mjs <version>");
  process.exit(1);
}
console.log(`▶ Deploying v${ver}`);

////////////////////////////////////////////////////////////////////////////////
// 1 — bump versions
////////////////////////////////////////////////////////////////////////////////
// npm-app/package.json is already bumped by the bump script
bumpJSON(join(projectRoot, "npm-installer/package.json"), ver);

////////////////////////////////////////////////////////////////////////////////
// 2 — verify binaries are available (optional)
////////////////////////////////////////////////////////////////////////////////
const skipArg = process.argv.includes("--skip-verify");

if (skipArg) {
  console.log("▶ Verifying binaries are available …");

  // List of all platform+arch combinations we support
  const platforms = [
    { plat: "darwin", arch: "x64" },
    { plat: "darwin", arch: "arm64" },
    { plat: "linux", arch: "x64" },
    { plat: "linux", arch: "arm64" },
    { plat: "win32", arch: "x64" }
  ];

  // Check each binary
  for (const { plat, arch } of platforms) {
    const ext = plat === "win32" ? "zip" : "tar.gz";
    const url = `${deployUrl}/codebuff-${plat}-${arch}.${ext}`;
    console.log(`  → checking ${url}`);
    const { status } = spawnSync("curl", ["-f", "-I", url], {
      stdio: "ignore",
    });

    if (status !== 0) {
      console.error(`Error: Binary not found at ${url}`);
      console.error(
        "Make sure all platform binaries are built and uploaded before publishing",
      );
      process.exit(1);
    }
  }
} else {
  console.log("▶ Skipping binary verification");
}

////////////////////////////////////////////////////////////////////////////////
// 3 — publish to npm
////////////////////////////////////////////////////////////////////////////////
console.log("▶ Publishing to npm …");

// Install dependencies
sh("npm install --ignore-scripts", { cwd: join(here, "npm-installer") });

// Publish
sh("npm publish --access public", {
  cwd: join(here, "npm-installer"),
  env: {
    ...process.env,
    NEXT_PUBLIC_APP_URL: deployUrl,
    CODEBUFF_INSTALL_TYPE: "deploy",
  },
});

console.log(`✅ Published codebuff v${ver} to npm`);