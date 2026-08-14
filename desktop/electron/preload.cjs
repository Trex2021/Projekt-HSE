"use strict";

const { contextBridge } = require("electron");

contextBridge.exposeInMainWorld(
  "hseDesktop",
  Object.freeze({
    appName: "HSE FieldLog",
    platform: process.platform,
  }),
);
