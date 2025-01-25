import "./NoteView.css";
import {
    IonList,
    IonItem,
    IonLabel,
    IonAvatar,
    IonButton,
    IonModal,
    IonItemOptions,
    IonItemOption,
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
    IonNote,
} from "@ionic/react";
import { HexColorPicker } from "react-colorful";
import { shareSocialOutline } from "ionicons/icons";
import { useEffect, useState } from "react";
import { proxy, useSnapshot } from "valtio";
import { store, eventBus } from "../common/store";
import { promptFilesAndReturnJustFiles } from "../common/helpers/files";
import { debounce } from "lodash";
import { useRef } from "react";
import { useIonRouter } from "@ionic/react";

import { useIonViewWillLeave } from "@ionic/react";

import ReactQuill from "react-quill";
import "react-quill/dist/quill.snow.css"; // or another theme/style
import "react-quill/dist/quill.bubble.css"; // core theme
import { displayDate } from "../common/helpers/ui";
import { readableColor } from "polished";
import { unifiedShare } from "../common/helpers/share";
import striptags from "striptags";
import he from "he";

interface ContainerProps {
    // chats: [];
}

const ColorPickerComponent: React.FC<any> = ({ value, onChangeValue }) => {
    const predefColors = [
        "#97ead2",
        "#3c91e6",
        "#a80874",
        "#d3bdb0",
        "#ffe74c",
        "#fc9f5b",
        "#a7cecb",
        "#ba3b46",
        "#2e4756",
        "#2e933c",
    ];
    const [isOpen, setIsOpen] = useState(false);
    const [pickerValue, setPickerValue] = useState(value);

    const [extendedPickerOpen, setExtendedPickerOpen] = useState(false);

    const pickerOnChange = (color: string) => {
        setPickerValue(color);
        onChangeValue(color);
    };
    // readableColor throws an error if the color is invalid
    const textColor = () => {
        try {
            return readableColor(pickerValue);
        } catch (e) {
            return "unset";
        }
    };
    return (
        <>
            <div className="color-selection-external">
                <div style={{ backgroundColor: pickerValue }} onClick={() => setIsOpen(true)}></div>
            </div>
            <IonModal isOpen={isOpen}>
                <IonHeader>
                    <IonToolbar>
                        <IonTitle>Color picker</IonTitle>
                        <IonButtons slot="end">
                            <IonButton onClick={() => setIsOpen(false)}>Close</IonButton>
                        </IonButtons>
                    </IonToolbar>
                </IonHeader>
                <IonContent className="ion-padding">
                    <div
                        className="color-selected-block-display"
                        style={{ backgroundColor: pickerValue, color: textColor() }}
                    >
                        Note color
                    </div>
                    <div
                        className="color-selected-block-display"
                        style={{ backgroundColor: "", border: "1px solid grey" }}
                        onClick={() => pickerOnChange("")}
                    >
                        No color
                    </div>
                    {/* show preselection of colors */}
                    <div className="color-selection-container">
                        {predefColors.map(color => (
                            <div
                                key={color}
                                className={color === value ? "color-active" : ""}
                                style={{ backgroundColor: color }}
                                onClick={() => pickerOnChange(color)}
                            ></div>
                        ))}
                    </div>
                    {/* and an extended color picker */}
                    <br></br>
                    <br></br>

                    <HexColorPicker color={"#fff"} onChange={pickerOnChange} style={{ width: "100%" }} />
                </IonContent>
            </IonModal>
        </>
    );
};

// this component decouples from store, unlike chats... as we update many times when writing, its better to not save on each keystroke and push events
// read from store => current state initially...
// on change => delay save in db and refresh from store (debounced)
// on external event => saving and db and repainting from there

// create initial state from store
// on changes manual => push update, that will be saved in DB, then pushed to other clients (also on dismount)
// listen to event inside component - which is after the new data from server added to db, so I can grab from it once again.

const NoteView: React.FC<any> = () => {
    const state: any = useSnapshot(store);

    const intRef = useRef(null);

    // initial state as in store, after that, component lives own life and updates independently
    let currentNote = state.entityNotes.currentNoteFull || {};
    const internalState: any = useRef({});
    const retrieveCurrentStoreState = () => {
        currentNote = store.entityNotes.currentNoteFull;
        // console.warn("gott to refresh note state from db!", currentNote, store.entityNotes.currentNoteFull);
        internalState.current = {
            note_type: currentNote.note_type,
            note_title: currentNote.note_title,
            color: currentNote.color,
        };
        setNoteTitle(currentNote.note_title);
        setNoteColor(currentNote.color);
        if (internalState.current?.note_type === "text") {
            internalState.current.content = currentNote.content?.text_content || "";
            setNoteContent(internalState.current.content);
        }
    };
    useEffect(() => {
        retrieveCurrentStoreState();
        // TODO: sub and unsub for event on note change...
        eventBus.on("internalEvent/noteStateChange", retrieveCurrentStoreState);
        return () => {
            eventBus.off("internalEvent/noteStateChange", retrieveCurrentStoreState);
        };
    }, []);
    useIonViewWillLeave(() => {
        // store.entityNotes.selectNote(null);
        // internalState.current = {};
        console.log("useIonViewWillLeave");
        clearInterval(intRef.current);
        setTimeout(() => {
            store.entityNotes.selectNote(null);
        }, 100);
    });

    // title and placeholder if empty
    const [noteTitle, setNoteTitle] = useState(currentNote.note_title);
    const [noteTitlePlaceHolder, setNoteTitlePlaceholder] = useState("");
    // color
    const [noteColor, setNoteColor] = useState(currentNote.color);
    // content value => may be different, set initially upon render
    const editorRef = useRef(null);
    const [noteContent, setNoteContent] = useState(null);

    // on content change from this editor => to change title if left empty
    useEffect(() => {
        if (internalState.current?.note_type === "text") {
            // set placeholder when title would be empty...
            if (noteContent?.length > 0) {
                const clean = he.decode(striptags(noteContent));
                setNoteTitlePlaceholder(clean.substring(0, 48));
            } else {
                // set as 'note created at ...'
                setNoteTitlePlaceholder("note created at " + displayDate(currentNote.created_at));
            }
        }
    }, [noteContent]);

    const onTitleChange = (content: string) => {
        internalState.current.note_title = content;
        setNoteTitle(internalState.current.note_title);
        setNoteChanges();
    };
    const onPickerChange = (color: string) => {
        console.log("onPickerChange", color);
        internalState.current.color = color;
        setNoteColor(internalState.current.color);
        setNoteChanges();
    };
    const handleContentChange = (content: string) => {
        console.log("handleContentChange", content);
        internalState.current.content = content;
        setNoteContent(internalState.current.content);
        setNoteChanges();
    };

    const noteUpdateTimeoutRef = useRef<any>();
    const setNoteChanges = () => {
        clearTimeout(noteUpdateTimeoutRef.current);
        const currentStateCopy = { ...internalState.current };
        // console.warn("setNoteChanges", currentStateCopy);

        noteUpdateTimeoutRef.current = setTimeout(() => {
            const noteTitleCalculated = internalState.current.note_title.trim()
                ? he.decode(striptags(internalState.current.note_title.trim()))
                : he.decode(striptags(noteTitlePlaceHolder.trim()));
            const dataPush: any = {
                note_title: noteTitleCalculated,
                color: internalState.current.color,
                content: {},
            };
            if (internalState.current.note_type === "text") {
                dataPush.content.text_content = internalState.current.content;
            }
            // console.warn("saving new note state => ", dataPush);
            store.entityNotes.setNoteChanges(dataPush);
        }, 1000);
    };
    const shareNote = () => {
        unifiedShare("noteSimpleText", internalState.current.content);
    };

    return (
        <IonPage>
            <IonHeader>
                <IonToolbar>
                    <IonButtons slot="start">
                        <IonBackButton defaultHref="/" />
                    </IonButtons>
                    <IonButtons slot="end">
                        <IonIcon onClick={shareNote} slot="icon-only" icon={shareSocialOutline} />
                    </IonButtons>

                    <IonTitle>Edit note</IonTitle>
                </IonToolbar>
            </IonHeader>
            <IonContent className="ion-padding">
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <IonInput
                        value={noteTitle}
                        placeholder={noteTitlePlaceHolder}
                        onIonInput={(e: any) => onTitleChange(e.detail.value!)}
                        label="Title"
                        fill="outline"
                        labelPlacement="stacked"
                        type="text"
                    />
                    <ColorPickerComponent value={noteColor} onChangeValue={onPickerChange} />
                </div>

                <ReactQuill
                    ref={editorRef}
                    theme="snow"
                    value={noteContent}
                    onChange={handleContentChange}
                    modules={{
                        toolbar: false,
                    }}
                    placeholder="Start typing here..."
                />
            </IonContent>
        </IonPage>
    );
};

export default NoteView;
