import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const projectRoot = new URL("../", import.meta.url);

test("keeps the on-screen report preview compact without clipping print output", async () => {
  const [css, source] = await Promise.all([
    readFile(new URL("app/globals.css", projectRoot), "utf8"),
    readFile(new URL("app/page.tsx", projectRoot), "utf8"),
  ]);

  assert.match(css, /\.reports-page\s*\{[^}]*minmax\(250px, 300px\)/s);
  assert.match(css, /\.print-report\s*\{[^}]*max-height:\s*min\(760px/s);
  assert.match(css, /\.print-report\s*\{[^}]*overflow-y:\s*auto/s);
  assert.match(css, /\.findings-report-table td:nth-child\(2\)\s*\{[^}]*white-space:\s*pre-wrap/s);
  assert.match(source, /<th>عنوان<\/th><th>توضیحات<\/th>/);
  assert.match(source, /finding\.description \|\| "توضیحی ثبت نشده است\."/);
  assert.match(source, /فهرست کامل موارد ایمنی، توضیحات ثبت‌شده و امتیازهای FMEA/);
  assert.match(css, /@media print[\s\S]*\.print-report\s*\{[^}]*max-height:\s*none/s);
  assert.match(css, /@media print[\s\S]*\.print-report\s*\{[^}]*overflow:\s*visible/s);
});
