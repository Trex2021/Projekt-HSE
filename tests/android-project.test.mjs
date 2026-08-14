import assert from "node:assert/strict";
import { readdir, readFile, stat } from "node:fs/promises";
import test from "node:test";

const projectRoot = new URL("../", import.meta.url);

async function read(relativePath) {
  return readFile(new URL(relativePath, projectRoot), "utf8");
}

test("configures a private, offline Android package at version 1.2.0", async () => {
  const [config, gradle, manifest, variables, filePaths] = await Promise.all([
    read("capacitor.config.ts"),
    read("android/app/build.gradle"),
    read("android/app/src/main/AndroidManifest.xml"),
    read("android/variables.gradle"),
    read("android/app/src/main/res/xml/file_paths.xml"),
  ]);

  assert.match(config, /appId:\s*"com\.ehsanbenvari\.hsefieldlog"/);
  assert.match(config, /webDir:\s*"desktop\/dist-renderer"/);
  assert.match(config, /loggingBehavior:\s*"none"/);
  assert.match(config, /webContentsDebuggingEnabled:\s*false/);
  assert.match(config, /allowMixedContent:\s*false/);
  assert.match(gradle, /applicationId\s+"com\.ehsanbenvari\.hsefieldlog"/);
  assert.match(gradle, /versionCode\s+12/);
  assert.match(gradle, /versionName\s+"1\.2\.0"/);
  assert.match(variables, /minSdkVersion\s*=\s*24/);
  assert.match(variables, /targetSdkVersion\s*=\s*36/);
  assert.match(manifest, /android:allowBackup="false"/);
  assert.match(manifest, /android:usesCleartextTraffic="false"/);
  assert.doesNotMatch(manifest, /android\.permission\.INTERNET/);
  assert.match(filePaths, /<cache-path\s+name="shared_exports"\s+path="\."\s*\/>/);
  assert.doesNotMatch(filePaths, /external-path/);
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
  assert.match(javascript, /Ehsan Benvari/);
  assert.match(javascript, /benvari\.e@yahoo\.com/);
  assert.match(javascript, /بازیابی انواع فایل پشتیبان/);
  assert.match(javascript, /ذخیره یا اشتراک‌گذاری فایل/);
  assert.match(javascript, /ذخیرهٔ تغییرات بازرسی/);
  assert.match(javascript, /نامرتبط/);
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
