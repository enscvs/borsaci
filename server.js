"use strict";

const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");

function tryLegacyBuild() {
  const publicDir = path.join(__dirname, "public");
  const source = path.join(publicDir, "app.js");
  const compat = path.join(publicDir, "app.compat.js");
  const runtime = path.join(publicDir, "app.runtime.js");
  const polyfills = path.join(publicDir, "legacy-polyfills.js");

  if (!fs.existsSync(source) || !fs.existsSync(polyfills)) {
    console.warn("LEGACY BUILD: source/polyfill missing; original app.js kept.");
    return false;
  }

  try {
    try { fs.unlinkSync(compat); } catch {}
    try { fs.unlinkSync(runtime); } catch {}

    const attempts = [
      ["pnpm", ["dlx", "esbuild@0.25.9", source, "--target=safari10", `--outfile=${compat}`]],
      ["npx", ["--yes", "esbuild@0.25.9", source, "--target=safari10", `--outfile=${compat}`]],
    ];

    let built = false;
    for (const [command, args] of attempts) {
      const result = spawnSync(command, args, {
        cwd: __dirname,
        stdio: "inherit",
        timeout: 120000,
      });
      if (result.status === 0 && fs.existsSync(compat) && fs.statSync(compat).size > 1000) {
        built = true;
        break;
      }
    }

    if (!built) {
      console.warn("LEGACY BUILD: esbuild unavailable; original app.js kept.");
      try { fs.unlinkSync(compat); } catch {}
      return false;
    }

    const polyfillText = fs.readFileSync(polyfills, "utf8");
    const compatText = fs.readFileSync(compat, "utf8");
    fs.writeFileSync(runtime, `${polyfillText}\n${compatText}`, "utf8");

    // Only replace the served file after a complete successful build.
    fs.renameSync(runtime, source);
    try { fs.unlinkSync(compat); } catch {}

    const builtText = fs.readFileSync(source, "utf8");
    if (/\d_\d/.test(builtText)) {
      throw new Error("numeric separators remain after legacy build");
    }

    console.log(`LEGACY BUILD: Safari 10 app.js ready (${Buffer.byteLength(builtText)} bytes).`);
    return true;
  } catch (error) {
    console.error("LEGACY BUILD ERROR:", error.message);
    try { fs.unlinkSync(compat); } catch {}
    try { fs.unlinkSync(runtime); } catch {}
    return false;
  }
}

tryLegacyBuild();
require("./server-core.js");
