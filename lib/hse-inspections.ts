export type ChecklistResult = "pass" | "fail" | "na";

export interface InspectionItem {
  label: string;
  result: ChecklistResult;
}

export interface Inspection {
  id: string;
  templateId: string;
  templateName: string;
  location: string;
  inspector: string;
  notes: string;
  items: InspectionItem[];
  createdAt: string;
  updatedAt?: string;
}

export const CHECKLIST_RESULT_LABELS: Record<ChecklistResult, string> = {
  pass: "منطبق",
  fail: "عدم انطباق",
  na: "نامرتبط",
};

export function countInspectionResults(items: InspectionItem[]) {
  return items.reduce(
    (summary, item) => {
      summary[item.result] += 1;
      return summary;
    },
    { pass: 0, fail: 0, na: 0 },
  );
}

export function upsertInspection(
  inspections: Inspection[],
  inspection: Inspection,
  editingId: string | null,
) {
  if (!editingId) return [inspection, ...inspections];
  return inspections.map((current) =>
    current.id === editingId ? inspection : current,
  );
}

export function removeInspection(inspections: Inspection[], id: string) {
  return inspections.filter((inspection) => inspection.id !== id);
}

function escapeCsv(value: unknown) {
  const text = String(value ?? "");
  if (/[",\n\r]/.test(text)) return `"${text.replaceAll('"', '""')}"`;
  return text;
}

export function buildInspectionsCsv(inspections: Inspection[]) {
  const header = [
    "چک‌لیست",
    "محل بازرسی",
    "بازرس",
    "تاریخ ثبت",
    "آخرین ویرایش",
    "ردیف",
    "مورد کنترلی",
    "نتیجه",
    "یادداشت بازرسی",
  ];
  const data = inspections.flatMap((inspection) =>
    inspection.items.map((item, index) =>
      [
        inspection.templateName,
        inspection.location,
        inspection.inspector,
        inspection.createdAt,
        inspection.updatedAt ?? inspection.createdAt,
        index + 1,
        item.label,
        CHECKLIST_RESULT_LABELS[item.result],
        inspection.notes,
      ].map(escapeCsv),
    ),
  );

  return `\uFEFF${[header.map(escapeCsv), ...data]
    .map((row) => row.join(","))
    .join("\r\n")}`;
}
