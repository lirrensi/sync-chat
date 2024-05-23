import { useState, useEffect } from "react";
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
import { store, gunManager } from "../common/store";

import QRCodePresenter from "../components/QRCodePresenter";

import { makeDownloadFile, parseJSONFile } from "../common/helpers/files";

import { v4, validate } from "uuid";

const Settings: React.FC = () => {
    const state = useSnapshot(store);

    const [gunActive, setGunActive] = useState(false);
    useEffect(() => {
        setGunActive(gunManager.auth);
    }, []);

    const [qrCodeExportModal, set_qrCodeExportModal] = useState(false);
    const [qrCodeString, set_qrCodeString] = useState("");

    const generateUser = async () => {
        const password = prompt("Enter a password for the private key; 16 chars +");
        if (password && password.length >= 16) {
            await store.auth.createUser(password);
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

    const manualImportFile = async () => {
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
                const success = await store.auth.importCredentials(parsedJson);
                if (success) {
                    setTimeout(() => {
                        window.location.replace("/");
                    }, 500);
                } else {
                    alert("Failed to import credentials");
                }
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
                <h1>Account:</h1>
                {/* if initialied */}
                {state.auth.user_id && (
                    <div>
                        <p>user_id: {state.auth.user_id}</p>
                        <p>machine_id: {state.auth.machine_id}</p>
                        <br></br>
                        <p>Gun active: {gunActive ? "yes" : "no"}</p>

                        <p>Connection active: {state.stats.connectionActive() ? "yes" : "no"}</p>
                        <p>Connected peers: {state.stats.connectedPeers()}</p>
                        {state.stats.connectedPeersList().map(peer => (
                            <p key={peer.machine_id}>
                                {peer.machine_id} --- {peer.open}
                            </p>
                        ))}
                        <br></br>
                        <br></br>
                        <div>
                            <IonButton onClick={generateAndShowExportQR}>Export to QR code</IonButton>
                        </div>
                        <div>
                            <IonButton onClick={generateAndExportFile}>Export to file</IonButton>
                        </div>
                        <div>
                            <IonButton color="danger" onClick={deleteAll}>
                                delete all local data
                            </IonButton>
                        </div>
                    </div>
                )}
                {/* if not initialized */}
                {!state.auth.user_id && (
                    <div>
                        <h1>No credentials</h1>
                        <div>
                            <IonButton onClick={generateUser}>Generate account</IonButton>
                        </div>
                        <div>
                            <IonButton onClick={manualImportFile}>Import from file</IonButton>
                        </div>
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
