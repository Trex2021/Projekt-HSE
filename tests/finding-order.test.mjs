import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const projectRoot = new URL("../", import.meta.url);

test("uses the status-priority sorter for the safety findings list", async () => {
  const source = await readFile(new URL("app/page.tsx", projectRoot), "utf8");

  assert.match(source, /sortFindingsForDisplay\(matches\)/);
  assert.doesNotMatch(source, /b\.updatedAt\.localeCompare\(a\.updatedAt\)/);
});
