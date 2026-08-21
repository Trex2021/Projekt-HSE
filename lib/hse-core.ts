export type FindingStatus = "open" | "in_progress" | "closed";
export type RiskBand = "low" | "medium" | "high";

export interface FindingLike {
  status: FindingStatus;
  dueDate: string;
  severity: number;
  occurrence: number;
  detection: number;
}

export interface DisplayFindingLike {
  status: FindingStatus;
  dueDate: string;
  createdAt: string;
}

export interface DashboardSummary {
  total: number;
  open: number;
  inProgress: number;
  closed: number;
  highRisk: number;
  overdue: number;
}

const clampScore = (value: number) => {
  if (!Number.isFinite(value)) return 0;
  return Math.min(5, Math.max(1, Math.round(value)));
};

export function calculateRpn(
  severity: number,
  occurrence: number,
  detection: number,
) {
  if ([severity, occurrence, detection].some((value) => !Number.isFinite(value))) {
    return 0;
  }

  return (
    clampScore(severity) * clampScore(occurrence) * clampScore(detection)
  );
}

export function getRiskBand(rpn: number): RiskBand {
  if (rpn >= 75) return "high";
  if (rpn >= 25) return "medium";
  return "low";
}

export function getRiskLabel(rpn: number) {
  const band = getRiskBand(rpn);
  if (band === "high") return "ریسک بالا";
  if (band === "medium") return "ریسک متوسط";
  return "ریسک پایین";
}

export function isOverdue(
  dueDate: string,
  status: FindingStatus,
  now = new Date(),
) {
  if (!dueDate || status === "closed") return false;
  const deadline = new Date(`${dueDate}T23:59:59`);
  return Number.isFinite(deadline.getTime()) && deadline.getTime() < now.getTime();
}

const FINDING_STATUS_DISPLAY_ORDER: Record<FindingStatus, number> = {
  open: 1,
  in_progress: 2,
  closed: 3,
};

const createdAtTimestamp = (value: string) => {
  const timestamp = new Date(value).getTime();
  return Number.isFinite(timestamp) ? timestamp : Number.POSITIVE_INFINITY;
};

export function sortFindingsForDisplay<T extends DisplayFindingLike>(
  findings: readonly T[],
  now = new Date(),
) {
  return [...findings].sort((left, right) => {
    const leftOrder = isOverdue(left.dueDate, left.status, now)
      ? 0
      : FINDING_STATUS_DISPLAY_ORDER[left.status];
    const rightOrder = isOverdue(right.dueDate, right.status, now)
      ? 0
      : FINDING_STATUS_DISPLAY_ORDER[right.status];

    if (leftOrder !== rightOrder) return leftOrder - rightOrder;

    const leftCreatedAt = createdAtTimestamp(left.createdAt);
    const rightCreatedAt = createdAtTimestamp(right.createdAt);
    if (leftCreatedAt !== rightCreatedAt) {
      return leftCreatedAt - rightCreatedAt;
    }

    return left.createdAt.localeCompare(right.createdAt);
  });
}

export function summarizeFindings(
  findings: FindingLike[],
  now = new Date(),
): DashboardSummary {
  return findings.reduce<DashboardSummary>(
    (summary, finding) => {
      summary.total += 1;
      if (finding.status === "open") summary.open += 1;
      if (finding.status === "in_progress") summary.inProgress += 1;
      if (finding.status === "closed") summary.closed += 1;
      if (
        getRiskBand(
          calculateRpn(
            finding.severity,
            finding.occurrence,
            finding.detection,
          ),
        ) === "high"
      ) {
        summary.highRisk += 1;
      }
      if (isOverdue(finding.dueDate, finding.status, now)) summary.overdue += 1;
      return summary;
    },
    {
      total: 0,
      open: 0,
      inProgress: 0,
      closed: 0,
      highRisk: 0,
      overdue: 0,
    },
  );
}

export function escapeCsv(value: unknown) {
  const text = String(value ?? "");
  if (/[",\n\r]/.test(text)) return `"${text.replaceAll('"', '""')}"`;
  return text;
}

export function buildFindingsCsv(
  rows: Array<{
    title: string;
    description: string;
    location: string;
    contractor: string;
    category: string;
    severity: number;
    occurrence: number;
    detection: number;
    status: FindingStatus;
    dueDate: string;
    responsible: string;
    createdAt: string;
  }>,
) {
  const statusLabels: Record<FindingStatus, string> = {
    open: "باز",
    in_progress: "در حال اقدام",
    closed: "بسته‌شده",
  };
  const header = [
    "عنوان",
    "توضیحات",
    "محل",
    "پیمانکار",
    "دسته‌بندی",
    "شدت",
    "وقوع",
    "کشف",
    "RPN",
    "سطح ریسک",
    "وضعیت",
    "مهلت",
    "مسئول",
    "تاریخ ثبت",
  ];
  const data = rows.map((row) => {
    const rpn = calculateRpn(row.severity, row.occurrence, row.detection);
    return [
      row.title,
      row.description,
      row.location,
      row.contractor,
      row.category,
      row.severity,
      row.occurrence,
      row.detection,
      rpn,
      getRiskLabel(rpn),
      statusLabels[row.status],
      row.dueDate,
      row.responsible,
      row.createdAt,
    ].map(escapeCsv);
  });

  return `\uFEFF${[header.map(escapeCsv), ...data]
    .map((row) => row.join(","))
    .join("\r\n")}`;
}
