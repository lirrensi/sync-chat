import { isPlatform } from "@ionic/react";
import { IonButton, useIonToast } from "@ionic/react";
// const [present] = useIonToast();

export async function unifiedShare(type: string, data: any) {
    const dataToShare: any = {};
    if (["chatMessage", "noteSimpleText"].includes(type)) {
        dataToShare.text = data;
    }

    if (isPlatform("capacitor")) {
    }
    if (isPlatform("electron")) {
    }

    if (isPlatform("mobileweb")) {
        if (navigator.share) {
            try {
                await navigator.share(dataToShare);
            } catch (error) {
                console.warn("Error sharing:", error);
            }
        }
    } else {
        // TODO: show toast
        console.warn("share not supported on this platform");
        // presentToast("Share not supported or not available");
    }
}
