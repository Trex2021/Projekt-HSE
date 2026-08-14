import type { FindingStatus } from "./hse-core";
import type { ChecklistResult, Inspection } from "./hse-inspections";

export interface BackupFinding {
  id: string;
  title: string;
  description: string;
  location: string;
  contractor: string;
  category: string;
  severity: number;
  occurrence: number;
  detection: number;
  dueDate: string;
  responsible: string;
  status: FindingStatus;
  createdAt: string;
  updatedAt: string;
}

export interface RestoreResult {
  format: "json" | "findings-csv" | "inspections-csv";
  findings?: BackupFinding[];
  inspections?: Inspection[];
}

type MakeId = () => string;
type CsvRow = string[];

const KNOWN_TEMPLATE_IDS: Record<string, string> = {
  "تجهیزات حفاظت فردی": "ppe",
  "ایمنی برق موقت": "electrical",
  "حفاظ و داربست متحرک": "scaffold",
  "هوزریل آتش‌نشانی": "hose-reel",
};

const defaultMakeId: MakeId = () => {
  if (typeof globalThis.crypto?.randomUUID === "function") {
    return globalThis.crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function textValue(value: unknown, fallback = "") {
  return typeof value === "string" ? value.trim() : fallback;
}

function normalizePersianText(value: string) {
  return value
    .replace(/^\uFEFF/, "")
    .replaceAll("ي", "ی")
    .replaceAll("ك", "ک")
    .replace(/[\u200c\s]+/g, " ")
    .trim();
}

function parsePersianNumber(value: string) {
  return Number(
    value
      .replace(/[۰-۹]/g, (digit) => String("۰۱۲۳۴۵۶۷۸۹".indexOf(digit)))
      .replace(/[٠-٩]/g, (digit) => String("٠١٢٣٤٥٦٧٨٩".indexOf(digit)))
      .trim(),
  );
}

function scoreValue(value: unknown) {
  const parsed =
    typeof value === "number"
      ? value
      : typeof value === "string"
        ? parsePersianNumber(value)
        : Number.NaN;
  if (!Number.isFinite(parsed)) return 1;
  return Math.min(5, Math.max(1, Math.round(parsed)));
}

function normalizeStatus(value: unknown): FindingStatus {
  const status = normalizePersianText(textValue(value)).toLocaleLowerCase("fa");
  if (status === "closed" || status === "بسته" || status === "بسته شده" || status === "بسته‌شده") {
    return "closed";
  }
  if (status === "in_progress" || status === "در حال اقدام") return "in_progress";
  if (status === "open" || status === "باز") return "open";
  throw new Error(`وضعیت «${textValue(value)}» در فایل پشتیبان شناخته نشد.`);
}

function normalizeResult(value: unknown): ChecklistResult {
  const result = normalizePersianText(textValue(value)).toLocaleLowerCase("fa");
  if (result === "pass" || result === "منطبق" || result === "انطباق") return "pass";
  if (result === "fail" || result === "عدم انطباق") return "fail";
  if (result === "na" || result === "n/a" || result === "نامرتبط") return "na";
  throw new Error(`نتیجهٔ «${textValue(value)}» در فایل پشتیبان شناخته نشد.`);
}

function fallbackTemplateId(name: string) {
  let hash = 0;
  for (const character of name) hash = (hash * 31 + character.codePointAt(0)!) >>> 0;
  return `restored-${hash.toString(16)}`;
}

function templateIdFor(name: string) {
  return KNOWN_TEMPLATE_IDS[normalizePersianText(name)] ?? fallbackTemplateId(name);
}

function normalizeFinding(value: unknown, makeId: MakeId): BackupFinding {
  if (!isRecord(value)) throw new Error("یکی از موارد ایمنی ساختار معتبری ندارد.");
  const title = textValue(value.title);
  if (!title) throw new Error("عنوان یکی از موارد ایمنی خالی است.");
  const createdAt = textValue(value.createdAt, new Date().toISOString());
  const id = textValue(value.id);
  return {
    id: id || makeId(),
    title,
    description: textValue(value.description),
    location: textValue(value.location),
    contractor: textValue(value.contractor),
    category: textValue(value.category, "سایر"),
    severity: scoreValue(value.severity),
    occurrence: scoreValue(value.occurrence),
    detection: scoreValue(value.detection),
    dueDate: textValue(value.dueDate),
    responsible: textValue(value.responsible),
    status: normalizeStatus(value.status),
    createdAt,
    updatedAt: textValue(value.updatedAt, createdAt),
  };
}

function normalizeInspection(value: unknown, makeId: MakeId): Inspection {
  if (!isRecord(value)) throw new Error("یکی از بازرسی‌ها ساختار معتبری ندارد.");
  const templateName = textValue(value.templateName);
  if (!templateName || !Array.isArray(value.items) || !value.items.length) {
    throw new Error("یکی از بازرسی‌ها فاقد نام چک‌لیست یا موارد کنترلی است.");
  }
  const createdAt = textValue(value.createdAt, new Date().toISOString());
  const id = textValue(value.id);
  return {
    id: id || makeId(),
    templateId: textValue(value.templateId, templateIdFor(templateName)),
    templateName,
    location: textValue(value.location),
    inspector: textValue(value.inspector),
    notes: textValue(value.notes),
    items: value.items.map((item) => {
      if (!isRecord(item) || !textValue(item.label)) {
        throw new Error("یکی از ردیف‌های چک‌لیست معتبر نیست.");
      }
      return { label: textValue(item.label), result: normalizeResult(item.result) };
    }),
    createdAt,
    updatedAt: textValue(value.updatedAt, createdAt),
  };
}

function parseJsonBackup(text: string, makeId: MakeId): RestoreResult {
  let value: unknown;
  try {
    value = JSON.parse(text.replace(/^\uFEFF/, ""));
  } catch {
    throw new Error("محتوای JSON فایل پشتیبان معتبر نیست.");
  }

  if (Array.isArray(value)) {
    if (!value.length) {
      throw new Error("آرایهٔ خالی JSON نوع اطلاعات را مشخص نمی‌کند.");
    }
    if (value.every((item) => isRecord(item) && Array.isArray(item.items))) {
      return { format: "json", inspections: value.map((item) => normalizeInspection(item, makeId)) };
    }
    return { format: "json", findings: value.map((item) => normalizeFinding(item, makeId)) };
  }

  if (!isRecord(value)) throw new Error("ساختار فایل پشتیبان JSON معتبر نیست.");
  if ("app" in value && value.app !== "HSE FieldLog") {
    throw new Error("این فایل متعلق به HSE FieldLog نیست.");
  }

  const hasFindings = Array.isArray(value.findings);
  const hasInspections = Array.isArray(value.inspections);
  if (!hasFindings && !hasInspections) {
    throw new Error("در فایل JSON، موارد ایمنی یا بازرسی قابل بازیابی پیدا نشد.");
  }

  return {
    format: "json",
    findings: hasFindings
      ? (value.findings as unknown[]).map((item) => normalizeFinding(item, makeId))
      : undefined,
    inspections: hasInspections
      ? (value.inspections as unknown[]).map((item) => normalizeInspection(item, makeId))
      : undefined,
  };
}

function firstRecord(text: string) {
  let quoted = false;
  let result = "";
  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];
    if (character === '"') {
      if (quoted && text[index + 1] === '"') {
        result += '""';
        index += 1;
        continue;
      }
      quoted = !quoted;
    }
    if (!quoted && (character === "\n" || character === "\r")) break;
    result += character;
  }
  return result;
}

function countDelimiter(line: string, delimiter: string) {
  let quoted = false;
  let count = 0;
  for (let index = 0; index < line.length; index += 1) {
    if (line[index] === '"') {
      if (quoted && line[index + 1] === '"') index += 1;
      else quoted = !quoted;
    } else if (!quoted && line[index] === delimiter) count += 1;
  }
  return count;
}

function detectDelimiter(text: string) {
  const line = firstRecord(text);
  const candidates = [",", ";", "\t"];
  return candidates.reduce((best, candidate) =>
    countDelimiter(line, candidate) > countDelimiter(line, best) ? candidate : best,
  );
}

export function parseCsv(text: string): CsvRow[] {
  const clean = text.replace(/^\uFEFF/, "");
  const delimiter = detectDelimiter(clean);
  const rows: CsvRow[] = [];
  let row: CsvRow = [];
  let cell = "";
  let quoted = false;

  for (let index = 0; index < clean.length; index += 1) {
    const character = clean[index];
    if (character === '"') {
      if (quoted && clean[index + 1] === '"') {
        cell += '"';
        index += 1;
      } else {
        quoted = !quoted;
      }
    } else if (!quoted && character === delimiter) {
      row.push(cell);
      cell = "";
    } else if (!quoted && (character === "\n" || character === "\r")) {
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
      if (character === "\r" && clean[index + 1] === "\n") index += 1;
    } else {
      cell += character;
    }
  }
  if (quoted) throw new Error("یک مقدار نقل‌قول‌شده در فایل CSV کامل نشده است.");
  if (cell || row.length) {
    row.push(cell);
    rows.push(row);
  }
  return rows.filter((current) => current.some((value) => value.trim()));
}

function headerIndex(headers: string[], name: string) {
  const normalized = normalizePersianText(name);
  return headers.findIndex((header) => normalizePersianText(header) === normalized);
}

function requiredCell(row: CsvRow, headers: string[], name: string) {
  const index = headerIndex(headers, name);
  if (index < 0) throw new Error(`ستون «${name}» در فایل CSV پیدا نشد.`);
  return row[index] ?? "";
}

function parseFindingsCsv(rows: CsvRow[], makeId: MakeId): BackupFinding[] {
  const [headers, ...data] = rows;
  return data.map((row) => {
    const createdAt = requiredCell(row, headers, "تاریخ ثبت").trim() || new Date().toISOString();
    return normalizeFinding(
      {
        id: makeId(),
        title: requiredCell(row, headers, "عنوان"),
        description: "",
        location: requiredCell(row, headers, "محل"),
        contractor: requiredCell(row, headers, "پیمانکار"),
        category: requiredCell(row, headers, "دسته‌بندی"),
        severity: requiredCell(row, headers, "شدت"),
        occurrence: requiredCell(row, headers, "وقوع"),
        detection: requiredCell(row, headers, "کشف"),
        status: requiredCell(row, headers, "وضعیت"),
        dueDate: requiredCell(row, headers, "مهلت"),
        responsible: requiredCell(row, headers, "مسئول"),
        createdAt,
        updatedAt: createdAt,
      },
      makeId,
    );
  });
}

function parseInspectionsCsv(rows: CsvRow[], makeId: MakeId): Inspection[] {
  const [headers, ...data] = rows;
  const groups = new Map<
    string,
    Omit<Inspection, "id" | "items"> & { items: Array<{ label: string; result: ChecklistResult; order: number }> }
  >();

  data.forEach((row, dataIndex) => {
    const templateName = requiredCell(row, headers, "چک‌لیست").trim();
    const location = requiredCell(row, headers, "محل بازرسی").trim();
    const inspector = requiredCell(row, headers, "بازرس").trim();
    const createdAt = requiredCell(row, headers, "تاریخ ثبت").trim() || new Date().toISOString();
    const updatedIndex = headerIndex(headers, "آخرین ویرایش");
    const notesIndex = headerIndex(headers, "یادداشت بازرسی");
    const updatedAt = (updatedIndex >= 0 ? row[updatedIndex] : "")?.trim() || createdAt;
    const notes = (notesIndex >= 0 ? row[notesIndex] : "")?.trim() ?? "";
    const key = [templateName, location, inspector, createdAt, updatedAt, notes].join("\u001f");
    const orderText = requiredCell(row, headers, "ردیف");
    const parsedOrder = parsePersianNumber(orderText);
    const item = {
      label: requiredCell(row, headers, "مورد کنترلی").trim(),
      result: normalizeResult(requiredCell(row, headers, "نتیجه")),
      order: Number.isFinite(parsedOrder) ? parsedOrder : dataIndex + 1,
    };
    if (!templateName || !item.label) {
      throw new Error("نام چک‌لیست یا مورد کنترلی در یکی از ردیف‌ها خالی است.");
    }
    const current = groups.get(key);
    if (current) current.items.push(item);
    else {
      groups.set(key, {
        templateId: templateIdFor(templateName),
        templateName,
        location,
        inspector,
        notes,
        createdAt,
        updatedAt,
        items: [item],
      });
    }
  });

  return Array.from(groups.values(), (inspection) => ({
    ...inspection,
    id: makeId(),
    items: inspection.items
      .sort((left, right) => left.order - right.order)
      .map(({ label, result }) => ({ label, result })),
  }));
}

function parseCsvBackup(text: string, makeId: MakeId): RestoreResult {
  const rows = parseCsv(text);
  if (!rows.length) throw new Error("فایل CSV خالی است.");
  const headers = rows[0].map(normalizePersianText);
  if (headers.includes("عنوان") && headers.includes("دسته بندی")) {
    return { format: "findings-csv", findings: parseFindingsCsv(rows, makeId) };
  }
  if (headers.includes("چک لیست") && headers.includes("مورد کنترلی")) {
    return { format: "inspections-csv", inspections: parseInspectionsCsv(rows, makeId) };
  }
  throw new Error("نوع CSV شناخته نشد؛ یکی از خروجی‌های خود برنامه را انتخاب کنید.");
}

export function parseRestoreFile(text: string, makeId: MakeId = defaultMakeId): RestoreResult {
  const clean = text.replace(/^\uFEFF/, "").trim();
  if (!clean) throw new Error("فایل انتخاب‌شده خالی است.");
  if (clean.startsWith("{") || clean.startsWith("[")) return parseJsonBackup(clean, makeId);
  return parseCsvBackup(clean, makeId);
}
