import { proxy } from "valtio";
import { subscribeKey } from "valtio/utils";

import { PeerManager } from "./class/PeerManager";
import { DatabaseManager, DATABASE_HANDLES } from "./class/DatabaseManager";
import { GunManager } from "./class/GunManager";
import { KeyManager, generateUUID } from "./helpers/crypto";
import { FileStorage } from "./helpers/files";

import { APP_USER_PREFIX } from "./constants";
import mitt from "mitt";

import { Chat, Message, Attachment, EntityFile, Note } from "./types";

// store is central controller and all
// have supportive classes but each does only specific things
// data flow: store function => database => return state to store;

// holds primary encryption key, do not touch!
const keyManager = new KeyManager();

// peer connection manager webRTC and gun layer
export const connMgr = new PeerManager();
export const gunManager = new GunManager();

// database and file storage access...
export const dbMgr = new DatabaseManager();
export const fileStorage = new FileStorage(dbMgr);

// supplemental app wide event bug
export const eventBus = mitt();

// store is central thing there everything happens;
// data change: change in store => save in db => return state to store => broadcast changes

const PEER_MESSAGES: string[] = [
    // entity/command or type

    // sends own list on nodes to all peers
    "nodes/broadcast",
    // send own chats state
    "ev/chats/push",
    // request for all connected peers to push their chats state
    "chats/request_push",

    // for small files, sending and requesting files is entirely...
    "attach/request_entire",
    "attach/send_entire",

    "attach/request_stream",
    "attach/send_stream",

    // new version
    // method to send all node sync request and get response
    // used in request response mode only
    "rq/all/sync",
    // sends the same as above but as sending data to all other peers for all the peers;
    "ev/all/push",

    // chats list update => can send either single chat full with all messages OR compact chats list for list changes;
    "ev/chats/push",
    "ev/files/push",
    "ev/notes/push",

    // NOTE => those related to file as a file, not the tabs...
    // request to check if node has file, used by regular handler
    "rq/file/check",
    "rq/file/full", // getting entire file at once
    "rq/file/stream", // getting file streamed to me...
];

class Store {
    // related to user account, machine links and keys
    auth = {
        user_id: "",
        machine_id: "",
        keyPassword: "",

        async createUser(password: string, storePassword = true) {
            console.log("creating new id => start");

            this.user_id = APP_USER_PREFIX + generateUUID();
            this.machine_id = generateUUID();
            // this.known_nodes = {
            //     [this.machine_id]: {
            //         machine_id: this.machine_id,
            //         active: true,
            //         device_name: window.navigator.userAgent || "",
            //         last_update: Date.now(),
            //     },
            // };

            console.log("creating new id => key generation");
            this.keyPassword = password;
            await keyManager.generateKey();

            if (storePassword) {
                localStorage.setItem("key-password", password);
            }

            const gunUserCreated = await gunManager.createUser(this.user_id, password);
            if (!gunUserCreated) {
                console.log("creating new id => gun failed");
                return false;
            }

            console.log("creating new id => done, saving state");
            console.log("AuthManager done, now saving state...", this);
            await this.saveState();
        },
        async exportCredentials() {
            const keyPass = this.getKeyPassword();
            const exportData = {
                user_id: this.user_id,
                // known_nodes: this.known_nodes,
                private_key: await keyManager.exportKeyString(keyPass),
            };
            return JSON.stringify(exportData);
        },
        async importCredentials(exportData: any, storePassword = true) {
            // validate
            if (!exportData.user_id || !exportData.private_key) {
                return false;
            }
            const password = prompt("Enter password for private key");
            if (!password) {
                return false;
            }
            this.user_id = exportData.user_id;
            this.machine_id = generateUUID();
            // this.known_nodes = exportData.known_nodes;
            // this.known_nodes[this.machine_id] = {
            //     machine_id: this.machine_id,
            //     active: true,
            //     device_name: window.navigator.userAgent || "",
            //     last_update: Date.now(),
            // };
            this.keyPassword = password;
            // TODO: add here errors of key decrypt;
            await keyManager.importKeyString(exportData.private_key, password);
            if (storePassword) {
                localStorage.setItem("key-password", password);
            }
            await this.saveState();
            return true;
        },

        getKeyPassword() {
            if (!this.keyPassword) {
                const savedPassword = localStorage.getItem("key-password");
                if (savedPassword) {
                    this.keyPassword = savedPassword;
                } else {
                    this.keyPassword = prompt("Enter password for private key");
                }
            }
            return this.keyPassword;
        },
        async loadState() {
            const databaseDocument: any = await dbMgr.returnState(DATABASE_HANDLES.auth);
            if (databaseDocument?.user_id) {
                console.log("loaded state => ", databaseDocument);
                this.user_id = databaseDocument.user_id;
                this.machine_id = databaseDocument.machine_id;
                // this.known_nodes = databaseDocument.known_nodes;
                await keyManager.importKeyString(databaseDocument.private_key, this.getKeyPassword());
            } else {
                console.log("no user state present...");
            }
        },
        async saveState() {
            const state = {
                user_id: this.user_id,
                machine_id: this.machine_id,
                // known_nodes: this.known_nodes,
                private_key: await keyManager.exportKeyString(this.keyPassword),
            };
            await dbMgr.updateUserData(state);
        },
    };

    // related to stats of current connections and the like
    stats = {
        connectionActive() {
            return Boolean(connMgr.connection?.open);
        },
        connectedPeers() {
            return Object.values(connMgr.connMap).filter((conn: any) => conn.open).length;
        },
        connectedPeersList() {
            return Object.entries(connMgr.connMap).map(([machine_id, conn]) => {
                return {
                    machine_id,
                    open: conn.open,
                };
            });
        },
    };

    // init functions => related to starting the app and making all correct working;
    // fist is entry function that starts all;
    init = {
        async initSavedState() {
            // init database, if empty then create basic, else restore saved;
            await dbMgr.init();
            // try to restore user state if present
            await store.auth.loadState();
            if (store.auth.user_id) {
                console.log("user state present!", store.auth);
                await gunManager.logIn(store.auth.user_id, store.auth.keyPassword);
                this.initConnections();
            } else {
                console.log("no user state present!", store);
            }

            // store.chats = ((await dbMgr.returnState("chats")) as any).chats;
            store.refreshStateFromDB();

            console.log("state from store updated", this);
        },
        initConnections() {
            connMgr.init().then(() => {
                // update gun with active state
                gunManager.signal(store.auth.machine_id, {
                    online: true,
                });
                // allow some time to connect to present nodes;
            });
        },
    };

    // functions related to syncing data with other peers;
    sync = {
        // send data to all connected peers, get response of their data;
        async onConnectSync() {
            // check with establishing connections to all nodes with short timeout;
            await connMgr.checkConnections_v2();
            if (store.stats.connectedPeers()) {
                console.log("connected peers exists, starting sync;");
                // extract current state and pack
                const docsSync = await dbMgr.returnSyncDocuments();
                // create request and send it to all peers
                // await response from each with short timeout
                const responses = await connMgr.peerRequestAll({
                    method: "rq/all/sync",
                    data: docsSync,
                    timeout: 8000,
                });
                const peersDocumentStates = responses.filter(resp => typeof resp === "object");
                // process response and replicate databases
                // for (const docs of responseDocs) {
                //     if (docs) {
                //         await dbMgr.processSyncDocuments(docs);
                //     }
                // }
                for (const peerDocument of peersDocumentStates) {
                    await store.sync.processSingleSyncDocument(peerDocument);
                }
            }
        },
        // handler for peer request of the same name;
        async onConnectSyncRequestHandler(peerDocument: any) {
            store.sync.processSingleSyncDocument(peerDocument);

            // docs out to send
            return await dbMgr.returnSyncDocuments();
        },
        async processSingleSyncDocument(doc: any) {
            await dbMgr.processSingleSyncDocument(doc);
            await store.refreshStateFromDB();
        },
    };

    async refreshStateFromDB() {
        return await Promise.all([
            this.entityChats.loadChats(),
            this.entityFiles.tabLoadFiles(),
            this.entityNotes.loadNotes(),
        ]);
    }

    // next is data view;
    entityChats: any = {
        // only holds chats lost but without all messages, only last message;
        chatsViewCompact: {},
        // current chat id for rendering;
        currentChatId: "",
        currentChatFull: null,

        async setCurrentChat(chatId: string | null) {
            if (chatId === null) {
                this.currentChatId = "";
                this.currentChatFull = null;
            } else {
                this.currentChatId = chatId;
                await this.loadChats();
            }
        },

        // when called => loads current chats from db, if any in compactView, and current chat if present as full;
        async loadChats() {
            const chats = ((await dbMgr.returnState(DATABASE_HANDLES.chats)) as any).chats;
            const chatsToDisplay: any = {};
            // chat here as full chat;
            for (const chat of Object.values(chats) as any) {
                // skip deleted entirely;
                if (chat.state === 5) {
                    continue;
                }
                const chatMessages = Object.values(chat.messages);
                chatsToDisplay[chat.chat_id] = {
                    ...chat,
                    messages: {},
                    lastMessage: chatMessages[chatMessages.length - 1],
                };

                if (this.currentChatId && this.currentChatId === chat.chat_id) {
                    this.currentChatFull = chat;
                }
            }
            this.chatsViewCompact = chatsToDisplay;
            console.log("chatsToDisplay", this);
        },
        // used when any chat internas state change, like messages add;
        async refreshChats() {
            // if have current chat => saves its share in db
            const chatsMerge = {
                ...this.chatsViewCompact,
            };
            if (this.currentChatFull) {
                chatsMerge[this.currentChatFull.chat_id] = this.currentChatFull;
            }
            await dbMgr.processSingleSyncDocument({
                chats: chatsMerge,
            });
            await this.loadChats();
            // await dbMgr.saveStateChats(store.chats);
            // store.chats = ((await dbMgr.returnState("chats")) as any).chats;
            // console.log("this.chats", store.chats);

            // store.broadcastMessage("ev/chats/push", store.chats);
            console.warn("refreshChats");
        },
        async setChatState(chat: Chat, state: number) {
            if (state === 5) {
                await this.deleteChat(chat);
                return;
            }
            this.chatsViewCompact[chat.chat_id].state = state;
            this.chatsViewCompact[chat.chat_id].modified_at = Date.now();
            await this.refreshChats();
            this.event_sendChatsPush();
        },
        // TODO: better nullify all;
        async deleteChat(chat: Chat) {
            this.chatsViewCompact[chat.chat_id].state = 5;
            this.chatsViewCompact[chat.chat_id].modified_at = Date.now();
            await this.refreshChats();
            this.event_sendChatsPush();
        },

        async createChat(chat_name: string) {
            const chat: Chat = {
                chat_id: generateUUID(),
                state: 1,
                chat_name,
                messages: {},
                messages_count: 0,
                modified_at: Date.now(),
            };
            this.chatsViewCompact[chat.chat_id] = chat;
            await this.refreshChats();
        },
        async createMessage({ chat_id, text, attachments }: { chat_id: string; text: string; attachments?: any[] }) {
            const message: Message = {
                message_id: generateUUID(),
                state: 1,
                created_at: Date.now(),
                text: text,
            };
            if (attachments?.length) {
                message.attachments = attachments.map(attArg => attArg.attachment);
                // await Promise.all(
                //     attachments.map(attArg => {
                //         store.entityFiles.storeFileLocal(attArg.attachment, attArg.file);
                //     })
                // );
                // NOTE: cannot at thesame time must do so sequesntially or getting an error;
                for (const attArg of attachments) {
                    await store.entityFiles.storeFileLocal(attArg.attachment, attArg.file);
                }
            }
            // console.log("message INCCCC", this);
            this.currentChatFull.messages[message.message_id] = message;
            this.currentChatFull.messages_count = Object.values(this.currentChatFull.messages).filter(
                (me: any) => !me.removed
            ).length;
            this.currentChatFull.modified_at = Date.now();

            await this.refreshChats();
            this.event_sendChatsPush();
            // await dbMgr.saveStateChats(store.chats);
            // store.chats = ((await dbMgr.returnState("chats")) as any).chats;
            // store.broadcastMessage("ev/chats/push", store.chats);
        },
        async deleteMessage(message_id: string) {
            this.currentChatFull.messages[message_id].removed = true;
            this.currentChatFull.messages[message_id].modified_at = Date.now();

            this.currentChatFull.messages_count = Object.values(this.currentChatFull.messages).filter(
                (me: any) => !me.removed
            ).length;
            this.currentChatFull.modified_at = Date.now();

            await this.refreshChats();
            this.event_sendChatsPush();
        },
        async editMessage(message_id: string, newText: string) {
            this.currentChatFull.messages[message_id].text = newText;
            this.currentChatFull.messages[message_id].modified_at = Date.now();

            this.currentChatFull.modified_at = Date.now();

            await this.refreshChats();
            this.event_sendChatsPush();
        },
        async event_sendChatsPush() {
            // TODO: broadcast all data must be from database only? ot can push right from state?
            const chatsMerge = {
                ...this.chatsViewCompact,
            };
            if (this.currentChatFull) {
                chatsMerge[this.currentChatFull.chat_id] = this.currentChatFull;
            }
            store.broadcastMessage("ev/chats/push", chatsMerge);
        },
        async event_onChatsPush(chatsMerge: any) {
            console.warn("event_onChatsPush", chatsMerge);
            // write to db first
            // then load as usual;
            await dbMgr.processSingleSyncDocument({
                chats: chatsMerge,
            });
            this.refreshChats();
        },
    };
    chats: {
        [key: string]: Chat;
    } = {};
    chatsControl = {
        currentChat: "",

        async loadChatsFromDB() {
            store.chats = ((await dbMgr.returnState("chats")) as any).chats;
        },
        // internal method to save in db state => current state => push;
    };
    // holds current state of attachments for chats ... if they loaded or not;
    attMap: any = {
        loadedFiles: {},
        pendingFiles: {},
    };
    attControl = {
        checkFileStatus(attachment: Attachment) {
            if (store.attMap.pendingFiles[attachment.attachment_id]) {
                return "pending";
            } else if (store.attMap.loadedFiles[attachment.attachment_id]) {
                return "loaded";
            } else {
                return "none";
            }
        },
        async requestFile(attachment: Attachment) {
            // TODO: check if any nodes connected beforehand
            // if less 2 mb download immidiately
            if (attachment.size <= 1024 * 1024 * 2) {
                const file = await new Promise((res, rej) => {
                    store.broadcastMessage("attach/request_entire", attachment);
                    // setTimeout as waiting too long...
                    const requestTimeout = setTimeout(() => {
                        res(null);
                    }, 60 * 1000);
                    const dbPollInterval = setInterval(async () => {
                        const fileLoaded = await fileStorage.checkAttachmentLoaded(attachment);
                        if (fileLoaded) {
                            // res(fileLoaded);
                            const file = await fileStorage.getFileBrowser(attachment);
                            res(file);

                            clearTimeout(requestTimeout);
                            clearInterval(dbPollInterval);
                        }
                    }, 250);
                });
            } else {
                console.warn("file too big to download");
            }
            // small files can be directly loaded;
            // store.attMap.loadedFiles[attachment.attachment_id] = true;
        },
    };

    // general file control, all methods are here;
    entityFiles: any = {
        // file structure for working with files tab.
        files: {},
        async tabLoadFiles() {
            const filesDocument: any = (await dbMgr.returnState(DATABASE_HANDLES.files)) as any;
            console.log("tabLoadFiles", filesDocument);
            this.files = {
                ...this.files,
                ...filesDocument.files,
            };
        },
        async tabAddFiles(files: File[]) {
            for (const file of files) {
                const attachment: Attachment = this.createAttachmentObject(file);
                const fileEntity: EntityFile = {
                    ...attachment,
                    file_name: attachment.name,
                    file_path: "/",
                };
                console.log("tabAddFiles", file, attachment, fileEntity, store.entityFiles);
                this.files[attachment.attachment_id] = fileEntity;
                // must add one by one or will get conflicts;
                await this.storeFileLocal(attachment, file);
            }
            await this.saveFilesState();
        },
        async saveFilesState() {
            await store.sync.processSingleSyncDocument({
                files: this.files,
            });
            await this.tabLoadFiles();
            this.event_sendFilesPush();
        },
        async tabRemoveFile(fileEntity: EntityFile) {
            this.files[fileEntity.attachment_id].removed = true;
            this.files[fileEntity.attachment_id].modified_at = Date.now();

            await this.saveFilesState();
        },

        createAttachmentObject(file: File): Attachment {
            if (!file) {
                return null;
            }
            return {
                attachment_id: generateUUID(),
                attachment_type: "file",
                created_at: Date.now(),
                name: file.name,
                size: file.size,
                type: file.type,
                lastModified: file.lastModified,
            };
        },

        // basic functions to work with files
        async checkFileExists(attachment: Attachment): Promise<boolean> {
            return dbMgr.fileAdapter.checkFileExists(attachment);
        },
        // used as a response to remote requests for file;
        async request_checkFileExists(attachment: Attachment): Promise<any> {
            let exists = false;
            if (attachment?.attachment_id) {
                exists = await store.entityFiles.checkFileExists(attachment.attachment_id);
            }
            return exists;
            //
        },
        async getFileLocal(attachment: Attachment, asFile: boolean = false): Promise<Blob | Buffer | null> {
            return dbMgr.fileAdapter.getFile(attachment, asFile);
        },
        async storeFileLocal(attachment: Attachment, file: File | Blob): Promise<void> {
            return dbMgr.fileAdapter.storeFile(attachment, file);
        },
        async getPeerThatHasFile(attachment: Attachment): Promise<string | null> {
            const connectedMachinesIds = connMgr.getConnectedMachines();
            if (!connectedMachinesIds.length) {
                return null;
            }

            let peerThatHasFile: string | null = null;

            for (const machine_id of connectedMachinesIds) {
                const hasFile = await connMgr.peerRequest(machine_id, {
                    method: "rq/file/check",
                    data: attachment,
                    timeout: 3 * 1000,
                });
                if (hasFile) {
                    peerThatHasFile = machine_id;
                    break;
                }
            }
            return peerThatHasFile;
        },
        // TODO remove all encryptions
        async getRemoteFile(attachment: Attachment, progressCallback: Function): Promise<string> {
            progressCallback?.(0.05);
            const peerThatHasFile = await this.getPeerThatHasFile(attachment);
            if (!peerThatHasFile) {
                return "no-peer";
            }
            progressCallback?.(0.15);

            progressCallback?.(0.33);

            const buffer = await connMgr.peerRequest(peerThatHasFile, {
                method: "rq/file/full",
                data: attachment,
                timeout: 60 * 1000,
            });
            console.log("got blob => ", buffer);
            if (!buffer) {
                return "no-file";
            }

            progressCallback?.(0.75);

            const blob = new Blob([buffer], { type: attachment.type });
            await this.storeFileLocal(attachment, blob);

            progressCallback?.(1.0);
            return "done";
        },
        async getRemoteFileStream(attachment: Attachment, progressCallback: Function): Promise<string> {
            progressCallback?.(0.05);
            const peerThatHasFile = await this.getPeerThatHasFile(attachment);
            if (!peerThatHasFile) {
                return "no-peer";
            }
            progressCallback?.(0.1);
            const buffer = await connMgr.peerRequestFile(peerThatHasFile, {
                method: "rq/file/stream",
                data: attachment,
                timeout: 60 * 1000,
                progressCallback,
            });
            console.log("got blob => ", buffer);
            if (!buffer) {
                return "no-file";
            }
            const blob = new Blob([buffer], { type: attachment.type });
            await this.storeFileLocal(attachment, blob);

            progressCallback?.(1.0);
            return "done";
        },
        async request_getRemoteFile(attachment: Attachment): Promise<Uint8Array> {
            const blob: any = await dbMgr.fileAdapter.getFile(attachment, false); //blob!
            return new Uint8Array(await blob.arrayBuffer());
        },

        async extractFilesFromChats() {
            return dbMgr.extractFilesFromChats();
        },

        async event_sendFilesPush() {
            // TODO: broadcast all data must be from database only? ot can push right from state?
            const filesDocument: any = (await dbMgr.returnState(DATABASE_HANDLES.files)) as any;
            store.broadcastMessage("ev/files/push", filesDocument.files);
        },
        async event_onFilesPush(files: any) {
            console.warn("event_onFilesPush", files);
            await dbMgr.processSingleSyncDocument({
                files,
            });
            this.tabLoadFiles();
        },
    };

    entityNotes: any = {
        notesViewCompact: {},
        currentNoteId: "",
        currentNoteFull: null,

        async selectNote(note_id: string | null) {
            if (note_id === null) {
                this.currentNoteId = "";
                this.currentNoteFull = null;
            } else {
                this.currentNoteId = note_id;
            }
            await this.loadNotes();
        },

        async loadNotes() {
            const notesDocument: any = (await dbMgr.returnState(DATABASE_HANDLES.notes)) as any;
            for (const note of Object.values(notesDocument.notes) as any) {
                if (note.state === 5) {
                    continue;
                }
                // need to create a copy, so when we delete contents by reference, it would not remove the original
                const noteCopy = { ...note };
                // load without content for the display...
                this.notesViewCompact[noteCopy.note_id] = noteCopy;
                // add content preview
                let contentPreview = "";
                if (noteCopy.note_type === "text") {
                    contentPreview = noteCopy.content.text_content?.substring(0, 32) || "";
                }
                this.notesViewCompact[noteCopy.note_id].preview = contentPreview;
                // empty contents to save mem
                this.notesViewCompact[noteCopy.note_id].content = {};

                // TODO: add a preview for later...

                // if one selected, load if entirely...
                if (this.currentNoteId === note.note_id) {
                    this.currentNoteFull = note;
                }
            }
            console.log("loadNotes", [this.notesViewCompact, this.currentNoteId, this.currentNoteFull]);
        },
        async saveNotesState() {
            const mergeDocument = {
                ...this.notesViewCompact,
            };
            if (this.currentNoteId) {
                mergeDocument[this.currentNoteFull.note_id] = this.currentNoteFull;
            }
            await dbMgr.processSingleSyncDocument({
                notes: mergeDocument,
            });
        },
        async afterNotesChange() {
            await this.saveNotesState();
            this.event_sendNotesPush();
            await this.loadNotes();
        },
        getNoteTemplate(type: string) {
            const template: Note = {
                note_id: generateUUID(),
                created_at: Date.now(),
                note_type: type,
                state: 1,
                color: null,
                note_title: "",
                content: {},
            };
            if (type === "text") {
                template.content.text_content = "";
            }
            return template;
        },
        async createNoteAndStartEdit(type: string) {
            const noteTemplate = this.getNoteTemplate(type);
            console.log("createNoteAndStartEdit", noteTemplate);
            this.notesViewCompact[noteTemplate.note_id] = noteTemplate;
            this.currentNoteId = noteTemplate.note_id;
            this.currentNoteFull = noteTemplate;

            await this.afterNotesChange();
            return noteTemplate;
        },
        async setNoteState(note: Note, state: number) {
            if (state === 5) {
                await this.deleteNoteEntirely(note);
                return;
            }
            this.notesViewCompact[note.note_id].state = state;
            this.notesViewCompact[note.note_id].modified_at = Date.now();
            console.log("setNoteState", this.notesViewCompact[note.note_id]);
            await this.afterNotesChange();
        },
        async deleteNoteEntirely(note: Note) {
            this.notesViewCompact[note.note_id] = {
                node_id: note.note_id,
                state: 5,
                modified_at: Date.now(),
            };
            await this.afterNotesChange();
        },
        async setNoteChanges({ note_title, color, content }: any) {
            this.currentNoteFull = {
                ...this.currentNoteFull,
                note_title,
                color,
                content,
                modified_at: Date.now(),
            };
            await this.afterNotesChange();
        },
        async event_sendNotesPush() {
            // TODO: broadcast all data must be from database only? ot can push right from state?
            const notesMerge = {
                ...this.notesViewCompact,
            };
            if (this.currentNoteId) {
                notesMerge[this.currentNoteFull.note_id] = this.currentNoteFull;
            }
            store.broadcastMessage("ev/notes/push", notesMerge);
        },
        async event_onNotesPush(notesMerge: any) {
            await dbMgr.processSingleSyncDocument({
                notes: notesMerge,
            });
            await this.loadNotes();
            eventBus.emit("internalEvent/noteStateChange");
        },
    };

    constructor() {
        console.log("store initialized!");
    }

    // TODO: import user also must have the same path;
    async deleteUserLogin() {
        // send all nodes a signal to remove => get acks at least one
        // delete saved password, db entires all and reset everything with full reloyad
        await dbMgr.dropDatabase();
        window.location.replace("/");
    }

    async encryptData(data: any) {
        return keyManager.encryptData(data);
    }
    async decryptData(data: any) {
        return keyManager.decryptData(data);
    }
    async handleMessage(message: any) {
        // const message: any = await this.decryptData(data);
        if (!message) {
            console.warn("could not decrypt message =>", message);
            return;
        }
        // console.log("handleMessage => ", message);
        if (message.event === "ev/chats/push") {
            store.entityChats.event_onChatsPush(message.document);
        }
        if (message.event === "ev/files/push") {
            store.entityFiles.event_onFilesPush(message.document);
        }
        if (message.event === "ev/notes/push") {
            store.entityNotes.event_onNotesPush(message.document);
        }
    }
    async broadcastMessage(event: string, document: any) {
        // const data = await this.encryptData({ event, document });
        // if (!data) {
        //     console.error("could not encrypt message =>", data);
        //     return;
        // }
        // console.log("broadcast message => ", event);
        // connMgr.broadcastMessage(data);
        connMgr.broadcastMessage({ event, document });
    }
    // @deprecated, now in gun;
    // async broadcastKnownNodes() {
    //     this.broadcastMessage("nodes/broadcast", this.auth.known_nodes);
    // }

    // TODO: rename as main page all sync
    requestUpdates() {
        const connectedPeers = connMgr.getConnectedPeeers();
        console.log("connectedPeers", connectedPeers);
        if (connectedPeers.length > 0) {
            // this.broadcastMessage("chats/request_push", null);
            store.sync.onConnectSync();
            return true;
        } else {
            return false;
        }
    }
}
export const store = proxy(new Store());

// watch known_nodes and broadcast on change;
// deprecated as store is in gun now;
// subscribeKey(store.auth, "known_nodes", known_nodes => {
//     console.log("known_nodes has changed to", known_nodes);
//     if (connMgr.started) {
//         store.broadcastKnownNodes();
//     }
// });
// watch chats
// subscribeKey(store, "chats", chats => {
//     console.log("known_nodes has changed to", chats);
//     if (connMgr.started) {
//         store.broadcastMessage("ev/chats/push", chats);
//     }
// });

// export default store;
export default store;
