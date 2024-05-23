import { useState } from "react";
import {
    IonContent,
    IonHeader,
    IonPage,
    IonTitle,
    IonToolbar,
    IonButtons,
    IonBackButton,
    IonButton,
} from "@ionic/react";
// import snapshop valtio
import { proxy, useSnapshot } from "valtio";
import store from "../common/store";

import QRCodePresenter from "../components/QRCodePresenter";

import { makeDownloadFile, parseJSONFile } from "../common/helpers/files";

import { v4, validate } from "uuid";

const Settings: React.FC = () => {
    const state = useSnapshot(store);
    const [qrCodeExportModal, set_qrCodeExportModal] = useState(false);
    const [qrCodeString, set_qrCodeString] = useState("");

    const generateUser = async () => {
        const password = prompt("Enter a password for the private key; 16 chars +");
        if (password && password.length >= 16) {
            // @ts-ignore
            await store.generateUser(password);
        } else {
            alert("Password must be at least 8 characters long");
        }
    };

    const deleteAll = async () => {
        if (confirm("Are you sure?")) {
            store.deleteUserLogin();
        }
    };

    const generateAndShowExportQR = async () => {
        const exportSrc = await store.auth.exportCredentials();
        set_qrCodeString(exportSrc);
        set_qrCodeExportModal(true);
        console.log("generateAndShowExport", [exportSrc, qrCodeExportModal, qrCodeString]);
    };
    const generateAndExportFile = async () => {
        const exportSrc = await store.auth.exportCredentials();
        makeDownloadFile(exportSrc, "syncNex.json");
    };

    const manualImportFile = () => {
        // Create an input element
        const input = document.createElement("input");
        input.type = "file";
        input.style.display = "none"; // Hide the input element

        // Listen for change event on the input element
        input.addEventListener("change", async (event: any) => {
            const selectedFile = event.target.files[0]; // Get the selected file
            // Do something with the selected file
            const parsedJson = await parseJSONFile(selectedFile);
            console.log("Selected file:", parsedJson);
            if (parsedJson) {
                // import here...
                store.auth.importCredentials(parsedJson);
            }
        });

        // Append the input element to the body
        document.body.appendChild(input);

        // Simulate a click on the input element
        input.click();
    };

    return (
        <IonPage>
            <IonHeader>
                <IonToolbar>
                    <IonButtons slot="start">
                        <IonBackButton defaultHref="/home" />
                        {/* Specify the defaultHref to navigate to if there's no history */}
                    </IonButtons>
                    <IonTitle>Settings</IonTitle>
                </IonToolbar>
            </IonHeader>
            <IonContent fullscreen className="ion-padding">
                <h1>User state:</h1>
                {/* if initialied */}
                {state.auth.user_id && (
                    <div>
                        <h2>user_id: {state.auth.user_id}</h2>
                        <h2>machine_id: {state.auth.machine_id}</h2>
                        <IonButton onClick={generateAndShowExportQR}>add another device with qr code</IonButton>
                        <IonButton onClick={generateAndExportFile}>add another device with file</IonButton>
                        <IonButton color="danger" onClick={deleteAll}>
                            delete all local data
                        </IonButton>
                    </div>
                )}
                {/* if not initialized */}
                {!state.auth.user_id && (
                    <div>
                        <h2>no user present</h2>
                        <IonButton onClick={generateUser}>generate</IonButton>
                        <IonButton onClick={manualImportFile}>add manually with file</IonButton>
                    </div>
                )}
            </IonContent>

            {/* modal components */}
            <QRCodePresenter
                // @ts-ignore
                isOpen={qrCodeExportModal}
                setIsOpen={(value: boolean) => set_qrCodeExportModal(value)}
                qrCodeString={qrCodeString}
            />
        </IonPage>
    );
};

export default Settings;
