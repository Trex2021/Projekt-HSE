import assert from "node:assert/strict";
import test from "node:test";

import {
  buildFindingsCsv,
  calculateRpn,
  escapeCsv,
  getRiskBand,
  isOverdue,
  sortFindingsForDisplay,
  summarizeFindings,
} from "../lib/hse-core.ts";

test("calculates and clamps FMEA RPN values", () => {
  assert.equal(calculateRpn(5, 4, 3), 60);
  assert.equal(calculateRpn(8, 0, 2), 10);
  assert.equal(calculateRpn(Number.NaN, 2, 2), 0);
});

test("classifies risk bands at exact boundaries", () => {
  assert.equal(getRiskBand(24), "low");
  assert.equal(getRiskBand(25), "medium");
  assert.equal(getRiskBand(74), "medium");
  assert.equal(getRiskBand(75), "high");
});

test("detects overdue findings but ignores closed findings", () => {
  const now = new Date("2026-08-14T12:00:00Z");
  assert.equal(isOverdue("2026-08-13", "open", now), true);
  assert.equal(isOverdue("2026-08-13", "closed", now), false);
  assert.equal(isOverdue("2026-08-15", "open", now), false);
});

test("summarizes finding status, risk, and deadlines", () => {
  const findings = [
    {
      status: "open",
      dueDate: "2026-08-13",
      severity: 5,
      occurrence: 5,
      detection: 4,
    },
    {
      status: "in_progress",
      dueDate: "2026-08-20",
      severity: 3,
      occurrence: 3,
      detection: 3,
    },
    {
      status: "closed",
      dueDate: "2026-08-01",
      severity: 2,
      occurrence: 2,
      detection: 2,
    },
  ];

  assert.deepEqual(
    summarizeFindings(findings, new Date("2026-08-14T12:00:00Z")),
    {
      total: 3,
      open: 1,
      inProgress: 1,
      closed: 1,
      highRisk: 1,
      overdue: 1,
    },
  );
});

test("sorts findings by overdue, open, in-progress, and closed status", () => {
  const now = new Date("2026-08-14T12:00:00Z");
  const findings = [
    { id: "closed-new", status: "closed", dueDate: "2026-08-01", createdAt: "2026-08-12T08:00:00Z" },
    { id: "open-new", status: "open", dueDate: "2026-08-20", createdAt: "2026-08-13T08:00:00Z" },
    { id: "overdue-new", status: "in_progress", dueDate: "2026-08-13", createdAt: "2026-08-11T08:00:00Z" },
    { id: "in-progress-old", status: "in_progress", dueDate: "2026-08-20", createdAt: "2026-08-09T08:00:00Z" },
    { id: "closed-old", status: "closed", dueDate: "2026-08-01", createdAt: "2026-08-08T08:00:00Z" },
    { id: "overdue-old", status: "open", dueDate: "2026-08-10", createdAt: "2026-08-10T08:00:00Z" },
    { id: "open-old", status: "open", dueDate: "2026-08-21", createdAt: "2026-08-12T08:00:00Z" },
    { id: "in-progress-new", status: "in_progress", dueDate: "2026-08-22", createdAt: "2026-08-13T09:00:00Z" },
  ];

  const sorted = sortFindingsForDisplay(findings, now);

  assert.deepEqual(
    sorted.map((finding) => finding.id),
    [
      "overdue-old",
      "overdue-new",
      "open-old",
      "open-new",
      "in-progress-old",
      "in-progress-new",
      "closed-old",
      "closed-new",
    ],
  );
  assert.equal(findings[0].id, "closed-new", "input order should stay unchanged");
});

test("escapes CSV cells and emits an Excel-friendly UTF-8 BOM", () => {
  assert.equal(escapeCsv('کابل "معیوب", طبقه -۳'), '"کابل ""معیوب"", طبقه -۳"');
  const csv = buildFindingsCsv([
    {
      title: "کابل معیوب",
      description: 'اتصال مستقیم کابل، نیازمند "اصلاح فوری" است.\nبرق قطع شود.',
      location: "طبقه -۳",
      contractor: "پیمانکار نمونه",
      category: "برق",
      severity: 5,
      occurrence: 3,
      detection: 4,
      status: "open",
      dueDate: "2026-08-20",
      responsible: "سرپرست نمونه",
      createdAt: "2026-08-14",
    },
  ]);
  assert.equal(csv.charCodeAt(0), 0xfeff);
  assert.match(csv, /^\uFEFFعنوان,توضیحات,محل,/);
  assert.match(csv, /کابل معیوب/);
  assert.match(csv, /"اتصال مستقیم کابل، نیازمند ""اصلاح فوری"" است\.\nبرق قطع شود\."/);
  assert.match(csv, /,60,/);
});
