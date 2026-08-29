import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import test from "node:test";

const roots = ["../app", "../components", "../lib"];

const files = roots.flatMap((root) =>
  collect(fileURLToPath(new URL(root, import.meta.url))),
);

test("Wyscout credentials are absent from browser source", () => {
  for (const path of files) {
    const source = readFileSync(path, "utf8");
    assert.doesNotMatch(source, /WYSCOUT_API_(?:USERNAME|PASSWORD)/, path);
  }
});

function collect(path: string): string[] {
  if (statSync(path).isFile())
    return /\.(?:ts|tsx|js|jsx)$/.test(path) ? [path] : [];
  return readdirSync(path).flatMap((name) => collect(`${path}/${name}`));
}
