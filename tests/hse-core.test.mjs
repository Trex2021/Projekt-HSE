import assert from "node:assert/strict";
import test from "node:test";

import {
  buildFindingsCsv,
  calculateRpn,
  escapeCsv,
  getRiskBand,
  isOverdue,
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

test("escapes CSV cells and emits an Excel-friendly UTF-8 BOM", () => {
  assert.equal(escapeCsv('کابل "معیوب", طبقه -۳'), '"کابل ""معیوب"", طبقه -۳"');
  const csv = buildFindingsCsv([
    {
      title: "کابل معیوب",
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
  assert.match(csv, /کابل معیوب/);
  assert.match(csv, /,60,/);
});
