import assert from "node:assert/strict";
import { readdir, readFile, stat } from "node:fs/promises";
import test from "node:test";

const projectRoot = new URL("../", import.meta.url);

async function read(relativePath) {
  return readFile(new URL(relativePath, projectRoot), "utf8");
}

test("configures a private, offline Android package at version 1.6.2", async () => {
  const [config, gradle, manifest, variables, filePaths, unitTest, workflow] = await Promise.all([
    read("capacitor.config.ts"),
    read("android/app/build.gradle"),
    read("android/app/src/main/AndroidManifest.xml"),
    read("android/variables.gradle"),
    read("android/app/src/main/res/xml/file_paths.xml"),
    read("android/app/src/test/java/com/ehsanbenvari/hsefieldlog/BasicUnitTest.java"),
    read(".github/workflows/android-apk.yml"),
  ]);

  assert.match(config, /appId:\s*"com\.ehsanbenvari\.hsefieldlog"/);
  assert.match(config, /webDir:\s*"desktop\/dist-renderer"/);
  assert.match(config, /loggingBehavior:\s*"none"/);
  assert.match(config, /webContentsDebuggingEnabled:\s*false/);
  assert.match(config, /allowMixedContent:\s*false/);
  assert.match(gradle, /applicationId\s+"com\.ehsanbenvari\.hsefieldlog"/);
  assert.match(gradle, /versionCode\s+20/);
  assert.match(gradle, /versionName\s+"1\.6\.2"/);
  assert.match(unitTest, /assertEquals\("1\.6\.2", BuildConfig\.VERSION_NAME\)/);
  assert.match(unitTest, /assertEquals\(20, BuildConfig\.VERSION_CODE\)/);
  assert.match(workflow, /HSE-FieldLog-Android-1\.6\.2\.apk/);
  assert.match(workflow, /versionCode='20' versionName='1\.6\.2'/);
  assert.match(variables, /minSdkVersion\s*=\s*24/);
  assert.match(variables, /targetSdkVersion\s*=\s*36/);
  assert.match(manifest, /android:allowBackup="false"/);
  assert.match(manifest, /android:usesCleartextTraffic="false"/);
  assert.doesNotMatch(manifest, /android\.permission\.INTERNET/);
  assert.match(filePaths, /<cache-path\s+name="shared_exports"\s+path="\."\s*\/>/);
  assert.doesNotMatch(filePaths, /external-path/);
});

test("routes Android management reports through the native print service", async () => {
  const [source, activity, printer] = await Promise.all([
    read("app/page.tsx"),
    read("android/app/src/main/java/com/ehsanbenvari/hsefieldlog/MainActivity.java"),
    read("android/app/src/main/java/com/ehsanbenvari/hsefieldlog/HsePrinterPlugin.java"),
  ]);

  assert.match(source, /registerPlugin<HsePrinterPlugin>\("HsePrinter"\)/);
  assert.match(source, /Capacitor\.getPlatform\(\)\s*!==\s*"android"/);
  assert.match(source, /await HsePrinter\.print/);
  assert.match(source, /onClick=\{printManagementReport\}/);
  assert.match(source, /window\.print\(\)/);
  assert.doesNotMatch(source, /onClick=\{\(\) => window\.print\(\)\}/);
  assert.match(activity, /registerPlugin\(HsePrinterPlugin\.class\)/);
  assert.match(printer, /@CapacitorPlugin\(name = "HsePrinter"\)/);
  assert.match(printer, /getActivity\(\)\.runOnUiThread/);
  assert.match(printer, /Context\.PRINT_SERVICE/);
  assert.match(printer, /createPrintDocumentAdapter\(jobName\)/);
  assert.match(printer, /PrintAttributes\.MediaSize\.ISO_A4/);
});

test("packages native backup sharing with the complete Persian interface", async () => {
  const source = await read("app/page.tsx");
  const assetsDirectory = new URL(
    "android/app/src/main/assets/public/assets/",
    projectRoot,
  );
  const assetNames = await readdir(assetsDirectory);
  const javascriptNames = assetNames.filter((name) => name.endsWith(".js"));
  assert.ok(javascriptNames.length > 0, "Android JavaScript assets should exist");
  const javascript = (
    await Promise.all(
      javascriptNames.map((name) =>
        readFile(new URL(name, assetsDirectory), "utf8"),
      ),
    )
  ).join("\n");

  assert.match(source, /Capacitor\.isNativePlatform\(\)/);
  assert.match(source, /Filesystem\.writeFile/);
  assert.match(source, /Share\.share/);
  assert.match(javascript, /HsePrinter/);
  assert.match(javascript, /ذخیره به‌صورت PDF/);
  assert.match(javascript, /Ehsan Benvari/);
  assert.match(javascript, /benvari\.e@yahoo\.com/);
  assert.match(javascript, /@Ehsanyone/);
  assert.match(javascript, /AppLauncher/);
  assert.match(javascript, /بازیابی انواع فایل پشتیبان/);
  assert.match(javascript, /توضیحات ثبت‌شده و امتیازهای FMEA/);
  assert.match(javascript, /توضیحی ثبت نشده است/);
  assert.match(javascript, /ذخیره یا اشتراک‌گذاری فایل/);
  assert.match(javascript, /ذخیرهٔ تغییرات بازرسی/);
  assert.match(javascript, /نامرتبط/);
  assert.match(javascript, /کتابخانه جامع ایمنی/);
  assert.match(javascript, /لیفتراک/);
  assert.match(javascript, /بهسازی منابع و مخازن آب/);
  assert.match(javascript, /پیگیری اقدامات اصلاحی چک‌لیست‌ها/);
  assert.match(javascript, /بازرسی تخته‌های زیرپایی داربست/);
  assert.match(javascript, /نفت، گاز و پتروشیمی/);
  assert.match(javascript, /ارزیابی ریسک اختصاصی محل/);
});

test("uses branded launcher and splash artwork", async () => {
  const launcher = await readFile(
    new URL("android/app/src/main/res/mipmap-xxxhdpi/ic_launcher.png", projectRoot),
  );
  const splashPath = new URL(
    "android/app/src/main/res/drawable-port-xxxhdpi/splash.png",
    projectRoot,
  );
  const splash = await readFile(splashPath);

  assert.deepEqual([...launcher.subarray(0, 8)], [137, 80, 78, 71, 13, 10, 26, 10]);
  assert.deepEqual([...splash.subarray(0, 8)], [137, 80, 78, 71, 13, 10, 26, 10]);
  assert.ok(launcher.length > 8_000, "launcher icon should contain branded artwork");
  assert.ok((await stat(splashPath)).size > 15_000, "splash should contain branded artwork");
});
