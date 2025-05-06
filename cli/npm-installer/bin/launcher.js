#!/usr/bin/env node
const { join } = require("path");
const { spawnSync } = require("child_process");
const { platform } = require("os");

const exe = join(__dirname, platform() === "win32" ? "codebuff.exe" : "codebuff");

const res = spawnSync(exe, process.argv.slice(2), {
  stdio: "inherit",
  env: { ...process.env, CODEBUFF_VERSION: require("../package.json").version },
});

if (res.error) {
  console.error("\n❌  Codebuff failed to start");
  console.error("    Binary attempted:", exe);
  console.error("    Reason:", res.error.message);

  process.exit(1);
}

process.exit(res.status ?? 1);