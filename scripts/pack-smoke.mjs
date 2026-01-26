import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

function run(cmd, args, options = {}) {
  return execFileSync(cmd, args, { stdio: "inherit", ...options });
}

function runCapture(cmd, args, options = {}) {
  return execFileSync(cmd, args, { encoding: "utf8", ...options });
}

const repoRoot = process.cwd();
const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "opencode-pack-smoke-"));
const tmpProject = path.join(tmpRoot, "project");
fs.mkdirSync(tmpProject);

// Build + pack
run("npm", ["run", "build"], { cwd: repoRoot });
const packOutput = runCapture("npm", ["pack"], { cwd: repoRoot });
const tarballName = packOutput.trim().split(/\r?\n/).filter(Boolean).pop();
if (!tarballName) {
  throw new Error("npm pack did not produce a tarball name");
}
const tarballPath = path.join(repoRoot, tarballName);

// Init a clean project and install tarball
run("npm", ["init", "-y"], { cwd: tmpProject });
run("npm", ["install", "--no-fund", "--no-audit", tarballPath], { cwd: tmpProject });

// Smoke import from installed package (requires peers to resolve in host env)
run(
  "node",
  [
    "--input-type=module",
    "-e",
    "import { GroupDiscussPlugin } from 'opencode-group-discuss'; if (typeof GroupDiscussPlugin !== 'function') { throw new Error('GroupDiscussPlugin is not a function'); } console.log('pack:smoke ok');",
  ],
  { cwd: tmpProject }
);
