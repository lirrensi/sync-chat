import { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
    appId: "com.syncchat.syncchat",
    appName: "syncchat",
    webDir: "dist",
    server: {
        androidScheme: "https",
    },
};

export default config;
