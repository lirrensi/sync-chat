import "./FileList.css";
import {
    IonList,
    IonItem,
    IonLabel,
    IonAvatar,
    IonButton,
    IonItemOptions,
    IonItemOption,
    IonContent,
    IonHeader,
    IonPage,
    IonTitle,
    IonBackButton,
    IonToolbar,
    IonItemSliding,
    IonListHeader,
    IonButtons,
    IonIcon,
    IonNote,
} from "@ionic/react";
import { pin, share, trash, chevronForward, archive, addOutline } from "ionicons/icons";
import { useEffect, useState } from "react";
import { proxy, useSnapshot } from "valtio";
import store from "../common/store";
import { promptFilesAndReturnJustFiles } from "../common/helpers/files";
import { debounce } from "lodash";

import { useIonRouter } from "@ionic/react";

import AttachmentCard from "../components/AttachmentCard";

interface ContainerProps {
    // chats: [];
}

function timestampToTime(timestamp: number) {
    const date = new Date(timestamp);
    const hours = String(date.getHours()).padStart(2, "0");
    const minutes = String(date.getMinutes()).padStart(2, "0");
    return `${hours}:${minutes}`;
}

const FileList: React.FC<any> = () => {
    const state: any = useSnapshot(store);
    const router = useIonRouter();

    const [filesFromChats, setFilesFromChats] = useState([]);
    useEffect(() => {
        store.entityFiles.extractFilesFromChats().then((files: any[]) => {
            files.sort((a: any, b: any) => b.created_at - a.created_at);
            setFilesFromChats(files);
            console.log("extractFilesFromChats", files);
        });
    }, []);

    const filesTab = Object.values(state.entityFiles.files)
        .filter((file: any) => !file.removed)
        .sort((a: any, b: any) => b.created_at - a.created_at);

    const addFiles = async () => {
        const fileList = await promptFilesAndReturnJustFiles();
        if (fileList.length) {
            await store.entityFiles.tabAddFiles(fileList);
        }
    };

    const removeFile = async (file: any) => {
        if (confirm("Delete file?")) {
            await store.entityFiles.tabRemoveFile(file);
        }
    };

    return (
        <IonPage>
            <IonHeader>
                <IonToolbar>
                    <IonButtons slot="start">
                        <IonBackButton defaultHref="/" />
                    </IonButtons>

                    <IonTitle>Files</IonTitle>
                </IonToolbar>
            </IonHeader>
            <IonContent className="ion-padding">
                <IonButton
                    onClick={addFiles}
                    expand="full"
                    shape="round"
                    fill="outline"
                    style={{ borderRadius: "999px" }} // Ensures the button is fully rounded
                >
                    <IonIcon icon={addOutline} slot="start" />
                    Add files
                </IonButton>

                {Boolean(filesTab.length) && (
                    <>
                        <h1>Files</h1>
                        {filesTab.map((att: any) => (
                            <div key={att.attachment_id} onDoubleClick={() => removeFile(att)}>
                                <AttachmentCard attachment={att} />
                            </div>
                        ))}
                    </>
                )}
                {Boolean(filesFromChats.length) && (
                    <>
                        <h1>Files from chats</h1>
                        {filesFromChats.map((att: any) => (
                            <AttachmentCard key={att.attachment_id} attachment={att} />
                        ))}
                    </>
                )}
            </IonContent>
        </IonPage>
    );
};

export default FileList;
