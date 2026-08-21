import assert from "node:assert/strict";
import test from "node:test";

import { buildFindingsCsv } from "../lib/hse-core.ts";
import { buildInspectionsCsv } from "../lib/hse-inspections.ts";
import { parseCsv, parseRestoreFile } from "../lib/hse-backup.ts";

const ids = () => {
  let index = 0;
  return () => `restored-${++index}`;
};

const finding = {
  id: "finding-1",
  title: 'کابل "معیوب"، طبقه ۳-',
  description: "توضیح کامل باید در JSON و CSV نگهداری شود.",
  location: "طبقه ۳-, بخش شرقی",
  contractor: "پیمانکار نمونه",
  category: "برق",
  severity: 5,
  occurrence: 4,
  detection: 3,
  status: "in_progress",
  dueDate: "2026-08-20",
  responsible: "سرپرست برق",
  createdAt: "2026-08-14T08:00:00.000Z",
  updatedAt: "2026-08-14T09:00:00.000Z",
};

const inspection = {
  id: "inspection-1",
  templateId: "ppe",
  templateName: "تجهیزات حفاظت فردی",
  location: "طبقه ۳-, بخش شرقی",
  inspector: "احسان",
  notes: 'یادداشت دارای ویرگول، و "نقل‌قول"',
  items: [
    { label: "کلاه ایمنی", result: "pass" },
    { label: "دستکش سالم", result: "fail" },
    { label: "محافظ شنوایی", result: "na" },
  ],
  createdAt: "2026-08-14T08:00:00.000Z",
  updatedAt: "2026-08-14T09:00:00.000Z",
};

test("restores a full JSON backup while preserving all checklist outcomes", () => {
  const result = parseRestoreFile(
    JSON.stringify({
      app: "HSE FieldLog",
      version: 1,
      findings: [finding],
      inspections: [inspection],
    }),
    ids(),
  );

  assert.equal(result.format, "json");
  assert.deepEqual(result.findings, [finding]);
  assert.deepEqual(result.inspections, [inspection]);
  assert.deepEqual(result.inspections[0].items.map((item) => item.result), [
    "pass",
    "fail",
    "na",
  ]);
});

test("detects and restores the findings CSV exported by the app", () => {
  const result = parseRestoreFile(buildFindingsCsv([finding]), ids());
  assert.equal(result.format, "findings-csv");
  assert.equal(result.inspections, undefined);
  assert.equal(result.findings.length, 1);
  assert.equal(result.findings[0].title, finding.title);
  assert.equal(result.findings[0].description, finding.description);
  assert.equal(result.findings[0].location, finding.location);
  assert.equal(result.findings[0].status, "in_progress");
  assert.equal(result.findings[0].severity, 5);
});

test("detects, groups, and restores the inspections CSV exported by the app", () => {
  const result = parseRestoreFile(buildInspectionsCsv([inspection]), ids());
  assert.equal(result.format, "inspections-csv");
  assert.equal(result.findings, undefined);
  assert.equal(result.inspections.length, 1);
  assert.equal(result.inspections[0].templateId, "ppe");
  assert.equal(result.inspections[0].notes, inspection.notes);
  assert.deepEqual(result.inspections[0].items, inspection.items);
});

test("accepts tab-separated Excel-style backups and Persian digits", () => {
  const tsv = [
    "عنوان\tمحل\tپیمانکار\tدسته‌بندی\tشدت\tوقوع\tکشف\tRPN\tسطح ریسک\tوضعیت\tمهلت\tمسئول\tتاریخ ثبت",
    "مورد تست\tکارگاه\tپیمانکار\tبرق\t۵\t۴\t۳\t۶۰\tمتوسط\tباز\t2026-08-20\tسرپرست\t2026-08-14",
  ].join("\r\n");
  const result = parseRestoreFile(tsv, ids());
  assert.equal(result.findings[0].description, "");
  assert.equal(result.findings[0].severity, 5);
  assert.equal(result.findings[0].occurrence, 4);
  assert.equal(result.findings[0].detection, 3);
});

test("parses quoted commas, newlines, and escaped quotes", () => {
  assert.deepEqual(parseCsv('نام,توضیح\r\nنمونه,"خط اول، تست\nخط دوم ""مهم"""'), [
    ["نام", "توضیح"],
    ["نمونه", 'خط اول، تست\nخط دوم "مهم"'],
  ]);
});

test("rejects unrelated or malformed restore files", () => {
  assert.throws(() => parseRestoreFile("این فایل پشتیبان نیست", ids()), /نوع CSV شناخته نشد/);
  assert.throws(() => parseRestoreFile('{"app":"Other"}', ids()), /متعلق به HSE FieldLog نیست/);
  assert.throws(() => parseRestoreFile("", ids()), /خالی است/);
});
