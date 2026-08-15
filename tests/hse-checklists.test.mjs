import assert from "node:assert/strict";
import test from "node:test";

import {
  CHECKLIST_CONTROL_COUNT,
  CHECKLIST_SECTORS,
  CHECKLIST_TEMPLATE_COUNT,
  CHECKLISTS,
  filterChecklists,
  normalizeChecklistText,
} from "../lib/hse-checklists.ts";

test("ships a broad, categorized HSE checklist library", () => {
  assert.equal(CHECKLIST_SECTORS.length, 14);
  assert.ok(CHECKLIST_TEMPLATE_COUNT >= 120);
  assert.ok(CHECKLIST_CONTROL_COUNT >= 700);

  const ids = new Set(CHECKLISTS.map((template) => template.id));
  assert.equal(ids.size, CHECKLISTS.length, "checklist ids must be unique");

  for (const sector of CHECKLIST_SECTORS) {
    const templates = CHECKLISTS.filter((template) => template.sector === sector.id);
    assert.ok(templates.length >= 6, `${sector.name} should have practical coverage`);
  }

  for (const template of CHECKLISTS) {
    assert.ok(template.name.trim().length > 2);
    assert.ok(template.activity.trim().length > 2);
    assert.ok(template.description.trim().length > 2);
    assert.ok(template.keywords.length >= 3);
    assert.ok(template.items.length >= 5);
    assert.equal(
      new Set(template.items).size,
      template.items.length,
      `${template.id} should not repeat a control`,
    );
  }
});

test("keeps legacy templates compatible with saved inspection records", () => {
  for (const id of ["ppe", "electrical", "scaffold", "hose-reel"]) {
    assert.ok(CHECKLISTS.some((template) => template.id === id));
  }
  const ppe = CHECKLISTS.find((template) => template.id === "ppe");
  assert.ok(ppe?.items.includes("کلاه ایمنی سالم و دارای بند مناسب است"));
});

test("normalizes Persian search and combines activity and sector filters", () => {
  assert.equal(normalizeChecklistText("  ايمنيِ برق  "), "ایمنی برق");

  const electrical = filterChecklists(CHECKLISTS, "ايمني برق");
  assert.ok(electrical.some((template) => template.id === "electrical"));

  const forklift = filterChecklists(CHECKLISTS, "لیفت تراک", "lifting-logistics");
  assert.ok(forklift.some((template) => template.id === "forklift"));
  assert.ok(forklift.every((template) => template.sector === "lifting-logistics"));

  const noCrossSectorResult = filterChecklists(
    CHECKLISTS,
    "بیمارستان",
    "construction",
  );
  assert.deepEqual(noCrossSectorResult, []);
});
