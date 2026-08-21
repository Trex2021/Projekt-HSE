import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const projectRoot = new URL("../", import.meta.url);

test("builds an offline Windows renderer with license and contact details", async () => {
  const html = await readFile(
    new URL("desktop/dist-renderer/index.html", projectRoot),
    "utf8",
  );
  const assets = await readFile(
    new URL("desktop/dist-renderer/assets/index.js", projectRoot),
    "utf8",
  ).catch(async () => {
    const manifest = await readFile(
      new URL("desktop/dist-renderer/index.html", projectRoot),
      "utf8",
    );
    const match = manifest.match(/src="\.\/(assets\/[^\"]+\.js)"/);
    assert.ok(match, "desktop JavaScript asset should use a relative path");
    return readFile(new URL(`desktop/dist-renderer/${match[1]}`, projectRoot), "utf8");
  });

  assert.match(html, /Content-Security-Policy/);
  assert.match(html, /src="\.\/assets\//);
  assert.match(assets, /Ehsan Benvari/);
  assert.match(assets, /benvari\.e@yahoo\.com/);
  assert.match(assets, /@Ehsanyone/);
  assert.match(assets, /حذف همه/);
  assert.match(assets, /ذخیرهٔ تغییرات بازرسی/);
  assert.match(assets, /جدول جزئیات بازرسی‌ها/);
  assert.match(assets, /خروجی Excel بازرسی‌ها/);
  assert.match(assets, /بازیابی انواع فایل پشتیبان/);
  assert.match(assets, /توضیحات ثبت‌شده و امتیازهای FMEA/);
  assert.match(assets, /توضیحی ثبت نشده است/);
  assert.match(assets, /نوع CSV شناخته نشد/);
  assert.match(assets, /نامرتبط/);
  assert.match(assets, /کتابخانه جامع ایمنی/);
  assert.match(assets, /لیفتراک/);
  assert.match(assets, /بهسازی منابع و مخازن آب/);
  assert.match(assets, /پیگیری اقدامات اصلاحی چک‌لیست‌ها/);
  assert.match(assets, /بازرسی تخته‌های زیرپایی داربست/);
  assert.match(assets, /نفت، گاز و پتروشیمی/);
  assert.match(assets, /ارزیابی ریسک اختصاصی محل/);
});

test("uses hardened Electron window settings", async () => {
  const [main, workflow] = await Promise.all([
    readFile(new URL("desktop/electron/main.cjs", projectRoot), "utf8"),
    readFile(new URL(".github/workflows/windows-portable.yml", projectRoot), "utf8"),
  ]);

  assert.match(main, /contextIsolation:\s*true/);
  assert.match(main, /nodeIntegration:\s*false/);
  assert.match(main, /sandbox:\s*true/);
  assert.match(main, /devTools:\s*false/);
  assert.match(main, /setPermissionRequestHandler/);
  assert.match(main, /benvari\.e@yahoo\.com/);
  assert.match(main, /https:\/\/t\.me\/Ehsanyone/);
  assert.match(main, /isApprovedExternalLink/);
  assert.match(main, /url\.href === TELEGRAM_URL/);
  assert.match(main, /--smoke-test/);
  assert.match(main, /did-finish-load/);
  assert.match(main, /did-fail-load/);
  assert.match(workflow, /win-unpacked\/HSE FieldLog\.exe/);
  assert.match(workflow, /HSE-FieldLog-Portable-1\.6\.1\.exe/);
  assert.match(workflow, /Start-Process/);
  assert.match(workflow, /Get-FileHash/);
});
