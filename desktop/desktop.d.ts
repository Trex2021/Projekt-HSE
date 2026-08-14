export {};

declare global {
  interface Window {
    hseDesktop?: Readonly<{
      appName: "HSE FieldLog";
      platform: string;
    }>;
  }
}
