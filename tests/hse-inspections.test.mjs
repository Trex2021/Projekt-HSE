import assert from "node:assert/strict";
import test from "node:test";

import {
  buildInspectionsCsv,
  countInspectionResults,
  removeInspection,
  upsertInspection,
} from "../lib/hse-inspections.ts";

const original = {
  id: "inspection-1",
  templateId: "ppe",
  templateName: "تجهیزات حفاظت فردی",
  location: "طبقه ۳-",
  inspector: "احسان",
  notes: "بازرسی اولیه",
  items: [
    { label: "کلاه ایمنی", result: "pass" },
    { label: "دستکش سالم", result: "fail" },
    { label: "محافظ شنوایی", result: "na" },
  ],
  createdAt: "2026-08-14T08:00:00.000Z",
};

test("counts all three checklist outcomes", () => {
  assert.deepEqual(countInspectionResults(original.items), {
    pass: 1,
    fail: 1,
    na: 1,
  });
});

test("updates one inspection without changing its position or id", () => {
  const second = { ...original, id: "inspection-2", location: "طبقه ۴-" };
  const edited = {
    ...original,
    notes: "اصلاح شد",
    items: original.items.map((item) =>
      item.result === "fail" ? { ...item, result: "pass" } : item,
    ),
    updatedAt: "2026-08-14T09:00:00.000Z",
  };

  const result = upsertInspection([original, second], edited, original.id);
  assert.equal(result.length, 2);
  assert.equal(result[0].id, original.id);
  assert.equal(result[0].notes, "اصلاح شد");
  assert.equal(result[0].createdAt, original.createdAt);
  assert.equal(result[1].id, second.id);
});

test("adds new inspections first and removes only the selected record", () => {
  const added = { ...original, id: "inspection-new" };
  const inserted = upsertInspection([original], added, null);
  assert.deepEqual(inserted.map((item) => item.id), ["inspection-new", "inspection-1"]);
  assert.deepEqual(removeInspection(inserted, original.id).map((item) => item.id), [
    "inspection-new",
  ]);
});

test("exports every checklist item to an Excel-friendly CSV", () => {
  const csv = buildInspectionsCsv([original]);
  assert.equal(csv.charCodeAt(0), 0xfeff);
  assert.match(csv, /تجهیزات حفاظت فردی/);
  assert.match(csv, /دستکش سالم/);
  assert.match(csv, /عدم انطباق/);
  assert.match(csv, /نامرتبط/);
  assert.equal(csv.trim().split("\r\n").length, 4);
});
