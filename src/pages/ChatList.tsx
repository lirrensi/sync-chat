import {
    IonList,
    IonItem,
    IonLabel,
    IonAvatar,
    IonButton,
    IonItemOptions,
    IonItemGroup,
    IonItemDivider,
    IonItemOption,
    IonContent,
    IonHeader,
    IonPage,
    IonTitle,
    IonBackButton,
    useIonActionSheet,
    IonToolbar,
    IonItemSliding,
    IonListHeader,
    IonButtons,
    IonIcon,
    IonNote,
} from "@ionic/react";
import { pin, share, trash, chevronForward, archive, addCircleOutline, apertureOutline } from "ionicons/icons";

import { proxy, useSnapshot } from "valtio";
import store from "../common/store";

import { useIonRouter } from "@ionic/react";
import { sortEntitiesByStatus } from "../common/helpers/ui";

interface ContainerProps {
    // chats: [];
}

function timestampToTime(timestamp: number) {
    const date = new Date(timestamp);
    const hours = String(date.getHours()).padStart(2, "0");
    const minutes = String(date.getMinutes()).padStart(2, "0");
    return `${hours}:${minutes}`;
}

const ChatListItem: React.FC<any> = ({ chat, archived, chatClick, setChatState }) => {
    // const lastMessage = (chat: any) => {
    //     const messArr = Object.values(chat.messages);
    //     if (messArr.length === 0) {
    //         return {};
    //     }
    //     return messArr[messArr.length - 1];
    // };
    const chatStateDeletion = () => {
        if (chat.state === 4) {
            if (confirm("Are you sure to delete this note forever???")) {
                setChatState(chat, 5);
            }
        } else {
            setChatState(chat, 4);
        }
    };
    const [present] = useIonActionSheet();
    const promptChatState = () => {
        present({
            header: "Set note status",
            mode: "ios",
            buttons: [
                {
                    text: "Pinned to top",
                    handler() {
                        setChatState(chat, 2);
                    },
                },
                {
                    text: "Regular",
                    handler() {
                        setChatState(chat, 1);
                    },
                },
                {
                    text: "Archived",

                    handler() {
                        setChatState(chat, 3);
                    },
                },
                {
                    text: "Trash / remove",
                    role: "destructive",
                    handler() {
                        setChatState(chat, 4);
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
    const lastMess: any = chat.lastMessage || {};
    const lastMessageDisplay = (mess: any) => {
        if (mess.text) {
            return mess.text.length > 50 ? mess.text.substring(0, 50) + "..." : mess.text;
        } else if (mess.attachments && mess.attachments.length > 0) {
            return mess.attachments[0].name;
        } else return "";
    };
    return (
        <IonItemSliding key={chat.chat_id}>
            <IonItem button={true} onClick={() => chatClick(chat)}>
                <IonAvatar aria-hidden="true" slot="start">
                    {/* <img alt="" src="https://ionicframework.com/docs/img/demos/avatar.svg" /> */}
                    {/* TODO: add here color based on chat_name */}
                    <div
                        style={{
                            display: "flex",
                            justifyContent: "center",
                            alignItems: "center",
                            width: "100%",
                            height: "100%",
                            backgroundColor: "var(--ion-color-primary)",
                        }}
                    >
                        <span>{chat.chat_name?.toUpperCase().slice(0, 2)}</span>
                    </div>
                </IonAvatar>
                <IonLabel>
                    {chat.chat_name}
                    <br />
                    <IonNote color="medium" className="ion-text-wrap">
                        {lastMessageDisplay(lastMess)}
                        {/* last message substr max 20 symb; */}
                    </IonNote>
                </IonLabel>
                <div className="metadata-end-wrapper" slot="end">
                    <IonNote color="medium">{lastMess.created_at ? timestampToTime(lastMess.created_at) : ""}</IonNote>
                </div>
            </IonItem>
            <IonItemOptions slot="end">
                <IonItemOption color="danger" onClick={chatStateDeletion}>
                    <IonIcon slot="icon-only" icon={trash}></IonIcon>
                </IonItemOption>

                <IonItemOption color="tertiary" expandable={true} onClick={promptChatState}>
                    <IonIcon slot="icon-only" icon={apertureOutline}></IonIcon>
                </IonItemOption>
            </IonItemOptions>
        </IonItemSliding>
    );
};

const ChatList: React.FC<any> = () => {
    // const chats: any = Object.values(useSnapshot(store.chats));
    const { entityChats }: any = useSnapshot(store);
    const router = useIonRouter();

    // sort into categories then clean the mem;
    const greatChatList: any = sortEntitiesByStatus(
        Object.values(entityChats.chatsViewCompact).sort((a: any, b: any) => {
            // If both chats have lastMessage, compare their timestamps
            if (a.lastMessage && b.lastMessage) {
                const timestampA = a.lastMessage.modified_at || a.lastMessage.created_at;
                const timestampB = b.lastMessage.modified_at || b.lastMessage.created_at;
                return timestampB - timestampA; // Sort in descending order
            }
            // If only one chat has lastMessage, prioritize the one with a lastMessage
            else if (a.lastMessage) {
                return -1; // `a` comes before `b`
            } else if (b.lastMessage) {
                return 1; // `b` comes before `a`
            }
            // If neither chat has lastMessage, keep their order unchanged
            else {
                return 0;
            }
        })
    );

    // let chats = Object.values(entityChats.chatsViewCompact).sort((a: any, b: any) => {});

    // const chatListActive = [];
    // const chatListArchived = [];
    // for (const chat of chats as any) {
    //     if (chat.removed) continue;
    //     if (chat.archived) {
    //         chatListArchived.push(chat);
    //     } else {
    //         chatListActive.push(chat);
    //     }
    // }
    // // clear mem
    // chats = null;

    const chatClick = async (chat: any) => {
        await store.entityChats.setCurrentChat(chat.chat_id);
        router.push(`/home/chats/${chat.chat_id}`);
    };
    const createChat = async () => {
        const name = prompt("Enter chat name");
        if (!name) {
            alert("Chat name is required");
            return;
        }
        await store.entityChats.createChat(name);
    };
    const setChatState = (chat: any, state: number) => {
        store.entityChats.setChatState(chat, state);
    };

    // console.log("component => chats", Object.values(chats));
    return (
        <IonPage>
            <IonHeader>
                <IonToolbar>
                    <IonButtons slot="start">
                        <IonBackButton defaultHref="/" />
                    </IonButtons>

                    <IonTitle>Chats</IonTitle>
                    <IonButtons slot="end">
                        <IonIcon onClick={createChat} slot="icon-only" icon={addCircleOutline} />
                    </IonButtons>
                </IonToolbar>
            </IonHeader>
            <IonContent>
                {/* <ChatListItem chats={chatListActive} chatClick={chatClick} setChatState={setChatState} />
                <ChatListItem
                    archived={true}
                    chats={chatListArchived}
                    chatClick={chatClick}
                    removeChat={removeChat}
                    toggleArchiveChat={toggleArchiveChat}
                /> */}
                {Object.values(greatChatList).map(({ label, list }: any, index: number) => (
                    <IonItemGroup key={label}>
                        {list.length > 0 && (
                            <IonItemDivider>
                                <IonLabel>{label}</IonLabel>
                            </IonItemDivider>
                        )}
                        {list.length > 0 && (
                            <IonList>
                                {list.map((chat: any) => (
                                    <ChatListItem
                                        key={chat.chat_id}
                                        chat={chat}
                                        chatClick={chatClick}
                                        setChatState={setChatState}
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

export default ChatList;
