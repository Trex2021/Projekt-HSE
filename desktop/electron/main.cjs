"use strict";

const path = require("node:path");
const { app, BrowserWindow, Menu, shell } = require("electron");

const APP_ID = "com.ehsanbenvari.hsefieldlog";
const CONTACT_EMAIL = "benvari.e@yahoo.com";
const TELEGRAM_URL = "https://t.me/Ehsanyone";
const IS_SMOKE_TEST = process.argv.includes("--smoke-test");

function isApprovedExternalLink(value) {
  try {
    const url = new URL(value);
    const isContactEmail =
      url.protocol === "mailto:" &&
      url.pathname.toLowerCase() === CONTACT_EMAIL;
    const isTelegramContact = url.href === TELEGRAM_URL;
    return isContactEmail || isTelegramContact;
  } catch {
    return false;
  }
}

function openApprovedExternal(value) {
  if (isApprovedExternalLink(value)) {
    void shell.openExternal(value);
  }
}

function createWindow() {
  const window = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 920,
    minHeight: 640,
    show: false,
    title: "HSE FieldLog",
    backgroundColor: "#f2f4f0",
    icon: path.join(__dirname, "..", "assets", "icon.png"),
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
      devTools: false,
    },
  });

  window.webContents.session.setPermissionRequestHandler(
    (_webContents, _permission, callback) => callback(false),
  );

  window.webContents.setWindowOpenHandler(({ url }) => {
    openApprovedExternal(url);
    return { action: "deny" };
  });

  window.webContents.on("will-navigate", (event, url) => {
    if (url === window.webContents.getURL()) return;
    event.preventDefault();
    openApprovedExternal(url);
  });

  window.webContents.on("will-attach-webview", (event) => {
    event.preventDefault();
  });

  window.webContents.once("did-finish-load", () => {
    if (!IS_SMOKE_TEST) return;
    console.log("HSE FieldLog renderer loaded successfully.");
    app.quit();
  });

  window.webContents.once("did-fail-load", (_event, errorCode, errorDescription) => {
    if (!IS_SMOKE_TEST) return;
    console.error(`HSE FieldLog renderer failed: ${errorCode} ${errorDescription}`);
    process.exitCode = 1;
    app.quit();
  });

  window.once("ready-to-show", () => {
    if (!IS_SMOKE_TEST) window.show();
  });
  void window.loadFile(
    path.join(__dirname, "..", "dist-renderer", "index.html"),
  );
}

const hasSingleInstanceLock = app.requestSingleInstanceLock();

if (!hasSingleInstanceLock) {
  app.quit();
} else {
  app.setAppUserModelId(APP_ID);
  app.setAboutPanelOptions({
    applicationName: "HSE FieldLog",
    applicationVersion: app.getVersion(),
    copyright: "Copyright © 2026 Ehsan Benvari",
    authors: ["Ehsan Benvari"],
    website: `mailto:${CONTACT_EMAIL}`,
  });

  app.on("second-instance", () => {
    const [window] = BrowserWindow.getAllWindows();
    if (!window) return;
    if (window.isMinimized()) window.restore();
    window.focus();
  });

  app.whenReady().then(() => {
    Menu.setApplicationMenu(null);
    createWindow();

    app.on("activate", () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
  });

  app.on("window-all-closed", () => {
    if (process.platform !== "darwin") app.quit();
  });
}
