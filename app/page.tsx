"use client";

import { useEffect, useMemo, useState } from "react";
import type { ChangeEvent, FormEvent } from "react";
import { Capacitor } from "@capacitor/core";
import { Directory, Encoding, Filesystem } from "@capacitor/filesystem";
import { Share } from "@capacitor/share";

import {
  buildFindingsCsv,
  calculateRpn,
  getRiskBand,
  getRiskLabel,
  isOverdue,
  summarizeFindings,
  type FindingStatus,
} from "@/lib/hse-core";
import {
  parseRestoreFile,
  type BackupFinding,
} from "@/lib/hse-backup";
import {
  buildInspectionsCsv,
  CHECKLIST_RESULT_LABELS,
  countInspectionResults,
  removeInspection,
  upsertInspection,
  type ChecklistResult,
  type Inspection,
} from "@/lib/hse-inspections";

type Section = "dashboard" | "findings" | "checklists" | "reports" | "about";

type Finding = BackupFinding;

interface BackupFile {
  app: "HSE FieldLog";
  version: 1;
  exportedAt: string;
  findings: Finding[];
  inspections: Inspection[];
}

const STORAGE_KEY = "hse-fieldlog:v1";

const CATEGORIES = [
  "برق",
  "کار در ارتفاع",
  "داربست",
  "حریق",
  "تجهیزات حفاظت فردی",
  "نظم و نظافت",
  "ماشین‌آلات",
  "سایر",
];

const CHECKLISTS = [
  {
    id: "ppe",
    name: "تجهیزات حفاظت فردی",
    description: "کنترل PPE متناسب با نوع فعالیت",
    items: [
      "کلاه ایمنی سالم و دارای بند مناسب است",
      "کفش ایمنی متناسب با فعالیت استفاده می‌شود",
      "دستکش سالم و متناسب با خطر در دسترس است",
      "عینک یا شیلد محافظ در فعالیت‌های لازم استفاده می‌شود",
      "لباس کار سالم و بدون بخش آزاد و خطرناک است",
    ],
  },
  {
    id: "electrical",
    name: "ایمنی برق موقت",
    description: "تابلو، کابل و اتصالات برق کارگاهی",
    items: [
      "تابلو برق درب، قفل و علائم هشدار مناسب دارد",
      "محافظ جان و اتصال زمین کنترل شده است",
      "تمام کابل‌ها دارای دوشاخه و پریز صنعتی سالم هستند",
      "کابل آسیب‌دیده، لخت یا وصله غیراستاندارد وجود ندارد",
      "کابل‌ها از آب، لبه تیز و مسیر تردد محافظت شده‌اند",
      "دسترسی به تابلو برق مسدود نیست",
    ],
  },
  {
    id: "scaffold",
    name: "حفاظ و داربست متحرک",
    description: "کنترل پیش از استفاده از داربست",
    items: [
      "سطح استقرار محکم، تراز و بدون مانع است",
      "چرخ‌ها قفل و مهاربندی‌ها کامل هستند",
      "کف سکوی کار کامل و بدون شکستگی است",
      "نرده میانی، نرده بالایی و پاخور نصب شده‌اند",
      "دسترسی ایمن از داخل داربست فراهم است",
      "داربست معیوب با برچسب و مانع از سرویس خارج شده است",
    ],
  },
  {
    id: "hose-reel",
    name: "هوزریل آتش‌نشانی",
    description: "آمادگی عملیاتی هوزریل و مسیر دسترسی",
    items: [
      "مسیر دسترسی و فضای مقابل هوزریل آزاد است",
      "شلنگ فاقد پارگی، پوسیدگی یا له‌شدگی است",
      "قرقره روان و بدون گیرکردگی حرکت می‌کند",
      "شیر ورودی سالم و قابل باز و بسته شدن است",
      "نازل سالم، متصل و قابل تنظیم است",
      "علائم شناسایی و دستورالعمل استفاده قابل مشاهده است",
    ],
  },
] as const;

type ChecklistId = (typeof CHECKLISTS)[number]["id"];

const STATUS_LABELS: Record<FindingStatus, string> = {
  open: "باز",
  in_progress: "در حال اقدام",
  closed: "بسته‌شده",
};

const NAV_ITEMS: Array<{ id: Section; label: string; eyebrow: string }> = [
  { id: "dashboard", label: "داشبورد", eyebrow: "نمای کلی" },
  { id: "findings", label: "موارد ایمنی", eyebrow: "ثبت و پیگیری" },
  { id: "checklists", label: "چک‌لیست‌ها", eyebrow: "بازرسی میدانی" },
  { id: "reports", label: "گزارش‌ها", eyebrow: "خروجی و پشتیبان" },
  { id: "about", label: "مجوز و ارتباط", eyebrow: "Ehsan Benvari" },
];

const makeId = () => {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
};

const toInputDate = (date: Date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

const offsetDate = (days: number) => {
  const date = new Date();
  date.setHours(12, 0, 0, 0);
  date.setDate(date.getDate() + days);
  return toInputDate(date);
};

const formatDate = (value: string) => {
  if (!value) return "—";
  const date = value.includes("T") ? new Date(value) : new Date(`${value}T12:00:00`);
  if (!Number.isFinite(date.getTime())) return "—";
  return new Intl.DateTimeFormat("fa-IR-u-ca-persian", {
    year: "numeric",
    month: "short",
    day: "numeric",
  }).format(date);
};

const createDemoData = (): { findings: Finding[]; inspections: Inspection[] } => {
  const now = new Date().toISOString();
  return {
    findings: [
      {
        id: "demo-electrical",
        title: "کابل برق بدون دوشاخه صنعتی",
        description:
          "کابل موقت به‌صورت مستقیم به تابلو متصل شده و باید پیش از ادامه کار اصلاح شود.",
        location: "طبقه ۳-، پارت شرقی",
        contractor: "پیمانکار نمونه",
        category: "برق",
        severity: 5,
        occurrence: 4,
        detection: 4,
        dueDate: offsetDate(1),
        responsible: "سرپرست برق نمونه",
        status: "open",
        createdAt: now,
        updatedAt: now,
      },
      {
        id: "demo-ppe",
        title: "نبود دستکش مناسب جوشکاری",
        description:
          "برای فعالیت جوشکاری دستکش سالم و متناسب با حرارت در اختیار نیرو قرار نگرفته است.",
        location: "کارگاه جوشکاری نمونه",
        contractor: "پیمانکار نمونه دوم",
        category: "تجهیزات حفاظت فردی",
        severity: 4,
        occurrence: 3,
        detection: 3,
        dueDate: offsetDate(3),
        responsible: "سرپرست اجرایی نمونه",
        status: "in_progress",
        createdAt: new Date(Date.now() - 86_400_000).toISOString(),
        updatedAt: now,
      },
      {
        id: "demo-hose",
        title: "مسدود بودن مسیر دسترسی هوزریل",
        description: "ضایعات جمع‌آوری و مسیر دسترسی آزاد شد.",
        location: "انبار نمونه",
        contractor: "تیم انبار نمونه",
        category: "حریق",
        severity: 3,
        occurrence: 2,
        detection: 2,
        dueDate: offsetDate(-1),
        responsible: "انباردار نمونه",
        status: "closed",
        createdAt: new Date(Date.now() - 172_800_000).toISOString(),
        updatedAt: now,
      },
    ],
    inspections: [
      {
        id: "demo-inspection",
        templateId: "hose-reel",
        templateName: "هوزریل آتش‌نشانی",
        location: "طبقه ۳-، انبار نمونه",
        inspector: "کارشناس HSE نمونه",
        notes: "این بازرسی صرفاً دادهٔ نمایشی است.",
        items: CHECKLISTS[3].items.map((label, index) => ({
          label,
          result: index === 1 ? "fail" : "pass",
        })),
        createdAt: now,
      },
    ],
  };
};

const emptyFindingForm = () => ({
  title: "",
  description: "",
  location: "",
  contractor: "",
  category: CATEGORIES[0],
  severity: 3,
  occurrence: 3,
  detection: 3,
  dueDate: offsetDate(3),
  responsible: "",
});

async function downloadText(filename: string, text: string, type: string) {
  if (Capacitor.isNativePlatform()) {
    const file = await Filesystem.writeFile({
      path: filename,
      data: text,
      directory: Directory.Cache,
      encoding: Encoding.UTF8,
    });
    await Share.share({
      title: filename,
      files: [file.uri],
      dialogTitle: "ذخیره یا اشتراک‌گذاری فایل",
    });
    return "native" as const;
  }

  const blob = new Blob([text], { type });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
  return "browser" as const;
}

export default function Home() {
  const [activeSection, setActiveSection] = useState<Section>("dashboard");
  const [findings, setFindings] = useState<Finding[]>([]);
  const [inspections, setInspections] = useState<Inspection[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [showFindingForm, setShowFindingForm] = useState(false);
  const [findingForm, setFindingForm] = useState(emptyFindingForm);
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | FindingStatus>("all");
  const [selectedChecklist, setSelectedChecklist] = useState<ChecklistId>(
    CHECKLISTS[0].id,
  );
  const [checklistLocation, setChecklistLocation] = useState("");
  const [inspector, setInspector] = useState("");
  const [checklistNotes, setChecklistNotes] = useState("");
  const [checklistResults, setChecklistResults] = useState<
    Record<string, ChecklistResult>
  >({});
  const [editingInspectionId, setEditingInspectionId] = useState<string | null>(null);
  const [toast, setToast] = useState("");

  const notify = (message: string) => {
    setToast(message);
    window.setTimeout(() => setToast(""), 3200);
  };

  useEffect(() => {
    let cancelled = false;
    queueMicrotask(() => {
      if (cancelled) return;
      try {
        const stored = window.localStorage.getItem(STORAGE_KEY);
        if (stored) {
          const parsed = JSON.parse(stored) as Partial<BackupFile>;
          if (Array.isArray(parsed.findings) && Array.isArray(parsed.inspections)) {
            setFindings(parsed.findings);
            setInspections(parsed.inspections);
          } else {
            throw new Error("Invalid local data");
          }
        } else {
          const demo = createDemoData();
          setFindings(demo.findings);
          setInspections(demo.inspections);
        }
      } catch {
        const demo = createDemoData();
        setFindings(demo.findings);
        setInspections(demo.inspections);
        setToast("دادهٔ محلی قابل خواندن نبود؛ داده‌های نمونه بارگذاری شد.");
      } finally {
        setLoaded(true);
      }
    });

    if (
      "serviceWorker" in navigator &&
      (window.location.protocol === "https:" || window.location.hostname === "localhost")
    ) {
      navigator.serviceWorker.register("/sw.js").catch(() => {
        // Offline support is progressive; the online app remains fully usable.
      });
    }

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!loaded) return;
    const backup: BackupFile = {
      app: "HSE FieldLog",
      version: 1,
      exportedAt: new Date().toISOString(),
      findings,
      inspections,
    };
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(backup));
  }, [findings, inspections, loaded]);

  const summary = useMemo(() => summarizeFindings(findings), [findings]);
  const currentChecklist =
    CHECKLISTS.find((item) => item.id === selectedChecklist) ?? CHECKLISTS[0];
  const formRpn = calculateRpn(
    findingForm.severity,
    findingForm.occurrence,
    findingForm.detection,
  );

  const filteredFindings = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase("fa");
    return findings
      .filter((finding) => statusFilter === "all" || finding.status === statusFilter)
      .filter((finding) => {
        if (!normalized) return true;
        return [
          finding.title,
          finding.location,
          finding.contractor,
          finding.category,
          finding.responsible,
        ].some((value) => value.toLocaleLowerCase("fa").includes(normalized));
      })
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }, [findings, query, statusFilter]);

  const addFinding = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (
      !findingForm.title.trim() ||
      !findingForm.location.trim() ||
      !findingForm.contractor.trim() ||
      !findingForm.responsible.trim() ||
      !findingForm.dueDate
    ) {
      notify("لطفاً تمام فیلدهای الزامی را کامل کنید.");
      return;
    }
    const now = new Date().toISOString();
    const finding: Finding = {
      id: makeId(),
      ...findingForm,
      title: findingForm.title.trim(),
      description: findingForm.description.trim(),
      location: findingForm.location.trim(),
      contractor: findingForm.contractor.trim(),
      responsible: findingForm.responsible.trim(),
      status: "open",
      createdAt: now,
      updatedAt: now,
    };
    setFindings((current) => [finding, ...current]);
    setFindingForm(emptyFindingForm());
    setShowFindingForm(false);
    setActiveSection("findings");
    notify("مورد ایمنی با موفقیت ثبت شد.");
  };

  const updateStatus = (id: string, status: FindingStatus) => {
    setFindings((current) =>
      current.map((finding) =>
        finding.id === id
          ? { ...finding, status, updatedAt: new Date().toISOString() }
          : finding,
      ),
    );
    notify(`وضعیت به «${STATUS_LABELS[status]}» تغییر کرد.`);
  };

  const deleteFinding = (id: string) => {
    if (!window.confirm("این مورد ایمنی حذف شود؟ این کار قابل بازگشت نیست.")) return;
    setFindings((current) => current.filter((finding) => finding.id !== id));
    notify("مورد ایمنی حذف شد.");
  };

  const setChecklistResult = (label: string, result: ChecklistResult) => {
    setChecklistResults((current) => ({ ...current, [label]: result }));
  };

  const resetInspectionForm = (clearInspector = false) => {
    setChecklistLocation("");
    if (clearInspector) setInspector("");
    setChecklistNotes("");
    setChecklistResults({});
    setEditingInspectionId(null);
  };

  const selectChecklistTemplate = (templateId: ChecklistId) => {
    if (
      editingInspectionId &&
      !window.confirm("ویرایش فعلی رها شود و چک‌لیست دیگری باز شود؟")
    ) {
      return;
    }
    setSelectedChecklist(templateId);
    resetInspectionForm(true);
  };

  const editInspection = (inspection: Inspection) => {
    const template = CHECKLISTS.find((item) => item.id === inspection.templateId);
    if (!template) {
      notify("الگوی این بازرسی دیگر در برنامه وجود ندارد و قابل ویرایش نیست.");
      return;
    }
    setSelectedChecklist(template.id);
    setChecklistLocation(inspection.location);
    setInspector(inspection.inspector);
    setChecklistNotes(inspection.notes);
    setChecklistResults(
      Object.fromEntries(inspection.items.map((item) => [item.label, item.result])),
    );
    setEditingInspectionId(inspection.id);
    window.requestAnimationFrame(() => {
      document.getElementById("inspection-form")?.scrollIntoView({
        behavior: "smooth",
        block: "start",
      });
    });
    notify("بازرسی برای ویرایش باز شد.");
  };

  const deleteInspection = (inspection: Inspection) => {
    if (
      !window.confirm(
        `سابقهٔ «${inspection.templateName}» در ${inspection.location} حذف شود؟ این کار قابل بازگشت نیست.`,
      )
    ) {
      return;
    }
    setInspections((current) => removeInspection(current, inspection.id));
    if (editingInspectionId === inspection.id) resetInspectionForm(true);
    notify("سابقهٔ بازرسی حذف شد.");
  };

  const clearInspectionHistory = () => {
    if (!inspections.length) return;
    if (
      !window.confirm(
        `تمام ${inspections.length.toLocaleString("fa-IR")} سابقهٔ بازرسی حذف شوند؟ پیش از ادامه در صورت نیاز فایل پشتیبان بگیرید. این کار قابل بازگشت نیست.`,
      )
    ) {
      return;
    }
    setInspections([]);
    resetInspectionForm(true);
    notify("تمام سوابق بازرسی حذف شدند.");
  };

  const saveInspection = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!checklistLocation.trim() || !inspector.trim()) {
      notify("محل بازرسی و نام بازرس الزامی است.");
      return;
    }
    const unanswered = currentChecklist.items.filter((item) => !checklistResults[item]);
    if (unanswered.length) {
      notify(`نتیجهٔ ${unanswered.length.toLocaleString("fa-IR")} مورد هنوز مشخص نشده است.`);
      return;
    }
    const now = new Date().toISOString();
    const editingInspection = editingInspectionId
      ? inspections.find((item) => item.id === editingInspectionId)
      : undefined;
    const inspection: Inspection = {
      id: editingInspection?.id ?? makeId(),
      templateId: currentChecklist.id,
      templateName: currentChecklist.name,
      location: checklistLocation.trim(),
      inspector: inspector.trim(),
      notes: checklistNotes.trim(),
      items: currentChecklist.items.map((label) => ({
        label,
        result: checklistResults[label],
      })),
      createdAt: editingInspection?.createdAt ?? now,
      updatedAt: now,
    };
    setInspections((current) =>
      upsertInspection(current, inspection, editingInspectionId),
    );
    const wasEditing = Boolean(editingInspectionId);
    resetInspectionForm();
    notify(wasEditing ? "تغییرات بازرسی ذخیره شد." : "نتیجهٔ بازرسی ذخیره شد.");
  };

  const deliverExport = async (
    filename: string,
    content: string,
    type: string,
    browserMessage: string,
  ) => {
    try {
      const destination = await downloadText(filename, content, type);
      notify(
        destination === "native"
          ? "فایل آماده است؛ برنامه یا محل ذخیره را انتخاب کنید."
          : browserMessage,
      );
    } catch {
      notify("ذخیره یا اشتراک‌گذاری فایل انجام نشد.");
    }
  };

  const exportBackup = async () => {
    const backup: BackupFile = {
      app: "HSE FieldLog",
      version: 1,
      exportedAt: new Date().toISOString(),
      findings,
      inspections,
    };
    await deliverExport(
      `hse-fieldlog-backup-${toInputDate(new Date())}.json`,
      JSON.stringify(backup, null, 2),
      "application/json;charset=utf-8",
      "فایل پشتیبان آماده شد.",
    );
  };

  const exportCsv = async () => {
    await deliverExport(
      `hse-findings-${toInputDate(new Date())}.csv`,
      buildFindingsCsv(findings),
      "text/csv;charset=utf-8",
      "گزارش CSV آماده شد.",
    );
  };

  const exportInspectionsCsv = async () => {
    await deliverExport(
      `hse-inspections-${toInputDate(new Date())}.csv`,
      buildInspectionsCsv(inspections),
      "text/csv;charset=utf-8",
      "گزارش جزئیات بازرسی‌ها آماده شد.",
    );
  };

  const importBackup = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    try {
      const parsed = parseRestoreFile(await file.text(), makeId);
      const restoresFindings = parsed.findings !== undefined;
      const restoresInspections = parsed.inspections !== undefined;
      const findingCount = parsed.findings?.length ?? 0;
      const inspectionCount = parsed.inspections?.length ?? 0;
      const scope = restoresFindings && restoresInspections
        ? `تمام موارد ایمنی (${findingCount.toLocaleString("fa-IR")}) و بازرسی‌ها (${inspectionCount.toLocaleString("fa-IR")}) جایگزین می‌شوند.`
        : restoresFindings
          ? `${findingCount.toLocaleString("fa-IR")} مورد ایمنی بازیابی و جایگزین می‌شود؛ سوابق بازرسی فعلی محفوظ می‌ماند.`
          : `${inspectionCount.toLocaleString("fa-IR")} بازرسی بازیابی و جایگزین می‌شود؛ موارد ایمنی فعلی محفوظ می‌ماند.`;
      if (!window.confirm(`${scope}\n\nادامه می‌دهید؟`)) return;

      if (parsed.findings !== undefined) setFindings(parsed.findings);
      if (parsed.inspections !== undefined) setInspections(parsed.inspections);
      if (parsed.inspections !== undefined) resetInspectionForm(true);
      notify(
        parsed.format === "json"
          ? "اطلاعات فایل JSON با موفقیت بازیابی شد."
          : parsed.format === "findings-csv"
            ? "موارد ایمنی از CSV با موفقیت بازیابی شدند."
            : "بازرسی‌ها از CSV با موفقیت بازیابی شدند.",
      );
    } catch (error) {
      notify(error instanceof Error ? error.message : "این فایل پشتیبان معتبر نیست.");
    }
  };

  const removeDemoData = () => {
    const demoFindings = findings.some((item) => item.id.startsWith("demo-"));
    const demoInspections = inspections.some((item) => item.id.startsWith("demo-"));
    if (!demoFindings && !demoInspections) return;
    setFindings((current) => current.filter((item) => !item.id.startsWith("demo-")));
    setInspections((current) => current.filter((item) => !item.id.startsWith("demo-")));
    notify("داده‌های نمونه پاک شدند؛ آمادهٔ ثبت اطلاعات واقعی هستید.");
  };

  const hasDemoData =
    findings.some((item) => item.id.startsWith("demo-")) ||
    inspections.some((item) => item.id.startsWith("demo-"));

  const failedInspections = inspections.filter((inspection) =>
    inspection.items.some((item) => item.result === "fail"),
  ).length;

  return (
    <main className="app-shell">
      <aside className="sidebar" aria-label="ناوبری اصلی">
        <div className="brand-block">
          <div className="brand-mark" aria-hidden="true">HSE</div>
          <div>
            <strong>FieldLog</strong>
            <span>دفتر ایمنی کارگاه</span>
          </div>
        </div>

        <nav className="side-nav">
          {NAV_ITEMS.map((item) => (
            <button
              className={activeSection === item.id ? "nav-item active" : "nav-item"}
              key={item.id}
              onClick={() => setActiveSection(item.id)}
              type="button"
            >
              <span>{item.label}</span>
              <small>{item.eyebrow}</small>
            </button>
          ))}
        </nav>

        <div className="privacy-note">
          <span className="status-dot" />
          <div>
            <strong>ذخیرهٔ محلی فعال</strong>
            <p>اطلاعات روی همین دستگاه نگهداری می‌شود.</p>
          </div>
        </div>

        <button
          className="license-credit"
          type="button"
          onClick={() => setActiveSection("about")}
          aria-label="مشاهده اطلاعات مجوز و راه ارتباطی"
        >
          <span>LICENSE &amp; CONTACT</span>
          <strong>Ehsan Benvari</strong>
          <small>benvari.e@yahoo.com</small>
        </button>
      </aside>

      <section className="workspace">
        <header className="topbar">
          <div>
            <p className="eyebrow">HSE FIELD OPERATIONS</p>
            <h1>{NAV_ITEMS.find((item) => item.id === activeSection)?.label}</h1>
          </div>
          <button className="primary-button" onClick={() => setShowFindingForm(true)}>
            ثبت مورد جدید
          </button>
        </header>

        {!loaded ? (
          <div className="loading-card" role="status">در حال آماده‌سازی دفتر ایمنی…</div>
        ) : null}

        {loaded && activeSection === "dashboard" ? (
          <div className="section-stack">
            <section className="hero-panel">
              <div className="hero-copy">
                <p className="eyebrow">کنترل امروز</p>
                <h2>ریسک‌ها را ثبت کن، اقدام‌ها را تا بسته‌شدن پیگیری کن.</h2>
                <p>
                  یک نمای فشرده از وضعیت ایمنی کارگاه؛ آماده برای استفاده روی
                  موبایل و بدون نیاز دائمی به اینترنت.
                </p>
                <div className="hero-actions">
                  <button className="primary-button light" onClick={() => setShowFindingForm(true)}>
                    ثبت مشاهدهٔ ایمنی
                  </button>
                  <button
                    className="secondary-button light-outline"
                    onClick={() => setActiveSection("checklists")}
                  >
                    شروع بازرسی
                  </button>
                </div>
              </div>
              <div className="hero-score" aria-label={`${summary.highRisk} ریسک بالا`}>
                <span>ریسک‌های اولویت‌دار</span>
                <strong>{summary.highRisk.toLocaleString("fa-IR")}</strong>
                <small>مورد با RPN برابر یا بیشتر از ۷۵</small>
              </div>
            </section>

            {hasDemoData ? (
              <section className="demo-banner">
                <div>
                  <strong>اطلاعات فعلی نمونه و غیرواقعی‌اند.</strong>
                  <span>پس از آشنایی با برنامه، آن‌ها را پاک و ثبت واقعی را شروع کنید.</span>
                </div>
                <button className="text-button" onClick={removeDemoData}>
                  پاک‌کردن داده‌های نمونه
                </button>
              </section>
            ) : null}

            <section className="metric-grid" aria-label="شاخص‌های ایمنی">
              <article className="metric-card accent-orange">
                <span>موارد باز</span>
                <strong>{summary.open.toLocaleString("fa-IR")}</strong>
                <small>نیازمند اقدام اولیه</small>
              </article>
              <article className="metric-card accent-blue">
                <span>در حال اقدام</span>
                <strong>{summary.inProgress.toLocaleString("fa-IR")}</strong>
                <small>در چرخهٔ پیگیری</small>
              </article>
              <article className="metric-card accent-red">
                <span>عقب‌افتاده</span>
                <strong>{summary.overdue.toLocaleString("fa-IR")}</strong>
                <small>مهلت اصلاح گذشته است</small>
              </article>
              <article className="metric-card accent-green">
                <span>بسته‌شده</span>
                <strong>{summary.closed.toLocaleString("fa-IR")}</strong>
                <small>اقدام اصلاحی تکمیل شده</small>
              </article>
            </section>

            <div className="dashboard-grid">
              <section className="panel">
                <div className="panel-heading">
                  <div>
                    <p className="eyebrow">پیگیری سریع</p>
                    <h3>آخرین موارد ثبت‌شده</h3>
                  </div>
                  <button className="text-button" onClick={() => setActiveSection("findings")}>
                    مشاهده همه
                  </button>
                </div>
                <div className="compact-list">
                  {findings.slice(0, 4).map((finding) => {
                    const rpn = calculateRpn(
                      finding.severity,
                      finding.occurrence,
                      finding.detection,
                    );
                    return (
                      <article className="compact-row" key={finding.id}>
                        <span className={`risk-stripe ${getRiskBand(rpn)}`} />
                        <div className="compact-content">
                          <strong>{finding.title}</strong>
                          <span>{finding.location} · {finding.contractor}</span>
                        </div>
                        <div className="compact-meta">
                          <strong>{rpn.toLocaleString("fa-IR")}</strong>
                          <span>{STATUS_LABELS[finding.status]}</span>
                        </div>
                      </article>
                    );
                  })}
                  {!findings.length ? (
                    <div className="empty-state">هنوز مورد ایمنی ثبت نشده است.</div>
                  ) : null}
                </div>
              </section>

              <section className="panel inspection-summary">
                <div className="panel-heading">
                  <div>
                    <p className="eyebrow">بازرسی</p>
                    <h3>وضعیت چک‌لیست‌ها</h3>
                  </div>
                </div>
                <div className="inspection-number">
                  <strong>{inspections.length.toLocaleString("fa-IR")}</strong>
                  <span>بازرسی ذخیره‌شده</span>
                </div>
                <div className="inspection-breakdown">
                  <div>
                    <span>دارای عدم انطباق</span>
                    <strong>{failedInspections.toLocaleString("fa-IR")}</strong>
                  </div>
                  <div>
                    <span>کاملاً منطبق</span>
                    <strong>{(inspections.length - failedInspections).toLocaleString("fa-IR")}</strong>
                  </div>
                </div>
                <button
                  className="secondary-button full-width"
                  onClick={() => setActiveSection("checklists")}
                >
                  ثبت بازرسی جدید
                </button>
              </section>
            </div>
          </div>
        ) : null}

        {loaded && activeSection === "findings" ? (
          <div className="section-stack">
            <section className="filter-bar">
              <label className="search-field">
                <span>جست‌وجو</span>
                <input
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="عنوان، محل یا پیمانکار…"
                />
              </label>
              <label className="select-field compact-select">
                <span>وضعیت</span>
                <select
                  value={statusFilter}
                  onChange={(event) =>
                    setStatusFilter(event.target.value as "all" | FindingStatus)
                  }
                >
                  <option value="all">همه وضعیت‌ها</option>
                  <option value="open">باز</option>
                  <option value="in_progress">در حال اقدام</option>
                  <option value="closed">بسته‌شده</option>
                </select>
              </label>
              <div className="filter-count">
                <strong>{filteredFindings.length.toLocaleString("fa-IR")}</strong>
                <span>نتیجه</span>
              </div>
            </section>

            <section className="finding-grid">
              {filteredFindings.map((finding) => {
                const rpn = calculateRpn(
                  finding.severity,
                  finding.occurrence,
                  finding.detection,
                );
                const riskBand = getRiskBand(rpn);
                return (
                  <article className="finding-card" key={finding.id}>
                    <div className="finding-card-head">
                      <div>
                        <span className={`risk-pill ${riskBand}`}>
                          {getRiskLabel(rpn)} · RPN {rpn.toLocaleString("fa-IR")}
                        </span>
                        <h2>{finding.title}</h2>
                      </div>
                      <span className={`status-pill status-${finding.status}`}>
                        {STATUS_LABELS[finding.status]}
                      </span>
                    </div>
                    <p className="finding-description">
                      {finding.description || "توضیح تکمیلی ثبت نشده است."}
                    </p>
                    <dl className="finding-details">
                      <div><dt>محل</dt><dd>{finding.location}</dd></div>
                      <div><dt>پیمانکار</dt><dd>{finding.contractor}</dd></div>
                      <div><dt>مسئول اقدام</dt><dd>{finding.responsible}</dd></div>
                      <div>
                        <dt>مهلت اصلاح</dt>
                        <dd className={isOverdue(finding.dueDate, finding.status) ? "overdue" : ""}>
                          {formatDate(finding.dueDate)}
                        </dd>
                      </div>
                    </dl>
                    <div className="finding-score-row" aria-label="امتیازهای FMEA">
                      <span>شدت <strong>{finding.severity.toLocaleString("fa-IR")}</strong></span>
                      <span>وقوع <strong>{finding.occurrence.toLocaleString("fa-IR")}</strong></span>
                      <span>کشف <strong>{finding.detection.toLocaleString("fa-IR")}</strong></span>
                      <span>{finding.category}</span>
                    </div>
                    <div className="card-actions">
                      <select
                        aria-label={`تغییر وضعیت ${finding.title}`}
                        value={finding.status}
                        onChange={(event) =>
                          updateStatus(finding.id, event.target.value as FindingStatus)
                        }
                      >
                        <option value="open">باز</option>
                        <option value="in_progress">در حال اقدام</option>
                        <option value="closed">بسته‌شده</option>
                      </select>
                      <button className="danger-button" onClick={() => deleteFinding(finding.id)}>
                        حذف
                      </button>
                    </div>
                  </article>
                );
              })}
              {!filteredFindings.length ? (
                <div className="empty-state large">
                  <strong>موردی پیدا نشد.</strong>
                  <span>فیلترها را تغییر دهید یا یک مورد جدید ثبت کنید.</span>
                </div>
              ) : null}
            </section>
          </div>
        ) : null}

        {loaded && activeSection === "checklists" ? (
          <div className="checklist-layout">
            <section className="checklist-picker panel">
              <div className="panel-heading">
                <div><p className="eyebrow">الگوی بازرسی</p><h2>انتخاب چک‌لیست</h2></div>
              </div>
              <div className="template-list">
                {CHECKLISTS.map((template) => (
                  <button
                    className={template.id === selectedChecklist ? "template-card selected" : "template-card"}
                    key={template.id}
                    type="button"
                    onClick={() => selectChecklistTemplate(template.id)}
                  >
                    <strong>{template.name}</strong>
                    <span>{template.description}</span>
                    <small>{template.items.length.toLocaleString("fa-IR")} کنترل</small>
                  </button>
                ))}
              </div>
            </section>

            <form
              className="inspection-form panel"
              id="inspection-form"
              onSubmit={saveInspection}
            >
              <div className="panel-heading">
                <div>
                  <p className="eyebrow">
                    {editingInspectionId ? "ویرایش سابقه" : "فرم میدانی"}
                  </p>
                  <h2>{currentChecklist.name}</h2>
                </div>
                <span className="completion-chip">
                  {Object.keys(checklistResults).length.toLocaleString("fa-IR")} از {currentChecklist.items.length.toLocaleString("fa-IR")}
                </span>
              </div>

              {editingInspectionId ? (
                <div className="editing-banner" role="status">
                  <div>
                    <strong>در حال ویرایش بازرسی ثبت‌شده</strong>
                    <span>نتیجهٔ هر مورد، محل، بازرس و یادداشت را اصلاح و دوباره ذخیره کنید.</span>
                  </div>
                  <button
                    className="text-button"
                    type="button"
                    onClick={() => resetInspectionForm(true)}
                  >
                    لغو ویرایش
                  </button>
                </div>
              ) : null}

              <div className="form-grid two-columns">
                <label>
                  <span>محل بازرسی *</span>
                  <input
                    value={checklistLocation}
                    onChange={(event) => setChecklistLocation(event.target.value)}
                    placeholder="مثلاً طبقه ۳-، پارت شرقی"
                    required
                  />
                </label>
                <label>
                  <span>نام بازرس *</span>
                  <input
                    value={inspector}
                    onChange={(event) => setInspector(event.target.value)}
                    placeholder="نام کارشناس HSE"
                    required
                  />
                </label>
              </div>

              <div className="checklist-items">
                {currentChecklist.items.map((item, index) => (
                  <fieldset className="checklist-item" key={item}>
                    <legend><span>{(index + 1).toLocaleString("fa-IR")}</span>{item}</legend>
                    <div className="result-buttons">
                      {([[
                        "pass", "منطبق"],
                        ["fail", "عدم انطباق"],
                        ["na", "نامرتبط"],
                      ] as const).map(([value, label]) => (
                        <label className={`result-option ${value}`} key={value}>
                          <input
                            type="radio"
                            name={`check-${index}`}
                            value={value}
                            checked={checklistResults[item] === value}
                            onChange={() => setChecklistResult(item, value)}
                          />
                          <span>{label}</span>
                        </label>
                      ))}
                    </div>
                  </fieldset>
                ))}
              </div>

              <label className="notes-field">
                <span>یادداشت بازرسی</span>
                <textarea
                  value={checklistNotes}
                  onChange={(event) => setChecklistNotes(event.target.value)}
                  placeholder="توضیحات، اقدام فوری یا مشاهدات تکمیلی…"
                  rows={3}
                />
              </label>
              <div className="inspection-submit-row">
                <button className="primary-button full-width" type="submit">
                  {editingInspectionId ? "ذخیرهٔ تغییرات بازرسی" : "ذخیرهٔ نتیجه بازرسی"}
                </button>
                {editingInspectionId ? (
                  <button
                    className="secondary-button"
                    type="button"
                    onClick={() => resetInspectionForm(true)}
                  >
                    انصراف
                  </button>
                ) : null}
              </div>
            </form>

            <section className="inspection-history panel">
              <div className="panel-heading">
                <div>
                  <p className="eyebrow">سوابق</p>
                  <h2>بازرسی‌های ثبت‌شده</h2>
                </div>
                <button
                  className="danger-button compact-button"
                  type="button"
                  onClick={clearInspectionHistory}
                  disabled={!inspections.length}
                >
                  حذف همه
                </button>
              </div>
              <div className="history-list">
                {inspections.map((inspection) => {
                  const counts = countInspectionResults(inspection.items);
                  return (
                    <article className="history-item" key={inspection.id}>
                      <div className="history-item-head">
                        <div>
                          <strong>{inspection.templateName}</strong>
                          <span>{inspection.location}</span>
                          <small>
                            {inspection.inspector} · {formatDate(inspection.createdAt)}
                            {inspection.updatedAt && inspection.updatedAt !== inspection.createdAt
                              ? " · ویرایش‌شده"
                              : ""}
                          </small>
                        </div>
                        <span className={counts.fail ? "history-result failed" : "history-result passed"}>
                          {counts.fail
                            ? `${counts.fail.toLocaleString("fa-IR")} عدم انطباق`
                            : "بدون عدم انطباق"}
                        </span>
                      </div>
                      <div className="history-counts" aria-label="خلاصه نتایج بازرسی">
                        <span className="pass">منطبق <strong>{counts.pass.toLocaleString("fa-IR")}</strong></span>
                        <span className="fail">عدم انطباق <strong>{counts.fail.toLocaleString("fa-IR")}</strong></span>
                        <span className="na">نامرتبط <strong>{counts.na.toLocaleString("fa-IR")}</strong></span>
                      </div>
                      <details className="history-details">
                        <summary>مشاهدهٔ نتیجهٔ تمام موارد چک‌لیست</summary>
                        <div className="history-detail-items">
                          {inspection.items.map((item, index) => (
                            <div className="history-detail-row" key={`${inspection.id}-${index}`}>
                              <span>{item.label}</span>
                              <strong className={`inspection-result-badge ${item.result}`}>
                                {CHECKLIST_RESULT_LABELS[item.result]}
                              </strong>
                            </div>
                          ))}
                        </div>
                        {inspection.notes ? (
                          <p className="history-notes">
                            <strong>یادداشت:</strong> {inspection.notes}
                          </p>
                        ) : null}
                      </details>
                      <div className="history-actions">
                        <button
                          className="secondary-button compact-button"
                          type="button"
                          onClick={() => editInspection(inspection)}
                        >
                          ویرایش
                        </button>
                        <button
                          className="danger-button compact-button"
                          type="button"
                          onClick={() => deleteInspection(inspection)}
                        >
                          حذف این سابقه
                        </button>
                      </div>
                    </article>
                  );
                })}
                {!inspections.length ? (
                  <div className="empty-state">هنوز بازرسی ذخیره نشده است.</div>
                ) : null}
              </div>
            </section>
          </div>
        ) : null}

        {loaded && activeSection === "reports" ? (
          <div className="section-stack reports-page">
            <section className="report-actions panel">
              <div className="panel-heading">
                <div><p className="eyebrow">مدیریت داده</p><h2>خروجی و پشتیبان‌گیری</h2></div>
              </div>
              <div className="action-grid">
                <button className="action-card" onClick={exportCsv}>
                  <strong>خروجی Excel / CSV</strong>
                  <span>فهرست کامل موارد ایمنی و امتیازهای FMEA</span>
                </button>
                <button className="action-card" onClick={exportInspectionsCsv}>
                  <strong>خروجی Excel بازرسی‌ها</strong>
                  <span>نتیجهٔ تک‌تک موارد چک‌لیست، محل، بازرس و یادداشت</span>
                </button>
                <button className="action-card" onClick={exportBackup}>
                  <strong>دریافت فایل پشتیبان</strong>
                  <span>ذخیرهٔ تمام موارد و بازرسی‌ها در فایل JSON</span>
                </button>
                <label className="action-card file-action">
                  <strong>بازیابی انواع فایل پشتیبان</strong>
                  <span>JSON کامل، CSV موارد ایمنی یا CSV جزئیات بازرسی‌ها</span>
                  <input
                    type="file"
                    accept=".json,.csv,.tsv,.txt,.bak,.backup,application/json,text/csv,text/tab-separated-values,text/plain"
                    onChange={importBackup}
                  />
                </label>
                <button className="action-card" onClick={() => window.print()}>
                  <strong>چاپ گزارش مدیریتی</strong>
                  <span>نسخهٔ مناسب چاپ یا ذخیره به‌صورت PDF</span>
                </button>
              </div>
              <p className="security-hint">
                پیش از پاک‌کردن داده‌های مرورگر یا تعویض گوشی، حتماً فایل پشتیبان بگیرید.
              </p>
            </section>

            <section className="print-report panel" id="report-area">
              <div className="report-header">
                <div><p>گزارش مدیریتی ایمنی</p><h2>HSE FieldLog</h2></div>
                <span>{formatDate(new Date().toISOString())}</span>
              </div>
              <div className="report-metrics">
                <div><span>کل موارد</span><strong>{summary.total.toLocaleString("fa-IR")}</strong></div>
                <div><span>باز</span><strong>{summary.open.toLocaleString("fa-IR")}</strong></div>
                <div><span>ریسک بالا</span><strong>{summary.highRisk.toLocaleString("fa-IR")}</strong></div>
                <div><span>عقب‌افتاده</span><strong>{summary.overdue.toLocaleString("fa-IR")}</strong></div>
                <div><span>بسته‌شده</span><strong>{summary.closed.toLocaleString("fa-IR")}</strong></div>
                <div><span>بازرسی‌ها</span><strong>{inspections.length.toLocaleString("fa-IR")}</strong></div>
              </div>
              <div className="report-section-title">
                <div>
                  <span>پیگیری اقدام‌های اصلاحی</span>
                  <h3>جدول موارد ایمنی</h3>
                </div>
                <strong>{findings.length.toLocaleString("fa-IR")} مورد</strong>
              </div>
              <div className="report-table-wrap">
                <table>
                  <thead>
                    <tr><th>عنوان</th><th>محل / پیمانکار</th><th>RPN</th><th>وضعیت</th><th>مهلت</th></tr>
                  </thead>
                  <tbody>
                    {findings.map((finding) => {
                      const rpn = calculateRpn(
                        finding.severity,
                        finding.occurrence,
                        finding.detection,
                      );
                      return (
                        <tr key={finding.id}>
                          <td>{finding.title}</td>
                          <td>{finding.location}<small>{finding.contractor}</small></td>
                          <td><span className={`table-risk ${getRiskBand(rpn)}`}>{rpn.toLocaleString("fa-IR")}</span></td>
                          <td>{STATUS_LABELS[finding.status]}</td>
                          <td>{formatDate(finding.dueDate)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
                {!findings.length ? <div className="empty-state">داده‌ای برای گزارش وجود ندارد.</div> : null}
              </div>
              <div className="report-section-title inspection-report-heading">
                <div>
                  <span>پشتیبان قابل چاپ از سوابق چک‌لیست</span>
                  <h3>جدول جزئیات بازرسی‌ها</h3>
                </div>
                <strong>{inspections.length.toLocaleString("fa-IR")} بازرسی</strong>
              </div>
              <div className="report-table-wrap inspection-report-table">
                <table>
                  <thead>
                    <tr>
                      <th>چک‌لیست</th>
                      <th>محل / بازرس</th>
                      <th>تاریخ</th>
                      <th>مورد کنترلی</th>
                      <th>نتیجه</th>
                      <th>یادداشت</th>
                    </tr>
                  </thead>
                  <tbody>
                    {inspections.flatMap((inspection) =>
                      inspection.items.map((item, index) => (
                        <tr key={`${inspection.id}-${index}`}>
                          <td>{inspection.templateName}</td>
                          <td>
                            {inspection.location}
                            <small>{inspection.inspector}</small>
                          </td>
                          <td>
                            {formatDate(inspection.createdAt)}
                            {inspection.updatedAt && inspection.updatedAt !== inspection.createdAt ? (
                              <small>ویرایش: {formatDate(inspection.updatedAt)}</small>
                            ) : null}
                          </td>
                          <td>{item.label}</td>
                          <td>
                            <span className={`inspection-result-badge ${item.result}`}>
                              {CHECKLIST_RESULT_LABELS[item.result]}
                            </span>
                          </td>
                          <td>{inspection.notes || "—"}</td>
                        </tr>
                      )),
                    )}
                  </tbody>
                </table>
                {!inspections.length ? (
                  <div className="empty-state">بازرسی ثبت‌شده‌ای برای گزارش وجود ندارد.</div>
                ) : null}
              </div>
              <footer className="report-footer">
                این گزارش از داده‌های ذخیره‌شده روی دستگاه تهیه شده است.
                <span>HSE FieldLog · Ehsan Benvari · benvari.e@yahoo.com</span>
              </footer>
            </section>
          </div>
        ) : null}

        {loaded && activeSection === "about" ? (
          <div className="section-stack about-page">
            <section className="license-hero panel">
              <div className="license-copy">
                <p className="eyebrow">LICENSE &amp; CONTACT</p>
                <h2>مجوز نرم‌افزار و راه ارتباطی</h2>
                <p>
                  HSE FieldLog برای ثبت و پیگیری ایمنی کارگاه طراحی شده و نام
                  دارندهٔ حقوق اثر باید همراه نسخه‌های نرم‌افزار باقی بماند.
                </p>
              </div>
              <div className="license-seal" aria-label="نشان Ehsan Benvari">
                <strong>EB</strong>
                <span>HSE · SOFTWARE</span>
              </div>
            </section>

            <section className="license-grid">
              <article className="license-card panel owner-card">
                <p className="eyebrow">دارندهٔ مجوز و توسعه‌دهنده</p>
                <h3>Ehsan Benvari</h3>
                <p>
                  طراحی محصول، ساخت نسخهٔ وب و ویندوز و نگهداری اطلاعات تماس
                  این نرم‌افزار با نام فوق انجام شده است.
                </p>
                <div className="license-signature">
                  <span>© 2026</span>
                  <strong>Ehsan Benvari</strong>
                </div>
              </article>

              <article className="license-card panel">
                <p className="eyebrow">مجوز استفاده</p>
                <h3>MIT License</h3>
                <p>
                  استفاده، کپی و تغییر نرم‌افزار طبق شرایط مجوز MIT مجاز است؛
                  اطلاعیهٔ کپی‌رایت و متن مجوز باید در نسخه‌های توزیع‌شده حفظ شود.
                </p>
                <span className="license-tag">نسخهٔ ۱.۲.۰ · وب و ویندوز</span>
              </article>

              <article className="license-card panel contact-card">
                <p className="eyebrow">ارتباط و همکاری</p>
                <h3>با توسعه‌دهنده در ارتباط باشید</h3>
                <p>
                  برای همکاری، پیشنهاد قابلیت جدید، گزارش اشکال یا استفادهٔ
                  سازمانی از طریق ایمیل زیر پیام ارسال کنید.
                </p>
                <a className="contact-mail" href="mailto:benvari.e@yahoo.com">
                  <span>ارسال ایمیل به</span>
                  <strong dir="ltr">benvari.e@yahoo.com</strong>
                </a>
              </article>

              <article className="license-card panel privacy-card">
                <p className="eyebrow">حریم خصوصی</p>
                <h3>اطلاعات در اختیار شماست</h3>
                <p>
                  داده‌های نسخهٔ ویندوز و وب روی همان دستگاه ذخیره می‌شوند و
                  به‌صورت خودکار بین دستگاه‌ها همگام نمی‌شوند. برای جابه‌جایی
                  اطلاعات از فایل پشتیبان استفاده کنید.
                </p>
                <button className="secondary-button" onClick={() => setActiveSection("reports")}>
                  رفتن به پشتیبان‌گیری
                </button>
              </article>
            </section>
          </div>
        ) : null}
      </section>

      <nav className="mobile-nav" aria-label="ناوبری موبایل">
        {NAV_ITEMS.map((item) => (
          <button
            className={activeSection === item.id ? "active" : ""}
            key={item.id}
            onClick={() => setActiveSection(item.id)}
          >
            {item.label}
          </button>
        ))}
      </nav>

      {showFindingForm ? (
        <div className="modal-backdrop" role="presentation">
          <section className="modal-card" role="dialog" aria-modal="true" aria-labelledby="finding-title">
            <div className="modal-heading">
              <div><p className="eyebrow">ثبت سریع</p><h2 id="finding-title">مورد ایمنی جدید</h2></div>
              <button
                className="close-button"
                type="button"
                onClick={() => setShowFindingForm(false)}
                aria-label="بستن فرم"
              >×</button>
            </div>
            <form onSubmit={addFinding} className="finding-form">
              <div className="form-grid two-columns">
                <label className="span-two">
                  <span>عنوان مورد *</span>
                  <input
                    value={findingForm.title}
                    onChange={(event) => setFindingForm({ ...findingForm, title: event.target.value })}
                    placeholder="مثلاً کابل برق بدون دوشاخه صنعتی"
                    autoFocus
                    required
                  />
                </label>
                <label>
                  <span>محل مشاهده *</span>
                  <input
                    value={findingForm.location}
                    onChange={(event) => setFindingForm({ ...findingForm, location: event.target.value })}
                    placeholder="طبقه، پارت یا کارگاه"
                    required
                  />
                </label>
                <label>
                  <span>پیمانکار *</span>
                  <input
                    value={findingForm.contractor}
                    onChange={(event) => setFindingForm({ ...findingForm, contractor: event.target.value })}
                    placeholder="نام پیمانکار"
                    required
                  />
                </label>
                <label>
                  <span>دسته‌بندی</span>
                  <select
                    value={findingForm.category}
                    onChange={(event) => setFindingForm({ ...findingForm, category: event.target.value })}
                  >
                    {CATEGORIES.map((category) => <option key={category}>{category}</option>)}
                  </select>
                </label>
                <label>
                  <span>مسئول اقدام *</span>
                  <input
                    value={findingForm.responsible}
                    onChange={(event) => setFindingForm({ ...findingForm, responsible: event.target.value })}
                    placeholder="نام یا سمت مسئول"
                    required
                  />
                </label>
                <label>
                  <span>مهلت اصلاح *</span>
                  <input
                    type="date"
                    value={findingForm.dueDate}
                    onChange={(event) => setFindingForm({ ...findingForm, dueDate: event.target.value })}
                    required
                  />
                </label>
                <label className="span-two">
                  <span>شرح مشاهده و اقدام فوری</span>
                  <textarea
                    value={findingForm.description}
                    onChange={(event) => setFindingForm({ ...findingForm, description: event.target.value })}
                    placeholder="شرایط ناایمن، پیامد احتمالی و اقدام انجام‌شده را کوتاه بنویسید."
                    rows={3}
                  />
                </label>
              </div>

              <fieldset className="fmea-fieldset">
                <legend>ارزیابی FMEA</legend>
                <div className="fmea-grid">
                  {([[
                    "severity", "شدت پیامد", findingForm.severity],
                    ["occurrence", "احتمال وقوع", findingForm.occurrence],
                    ["detection", "دشواری کشف", findingForm.detection],
                  ] as const).map(([key, label, value]) => (
                    <label key={key}>
                      <span>{label}</span>
                      <select
                        value={value}
                        onChange={(event) =>
                          setFindingForm({ ...findingForm, [key]: Number(event.target.value) })
                        }
                      >
                        {[1, 2, 3, 4, 5].map((score) => (
                          <option key={score} value={score}>{score.toLocaleString("fa-IR")}</option>
                        ))}
                      </select>
                    </label>
                  ))}
                  <div className={`rpn-preview ${getRiskBand(formRpn)}`}>
                    <span>RPN</span>
                    <strong>{formRpn.toLocaleString("fa-IR")}</strong>
                    <small>{getRiskLabel(formRpn)}</small>
                  </div>
                </div>
              </fieldset>

              <div className="modal-actions">
                <button className="secondary-button" type="button" onClick={() => setShowFindingForm(false)}>انصراف</button>
                <button className="primary-button" type="submit">ثبت مورد ایمنی</button>
              </div>
            </form>
          </section>
        </div>
      ) : null}

      <div className={toast ? "toast visible" : "toast"} role="status" aria-live="polite">{toast}</div>
    </main>
  );
}
