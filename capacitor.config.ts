import { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
    appId: "com.kurwa.bobr",
    appName: "bobr",
    webDir: "dist",
    server: {
        androidScheme: "https",
    },
};

export default config;
