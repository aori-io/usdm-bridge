#!/usr/bin/env bun
/**
 * Monorepo task runner for the USDM bridge publishable packages.
 *
 * This gives every package-management command a single entrypoint with an
 * explicit "which package?" indicator, so build/publish/etc. can target one
 * package or both at once.
 *
 * Usage:
 *   bun scripts/pkg.ts <command> [target] [-- ...passthroughArgs]
 *
 * Commands:
 *   build        Build the package(s) with tsup
 *   dev          Watch-build a single package (requires an explicit target)
 *   type-check   Run `tsc --noEmit`
 *   lint         Run the package `lint` script when it exists
 *   clean        Remove each target's dist/ build output
 *   version      Bump a single package's version:
 *                  version <widget|sdk> <patch|minor|major|x.y.z>
 *   publish      Build then `bun publish` the package(s)
 *                  (passthrough e.g. `-- --dry-run` or `-- --tag next`)
 *   help         Show this message
 *
 * Targets:
 *   widget | sdk | all   (default: all; `dev` and `version` require one)
 *
 * Examples:
 *   bun scripts/pkg.ts build            # build both packages
 *   bun scripts/pkg.ts build sdk        # build only the SDK
 *   bun scripts/pkg.ts dev widget       # watch-build the widget
 *   bun scripts/pkg.ts version sdk minor
 *   bun scripts/pkg.ts publish all -- --dry-run
 */

import { spawnSync } from "bun";
import { existsSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";

const ROOT = join(import.meta.dir, "..");

type PkgKey = "widget" | "sdk";

/** Friendly target name -> workspace directory (relative to repo root). */
const PACKAGES: Record<PkgKey, string> = {
  widget: "widget",
  sdk: "sdk",
};

const dim = (s: string) => `\x1b[2m${s}\x1b[0m`;
const cyan = (s: string) => `\x1b[36m${s}\x1b[0m`;
const red = (s: string) => `\x1b[31m${s}\x1b[0m`;
const green = (s: string) => `\x1b[32m${s}\x1b[0m`;

function pkgDir(key: PkgKey): string {
  return join(ROOT, PACKAGES[key]);
}

function readPkgJson(key: PkgKey): { name?: string; scripts?: Record<string, string> } {
  return JSON.parse(readFileSync(join(pkgDir(key), "package.json"), "utf8"));
}

function fail(message: string): never {
  console.error(red(`\n✗ ${message}`));
  process.exit(1);
}

/** Run a command in a package dir, inheriting stdio; exit on failure. */
function run(cmd: string[], cwd: string): void {
  console.log(`\n${cyan("$ " + cmd.join(" "))} ${dim(`(${cwd.replace(ROOT + "/", "") || "."})`)}`);
  const res = spawnSync(cmd, { cwd, stdout: "inherit", stderr: "inherit", stdin: "inherit" });
  if (!res.success) {
    fail(`command failed: ${cmd.join(" ")}`);
  }
}

/** Run a package.json script in the given package via bun. */
function runPkgScript(key: PkgKey, script: string, extra: string[] = []): void {
  run(["bun", "run", script, ...extra], pkgDir(key));
}

function hasScript(key: PkgKey, script: string): boolean {
  return Boolean(readPkgJson(key).scripts?.[script]);
}

function resolveTargets(target: string | undefined, opts: { single?: boolean } = {}): PkgKey[] {
  if (!target || target === "all") {
    if (opts.single) fail("This command needs an explicit target: widget | sdk");
    return ["widget", "sdk"];
  }
  if (target === "widget" || target === "sdk") return [target];
  fail(`Unknown target "${target}". Use one of: widget | sdk | all`);
}

function printHelp(): void {
  const header = readFileSync(join(import.meta.dir, "pkg.ts"), "utf8")
    .split("\n")
    .filter((l) => l.startsWith(" *") || l.startsWith("/**"))
    .map((l) => l.replace(/^\/\*\*?/, "").replace(/^ \*\/?/, "").replace(/^ ?/, ""))
    .join("\n");
  console.log(header.trim());
}

function main(): void {
  const argv = process.argv.slice(2);
  const [command, ...rest] = argv;

  // Split the remaining args into positionals (command target/bump) and
  // passthrough args forwarded to the underlying tool (e.g. npm publish flags).
  // Everything from the first flag (`-x`/`--x`) or an explicit `--` separator
  // onward is treated as passthrough. This works whether the tool is invoked
  // directly or via `bun run <script> -- <flags>` (bun strips the `--`).
  // Passthrough examples for publish: `--dry-run`, `--tag next`, `--access public`.
  const positional: string[] = [];
  const passthrough: string[] = [];
  let inPassthrough = false;
  for (const arg of rest) {
    if (arg === "--") {
      inPassthrough = true;
      continue;
    }
    if (!inPassthrough && arg.startsWith("-")) inPassthrough = true;
    (inPassthrough ? passthrough : positional).push(arg);
  }

  const [target, ...restPositional] = positional;

  switch (command) {
    case undefined:
    case "help":
    case "-h":
    case "--help":
      printHelp();
      return;

    case "build": {
      for (const key of resolveTargets(target)) runPkgScript(key, "build", passthrough);
      console.log(green("\n✓ build complete"));
      return;
    }

    case "dev": {
      const [key] = resolveTargets(target, { single: true });
      runPkgScript(key, "dev", passthrough);
      return;
    }

    case "type-check": {
      for (const key of resolveTargets(target)) {
        if (hasScript(key, "type-check")) runPkgScript(key, "type-check", passthrough);
        else console.log(dim(`(skipping ${key}: no type-check script)`));
      }
      console.log(green("\n✓ type-check complete"));
      return;
    }

    case "lint": {
      for (const key of resolveTargets(target)) {
        if (hasScript(key, "lint")) runPkgScript(key, "lint", passthrough);
        else console.log(dim(`(skipping ${key}: no lint script)`));
      }
      console.log(green("\n✓ lint complete"));
      return;
    }

    case "clean": {
      for (const key of resolveTargets(target)) {
        const dist = join(pkgDir(key), "dist");
        if (existsSync(dist)) {
          rmSync(dist, { recursive: true, force: true });
          console.log(dim(`removed ${dist.replace(ROOT + "/", "")}`));
        }
      }
      console.log(green("\n✓ clean complete"));
      return;
    }

    case "version": {
      const [key] = resolveTargets(target, { single: true });
      const bump = restPositional[0];
      if (!bump) fail("version needs a bump: patch | minor | major | <x.y.z>");
      // --no-git-tag-version: don't create per-package tags in the monorepo.
      run(["npm", "version", bump, "--no-git-tag-version"], pkgDir(key));
      console.log(green(`\n✓ bumped ${key} version (${bump})`));
      return;
    }

    case "publish": {
      const keys = resolveTargets(target);
      // Always build fresh before publishing.
      for (const key of keys) runPkgScript(key, "build");
      for (const key of keys) {
        // Prefer `bun publish` over `npm publish` so workspace:* deps (e.g.
        // widget → usdm-bridge-sdk) are rewritten to the concrete version in
        // the published tarball.
        run(["bun", "publish", ...passthrough], pkgDir(key));
        console.log(green(`\n✓ published ${readPkgJson(key).name}`));
      }
      return;
    }

    default:
      fail(`Unknown command "${command}". Run \`bun scripts/pkg.ts help\`.`);
  }
}

main();
