// import "./NoteList.css";
import {
    IonList,
    IonItem,
    IonLabel,
    IonAvatar,
    IonButton,
    IonModal,
    IonItemOptions,
    IonItemOption,
    IonItemGroup,
    IonItemDivider,
    IonContent,
    IonInput,
    IonHeader,
    IonPage,
    IonTitle,
    IonBackButton,
    IonToolbar,
    IonItemSliding,
    IonListHeader,
    IonButtons,
    useIonAlert,
    IonIcon,
    useIonActionSheet,
    IonNote,
} from "@ionic/react";
import { HexColorPicker } from "react-colorful";
import {
    pin,
    share,
    trash,
    chevronForward,
    archive,
    addOutline,
    addCircleOutline,
    apertureOutline,
} from "ionicons/icons";
import { useEffect, useState } from "react";
import { proxy, useSnapshot } from "valtio";
import store from "../common/store";
import { promptFilesAndReturnJustFiles } from "../common/helpers/files";
import { debounce } from "lodash";
import { useRef } from "react";
import { useIonRouter } from "@ionic/react";

import ReactQuill from "react-quill";
import "react-quill/dist/quill.snow.css"; // or another theme/style
import "react-quill/dist/quill.bubble.css"; // core theme

import { displayDate, sortEntitiesByStatus } from "../common/helpers/ui";
import striptags from "striptags";
import he from "he";
interface ContainerProps {
    // chats: [];
}

const NoteListItem: React.FC<any> = ({ note, noteClick, setNoteState }) => {
    const noteStateDeletion = () => {
        if (note.state === 4) {
            if (confirm("Are you sure to delete this note forever???")) {
                setNoteState(note, 5);
            }
        } else {
            setNoteState(note, 4);
        }
    };
    const [present] = useIonActionSheet();
    const promptNoteState = () => {
        present({
            header: "Set note status",
            mode: "ios",
            buttons: [
                {
                    text: "Pinned to top",
                    handler() {
                        setNoteState(note, 2);
                    },
                },
                {
                    text: "Regular",
                    handler() {
                        setNoteState(note, 1);
                    },
                },
                {
                    text: "Archived",

                    handler() {
                        setNoteState(note, 3);
                    },
                },
                {
                    text: "Trash / remove",
                    role: "destructive",
                    handler() {
                        setNoteState(note, 4);
                    },
                },
                {
                    text: "Cancel",
                    role: "cancel",
                    data: {
                        action: "cancel",
                    },
                },
            ],
        });
    };
    return (
        <IonItemSliding>
            <IonItem button={true} onClick={() => noteClick(note)}>
                <div style={{ background: note.color, width: "10px", height: "100%", marginRight: "15px" }}></div>
                {/* <IonAvatar aria-hidden="true" slot="start">
                    <IonIcon slot="icon-only" icon={addCircleOutline} />
                </IonAvatar> */}
                <IonLabel>
                    {note.note_title || "New text note..."}
                    <br />
                    <IonNote color="medium" className="ion-text-wrap">
                        {/* TODO: implement previre */}

                        {note.preview ? he.decode(striptags(note.preview)) : ""}
                    </IonNote>
                </IonLabel>
                <div className="metadata-end-wrapper" slot="end">
                    <IonNote color="medium">{displayDate(note.modified_at || note.created_at)}</IonNote>
                </div>
            </IonItem>
            <IonItemOptions slot="end">
                <IonItemOption color="danger" onClick={noteStateDeletion}>
                    <IonIcon slot="icon-only" icon={trash}></IonIcon>
                </IonItemOption>

                <IonItemOption color="tertiary" expandable={true} onClick={promptNoteState}>
                    <IonIcon slot="icon-only" icon={apertureOutline}></IonIcon>
                </IonItemOption>
            </IonItemOptions>
        </IonItemSliding>
    );
};

const NoteList: React.FC<any> = () => {
    const state: any = useSnapshot(store);
    const router = useIonRouter();

    // sort into categories then clean the mem;
    const greatNoteList: any = sortEntitiesByStatus(
        Object.values(state.entityNotes.notesViewCompact).sort((a: any, b: any) => {
            return (b.modified_at || b.created_at) - (a.modified_at || a.created_at);
        })
    );

    const [presentAlert] = useIonAlert();
    const addNewNote = () => {
        presentAlert({
            header: "Add note",
            message: "Simple note, checklist or todo, outline map... your choice!",
            buttons: [
                { text: "Note", handler: () => createNewNoteAndOpenEditor("Note") },
                { text: "Checklist", handler: () => createNewNoteAndOpenEditor("Checklist") },
                { text: "Outline", handler: () => createNewNoteAndOpenEditor("Outline") },
            ],
        });
    };

    const createNewNoteAndOpenEditor = async (type: string) => {
        if (type === "Note") {
            const newNote = await store.entityNotes.createNoteAndStartEdit("text");
            router.push(`/home/notes/${newNote.note_id}`);
        } else {
            alert("Not implemented yet");
        }
    };

    const noteClick = async (note: any) => {
        await store.entityNotes.selectNote(note.note_id);
        router.push(`/home/notes/${note.note_id}`);
    };
    const setNoteState = async (note: any, state: number) => {
        await store.entityNotes.setNoteState(note, state);
    };
    // const toggleArchive = async (note: any) => {
    //     await store.entityNotes.toggleArchive(note);
    // };
    // const toggleRemoveNote = async (note: any) => {
    //     await store.entityNotes.toggleRemove(note);
    // };
    // const deleteNote = async (note: any) => {
    //     await store.entityNotes.deleteNote(note);
    // };

    return (
        <IonPage>
            <IonHeader>
                <IonToolbar>
                    <IonButtons slot="start">
                        <IonBackButton defaultHref="/" />
                    </IonButtons>
                    <IonButtons slot="end">
                        <IonIcon onClick={addNewNote} slot="icon-only" icon={addCircleOutline} />
                    </IonButtons>

                    <IonTitle>Notes</IonTitle>
                </IonToolbar>
            </IonHeader>
            <IonContent>
                {Object.values(greatNoteList).map(({ label, list }: any, index: number) => (
                    <IonItemGroup key={label}>
                        {list.length > 0 && (
                            <IonItemDivider>
                                <IonLabel>{label}</IonLabel>
                            </IonItemDivider>
                        )}
                        {list.length > 0 && (
                            <IonList>
                                {list.map((note: any) => (
                                    <NoteListItem
                                        key={note.note_id}
                                        note={note}
                                        noteClick={noteClick}
                                        setNoteState={setNoteState}
                                    />
                                ))}
                            </IonList>
                        )}
                    </IonItemGroup>
                ))}
            </IonContent>
        </IonPage>
    );
};

export default NoteList;
