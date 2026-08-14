import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "com.ehsanbenvari.hsefieldlog",
  appName: "HSE FieldLog",
  webDir: "desktop/dist-renderer",
  backgroundColor: "#f2f4f0",
  loggingBehavior: "none",
  android: {
    allowMixedContent: false,
    backgroundColor: "#f2f4f0",
    webContentsDebuggingEnabled: false,
  },
};

export default config;
