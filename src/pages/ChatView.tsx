import "./Chat.css";
import {
    IonContent,
    IonHeader,
    IonPage,
    IonTitle,
    IonToolbar,
    IonIcon,
    IonButtons,
    IonTextarea,
    IonBackButton,
    useIonActionSheet,
    IonFooter,
    IonInput,
    IonButton,
    IonRefresher,
    IonRefresherContent,
    RefresherEventDetail,
    useIonToast,
} from "@ionic/react";
import { useState, createRef, useEffect, useRef } from "react";
import { cogOutline, send, attach, close as iconClose } from "ionicons/icons";
import { useIonRouter } from "@ionic/react";

import AutoGrowInput from "../components/AutoGrowInput";

import { promptFileBasic, existingFileDownload } from "../common/helpers/files";

import { proxy, useSnapshot } from "valtio";
import { store, fileStorage } from "../common/store";

import { displayDate } from "../common/helpers/ui";
import bytes from "bytes";

import { Attachment } from "../common/types";
import AttachmentCard from "../components/AttachmentCard";
import { useIonViewWillLeave } from "@ionic/react";
import { useLongPress } from "@uidotdev/usehooks";

const Message: React.FC<any> = ({ message, startMessageEdit }) => {
    const longPress = useLongPress(
        () => {
            openMessageContextMenu();
        },
        {
            threshold: 750,
        }
    );

    const [present] = useIonActionSheet();

    const openMessageContextMenu = () => {
        present({
            header: "Message",
            mode: "ios",
            buttons: [
                {
                    text: "Edit",
                    handler() {
                        console.log("Edit clicked");
                        startMessageEdit(message);
                    },
                },
                {
                    text: "Share",
                    handler() {
                        console.log("Share clicked");
                    },
                },
                {
                    text: "Delete",
                    role: "destructive",
                    handler() {
                        console.log("Delete clicked");
                        deleteMessage();
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

    const deleteMessage = async () => {
        store.entityChats.deleteMessage(message.message_id);
    };

    return (
        <div className="message-container">
            {message.attachments && (
                <div className="attachment-container">
                    {message.attachments.map((attachment: any) => (
                        <AttachmentCard key={attachment.attachment_id} attachment={attachment} />
                    ))}
                </div>
            )}
            {message.text && (
                <div {...longPress} className="entry-message">
                    <div className="entry-message-main-text">{message.text}</div>
                    <div className="entry-message-sub-text">
                        {displayDate(message.modified_at || message.created_at)}
                    </div>
                </div>
            )}
        </div>
    );
};

const ChatView: React.FC<any> = () => {
    const state = useSnapshot(store);
    // const router = useIonRouter();

    // const chat = state.chats[state.chatsControl.currentChat];
    const chat = state.entityChats.currentChatFull || { messages: {} };
    const messages = Object.values(chat.messages).filter((me: any) => !me.removed);

    const contentRef = createRef<HTMLIonContentElement>();
    useEffect(() => {
        contentRef.current?.scrollToBottom(1);
    }, []);
    useIonViewWillLeave(() => {
        store.entityChats.setCurrentChat(null);
    });

    const [message, setMessage] = useState("");
    const [attachments, setAttachments] = useState([]);
    const [grow, setGrow] = useState(true);
    const [messageEdit, setMessageEdit] = useState(null);

    const sendMessage = async () => {
        if (message.length === 0 && attachments.length === 0) {
            return;
        }
        // scroll before state changes and rerender occur
        contentRef.current?.scrollToBottom(500);

        await store.entityChats.createMessage({
            chat_id: chat.chat_id,
            text: message,
            attachments: attachments,
        });

        contentRef.current?.scrollToBottom(500);
        // console.log('messages not => ', )
        setMessage("");
        setAttachments([]);
    };
    // final function to commit message
    const editMessage = async () => {
        if (message.length === 0 && attachments.length === 0) {
            return;
        }

        await store.entityChats.editMessage(messageEdit.message_id, message);

        setMessage("");
        setMessageEdit(null);
        setAttachments([]);
    };
    // set UI to edit message;
    const startMessageEdit = (message: any) => {
        setMessageEdit(message);
        setMessage(message.text);
    };
    const stopMessageEdit = () => {
        setMessage("");
        setMessageEdit(null);
        setAttachments([]);
    };

    const selectFiles = async () => {
        const fileObjs: any = await promptFileBasic();
        console.log("fileObjs", fileObjs);
        setAttachments(fileObjs);
    };
    const removeFile = (attachment_id: string) => {
        setAttachments(attachments.filter((attObj: any) => attObj.attachment.attachment_id !== attachment_id));
    };

    return (
        <IonPage>
            <IonToolbar>
                <IonButtons slot="start">
                    <IonButtons slot="start">
                        <IonBackButton defaultHref="/" />
                    </IonButtons>
                </IonButtons>
                <IonTitle>{chat.chat_name}</IonTitle>
            </IonToolbar>
            <IonContent ref={contentRef}>
                {messages.map((message: any) => (
                    <Message
                        key={message.message_id}
                        message={message}
                        startMessageEdit={(message: any) => startMessageEdit(message)}
                    />
                ))}
            </IonContent>
            <IonFooter className="footer-top-level-container">
                {messageEdit && (
                    <div className="footer-attachments-container">
                        <div className="footer-attachment-entry">
                            <div>
                                <div>editing:</div>
                                <div>{messageEdit.text.substring(0, 24)}... </div>
                            </div>
                            <IonIcon
                                onClick={() => stopMessageEdit()}
                                className=""
                                slot="icon-only"
                                icon={iconClose}
                            ></IonIcon>
                        </div>
                    </div>
                )}
                <div className="footer-attachments-container">
                    {attachments.map((attObj: any) => (
                        <div className="footer-attachment-entry" key={attObj.attachment.attachment_id}>
                            <div>
                                <div>
                                    {attObj.attachment.name}{" "}
                                    <span style={{ fontSize: "12px", opacity: 0.8 }}>
                                        {bytes(attObj.attachment.size)}
                                    </span>
                                </div>
                            </div>
                            <IonIcon
                                onClick={() => removeFile(attObj.attachment.attachment_id)}
                                className=""
                                slot="icon-only"
                                icon={iconClose}
                            ></IonIcon>
                        </div>
                    ))}
                </div>
                <div className="footer-input-container">
                    <IonTextarea
                        className="footer-input"
                        placeholder="Message..."
                        autoGrow={grow}
                        wrap="soft"
                        value={message}
                        onIonInput={e => {
                            const message = e.target.value;
                            setMessage(message);
                            setGrow(message.length >= 50);
                            // console.log("current message...", message);
                        }}
                    />
                    <div className="footer-right-container">
                        <div className="footer-right-icon-container" onClick={() => selectFiles()}>
                            <IonIcon slot="icon-only" icon={attach}></IonIcon>
                        </div>
                        <div
                            className="footer-right-icon-container"
                            onClick={() => {
                                messageEdit ? editMessage() : sendMessage();
                            }}
                        >
                            <IonIcon className="footer-right-icon" slot="icon-only" icon={send}></IonIcon>
                        </div>
                    </div>
                </div>
            </IonFooter>
        </IonPage>
    );
};

export default ChatView;
