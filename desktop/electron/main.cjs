"use strict";

const path = require("node:path");
const { app, BrowserWindow, Menu, shell } = require("electron");

const APP_ID = "com.ehsanbenvari.hsefieldlog";
const CONTACT_EMAIL = "benvari.e@yahoo.com";

function isApprovedMailLink(value) {
  try {
    const url = new URL(value);
    return (
      url.protocol === "mailto:" &&
      url.pathname.toLowerCase() === CONTACT_EMAIL
    );
  } catch {
    return false;
  }
}

function openApprovedExternal(value) {
  if (isApprovedMailLink(value)) {
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

  window.once("ready-to-show", () => window.show());
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
