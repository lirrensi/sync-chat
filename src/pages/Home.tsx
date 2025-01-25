import {
    IonContent,
    IonHeader,
    IonPage,
    IonTitle,
    IonToolbar,
    IonIcon,
    IonButtons,
    IonCard,
    IonCardHeader,
    IonCardTitle,
    IonCardContent,
    IonCardSubtitle,
    IonButton,
    IonRefresher,
    IonRefresherContent,
    RefresherEventDetail,
    useIonToast,
} from "@ionic/react";
import { cogOutline } from "ionicons/icons";
import { useIonRouter } from "@ionic/react";
import { useEffect } from "react";

import { proxy, useSnapshot } from "valtio";
import store from "../common/store";

import ChatsView from "./ChatList";
import "./Home.css";

const Home: React.FC = () => {
    const state = useSnapshot(store);
    const router = useIonRouter();

    useEffect(() => {
        setTimeout(() => {
            if (!store.auth.user_id) {
                router.push("/settings");
            }
        }, 100);
    }, []);

    const [present] = useIonToast();
    const handleRefresh = (event: CustomEvent<RefresherEventDetail>) => {
        const result = store.requestUpdates();
        if (!result) {
            present({
                message: "No peers connected to request updates...",
                duration: 1000,
                position: "bottom",
            });
        }
        setTimeout(() => {
            event.detail.complete();
        }, 250);
    };
    return (
        <IonPage>
            <IonHeader>
                <IonToolbar>
                    <IonButtons slot="start">
                        <IonButton
                            onClick={() => {
                                router.push("/settings");
                            }}
                        >
                            <IonIcon slot="icon-only" icon={cogOutline}></IonIcon>
                        </IonButton>
                    </IonButtons>
                    <IonTitle>SyncNex</IonTitle>
                </IonToolbar>
            </IonHeader>
            <IonContent>
                <IonRefresher slot="fixed" onIonRefresh={handleRefresh}>
                    <IonRefresherContent></IonRefresherContent>
                </IonRefresher>
                {state.auth.user_id && (
                    <>
                        <IonCard onClick={() => router.push("/home/chats")}>
                            <IonCardHeader>
                                <IonCardTitle>Chats</IonCardTitle>
                                <IonCardSubtitle>List of chats</IonCardSubtitle>
                            </IonCardHeader>
                        </IonCard>
                        <IonCard onClick={() => router.push("/home/files")}>
                            <IonCardHeader>
                                <IonCardTitle>Files</IonCardTitle>
                                <IonCardSubtitle>List of files</IonCardSubtitle>
                            </IonCardHeader>
                        </IonCard>
                        <IonCard onClick={() => router.push("/home/notes")}>
                            <IonCardHeader>
                                <IonCardTitle>Notes</IonCardTitle>
                                <IonCardSubtitle>List of notes</IonCardSubtitle>
                            </IonCardHeader>
                        </IonCard>
                    </>
                )}
                {!state.auth.user_id && (
                    <div className="ion-text-center ion-padding">
                        <h1>no user present --- open settings and setup</h1>
                    </div>
                )}
            </IonContent>
        </IonPage>
    );
};

export default Home;
