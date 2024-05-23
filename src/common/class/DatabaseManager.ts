import PouchDB from "pouchdb";
import { generateUUID } from "../helpers/crypto";

import { DATABASE_NAME_CHATS } from "../constants";
import { Attachment, Chat } from "../types";

import { merge as loMerge, mergeWith, intersection } from "lodash";

export const DATABASE_HANDLES = {
    auth: "auth",
    chats: "chats_tab",
    files: "files_tab",
    notes: "notes_tab",

    files_attachments: "files_attachments",
};

// TODO remake local db to adapt to possible db as pouch or sqlite and also file storage - as in db or other...
// database and file storage backends are different, can have one or the other.
// browser => pouch for all both db and files;
// mobile => pouch for db and files are in folder
// desktop => pouch/sqlite and files folder, also different folders?
// how?
// class for pouch, general, and class for file storage which is subclass => which uses parent methods;

export class DatabaseManager {
    db: PouchDB.Database;
    fileAdapter: FileAdapterPouch;

    constructor() {
        this.db = new PouchDB("syncnex");
        this.fileAdapter = new FileAdapterPouch(this);
    }
    async createDocumentIfNotExists(handle: string, template: any) {
        try {
            // Check if the document already exists
            await this.db.get(handle);

            // If the document exists, do nothing
            console.log(`${handle} document already exists.`);
        } catch (error: any) {
            if (error.status === 404) {
                // If the document doesn't exist, create it
                await this.db.put(template);
                console.log("top_level document created successfully.");
            } else {
                // Handle other errors
                console.error("Error checking document existence:", error);
            }
        }
    }
    async init() {
        try {
            await Promise.all([
                // LOCAL ONLY => this part holds only auth data, this client only
                this.createDocumentIfNotExists(DATABASE_HANDLES.auth, {
                    _id: DATABASE_HANDLES.auth,
                    user_id: "",
                    machine_id: "",
                    known_nodes: {},
                    private_key: "",
                }),

                // REPLICATED => this holds shared chats data, sync
                this.createDocumentIfNotExists(DATABASE_HANDLES.chats, {
                    _id: DATABASE_HANDLES.chats,
                    chats: {},
                }),
                this.createDocumentIfNotExists(DATABASE_HANDLES.files, {
                    _id: DATABASE_HANDLES.files,
                    files: {},
                }),
                this.createDocumentIfNotExists(DATABASE_HANDLES.notes, {
                    _id: DATABASE_HANDLES.notes,
                    notes: {},
                }),

                // LOCAL ONLY => this holds files used in chats, loaded on demand...
                this.createDocumentIfNotExists(DATABASE_HANDLES.files_attachments, {
                    _id: DATABASE_HANDLES.files_attachments,
                    _attachments: {},
                }),
            ]);
        } catch (error: any) {
            console.error("Error initializing database:", error);
            alert("Critical Error initializing database: " + error.message);
        }
    }

    async returnState(handle: string) {
        try {
            const state = await this.db.get(handle);
            console.log("state", state);
            return state;
        } catch (error) {
            console.log("error", error);
            return {};
        }
    }
    // returns documents which are synced to be send to other nodes
    // remaked into own format to allow conflict resolution;
    async returnSyncDocuments(): Promise<any> {
        try {
            const { chats }: any = await this.returnState(DATABASE_HANDLES.chats);
            const { files }: any = await this.returnState(DATABASE_HANDLES.files);
            const { notes }: any = await this.returnState(DATABASE_HANDLES.notes);
            return {
                chats,
                files,
                notes,
            };
            // const allDocs = await this.db.allDocs({
            //     keys: keys,
            //     include_docs: true, // Include the full document content
            // });
            // console.log("returnSyncDocuments => ", allDocs.rows);
            // // return allDocs.rows;
            // return allDocs.rows.map((row: any) => row.doc);
        } catch (error) {
            console.error("Error retrieving sync documents:", error);
            // throw error; // Rethrow the error to propagate it up the call stack
            return null;
        }
    }
    // processes sync docs from other nodes;
    async processSingleSyncDocument(doc: any) {
        const mergeEntitiesByModificationDate = (oldEntities: any = {}, newEntities: any = {}) => {
            // merge all by default, so any missing entities will be created
            // merging deep in any case to handle any nested strcuts;
            const merged: any = loMerge({}, oldEntities, newEntities);

            const conflictIds = intersection(Object.keys(oldEntities), Object.keys(oldEntities));
            conflictIds.forEach(key => {
                try {
                    const oldEnt = oldEntities[key];
                    const newEnt = newEntities[key];

                    // ensure they both have modified_at
                    const oldModified = oldEnt.modified_at || oldEnt.created_at || 0;
                    const newModified = newEnt.modified_at || newEnt.created_at || 0;

                    if (oldModified < newModified) {
                        merged[key] = loMerge({}, oldEnt, newEnt); // New chat overrides current chat
                    } else {
                        merged[key] = loMerge({}, oldEnt, newEnt); // Current chat overrides new chat
                    }
                } catch (e) {
                    console.error("Error merging entities by modification date", {
                        e,
                        arguments,
                        oldEntities,
                        newEntities,
                        key,
                    });
                }
            });
            return merged;
        };

        try {
            if ("chats" in doc) {
                // initial version
                // await this.updateDocument(DATABASE_HANDLES.chats, doc);

                const mergeMessages = (oldMessages: any = {}, newMessages: any = {}) => {
                    const merged: any = {
                        ...oldMessages,
                        ...newMessages,
                    };
                    const conflictIds = intersection(Object.keys(oldMessages), Object.keys(newMessages));
                    conflictIds.forEach(message_id => {
                        const oldM = oldMessages[message_id];
                        const newM = newMessages[message_id];

                        // ensure they both have modified_at
                        const oldModified = oldM.modified_at || oldM.created_at || 0;
                        const newModified = newM.modified_at || newM.created_at || 0;

                        if (oldModified < newModified) {
                            merged[message_id] = { ...oldM, ...newM }; // New chat overrides current chat
                        } else {
                            merged[message_id] = { ...newM, ...oldM }; // Current chat overrides new chat
                        }
                    });
                    return merged;
                };

                const ChatsDoc: any = await this.db.get(DATABASE_HANDLES.chats);
                const oldChats: any = ChatsDoc.chats;
                const newChats: any = doc.chats;

                // merge first as is to match entires missing from both ends
                const merged: any = {
                    ...oldChats,
                    ...newChats,
                };
                const conflictIds = intersection(Object.keys(oldChats), Object.keys(newChats));
                conflictIds.forEach(chat_id => {
                    const currentChat = oldChats[chat_id];
                    const newChat = newChats[chat_id];

                    if ((currentChat.modified_at || 0) < (newChat.modified_at || 0)) {
                        // New chat overrides current chat
                        merged[chat_id] = {
                            ...currentChat,
                            ...newChat,
                            messages: mergeEntitiesByModificationDate(currentChat.messages, newChat.messages),
                        };
                    } else {
                        // Current chat overrides new chat
                        merged[chat_id] = {
                            ...newChat,
                            ...currentChat,
                            messages: mergeEntitiesByModificationDate(currentChat.messages, newChat.messages),
                        };
                    }
                });

                // for (const currentChat of Object.values(currentChatsDoc.chats) as any) {
                //     // if both entires present on both current and newChats => resolve by last modified
                //     // els just write as is.
                //     if (currentChat.chat_id in newChats) {
                //         const newChatsEntry = newChats[currentChat.chat_id];

                //         if ((currentChat.modified_at || 0) < (newChatsEntry.modified_at || 0)) {
                //             mergedDoc[currentChat.chat_id] = {
                //                 ...currentChat, // old
                //                 ...newChats[currentChat.chat_id], // new overwrites
                //             };
                //         } else {
                //             mergedDoc[currentChat.chat_id] = {
                //                 ...newChats[currentChat.chat_id], // new
                //                 ...currentChat, // current id newer;
                //             };
                //         }
                //     } else {
                //         // add current as usual;
                //         mergedDoc[currentChat.chat_id] = currentChat;
                //     }
                // }
                // console.log("currentChatsDoc/mergedDoc => ", currentChatsDoc, mergedDoc);
                await this.db.put({
                    ...ChatsDoc,
                    chats: this.runNullifyObject(merged, "chat_id"),
                });
            }

            if ("files" in doc) {
                console.log("will update files => ", doc);
                const FilesDoc: any = await this.db.get(DATABASE_HANDLES.files);
                FilesDoc.files = this.runNullifyObject(
                    mergeEntitiesByModificationDate(FilesDoc.files, doc.files),
                    "attachment_id"
                );
                await this.db.put(FilesDoc);
            }
            if ("notes" in doc) {
                console.log("will update files => ", doc);
                const NotesDoc: any = await this.db.get(DATABASE_HANDLES.notes);
                // NotesDoc.notes = {
                //     ...NotesDoc.notes,
                //     ...doc.notes,
                // };
                // NotesDoc.notes = loMerge({}, NotesDoc.notes, doc.notes);
                NotesDoc.notes = this.runNullifyObject(
                    mergeEntitiesByModificationDate(NotesDoc.notes, doc.notes),
                    "note_id"
                );

                await this.db.put(NotesDoc);
            }
            return true;
        } catch (error) {
            console.error("Error processing sync documents:", error);
            // TODO: should display some error
            return null;
            // throw error; // Rethrow the error to propagate it up the call stack
        }
    }
    async updateDocument(docId: string, newData: any) {
        try {
            // Fetch the latest revision of the document
            const doc: any = await this.db.get(docId);

            // Update the document with new data
            const updatedDoc = loMerge({}, doc, newData);

            // Update the document with the latest revision
            const response: any = await this.db.put(updatedDoc);

            console.log("Document updated successfully:", response);
            return response;
        } catch (error) {
            console.error("Error updating document:", error);
            return null;
        }
    }

    runNullifyObject(objectsMap: any, keyName: string) {
        for (let key in objectsMap) {
            if (objectsMap[key].state === 5) {
                objectsMap[key] = {
                    [keyName]: objectsMap[key][keyName],
                    state: 5,
                    modified_at: objectsMap[key].modified_at,
                };
            }
        }
        return objectsMap;
    }

    async updateUserData(userData: any) {
        let authDocument: any = await this.db.get(DATABASE_HANDLES.auth);
        authDocument = {
            ...authDocument,
            ...userData,
        };
        await this.db.put(authDocument);
        console.log("user data updated successfully.");
    }

    async saveStateChats(chats: any) {
        try {
            const chatsDocument: any = await this.db.get(DATABASE_HANDLES.chats);
            chatsDocument.chats = chats;
            await this.db.put(chatsDocument);
            console.log("chat created successfully.");
        } catch (error) {
            console.error("Error creating chat:", error);
        }
    }

    async dropDatabase() {
        return this.db.destroy();
    }

    async extractFilesFromChats(): Promise<any[]> {
        const chatsDocument: any = await this.db.get(DATABASE_HANDLES.chats);
        let chatAttachments: any[] = [];

        if (chatsDocument?.chats) {
            Object.values(chatsDocument.chats).forEach((chat: any) => {
                if (chat?.messages) {
                    Object.values(chat.messages).forEach((message: any) => {
                        if (message?.attachments) {
                            chatAttachments.push(...Object.values(message.attachments));
                        }
                    });
                }
            });
            // chatAttachments = await Promise.all(
            //     chatAttachments.map(async (attachment: any) => {
            //         const exists = await this.fileAdapter.checkFileExists(attachment);
            //         attachment.exists = exists;
            //         return attachment;
            //     })
            // );
            return chatAttachments;
        } else {
            return [];
        }
    }
}

class FileAdapterPouch {
    manager: DatabaseManager;

    constructor(parentDatabaseManager: DatabaseManager) {
        this.manager = parentDatabaseManager;
    }

    async checkFileExists(attachment: Attachment | string) {
        const att_id: string = (attachment as any).attachment_id || attachment;
        try {
            // Fetch only the document metadata without loading the actual document content
            const docMeta = await this.manager.db.get(DATABASE_HANDLES.files_attachments, { attachments: false });

            // Check if the attachment exists in the document metadata
            if (docMeta?._attachments[att_id]) {
                console.log("Attachment exists in the document.");
                return true;
            } else {
                console.log("Attachment does not exist in the document.");
                return false;
            }
        } catch (error: any) {
            if (error.status === 404) {
                console.log("Document not found.");
            } else {
                console.error("Error checking attachment:", error);
            }
            return false;
        }
    }
    // file stored as blobs only then...
    async storeFile(attachment: Attachment, file: File | Blob) {
        console.log("storing file...", arguments);
        try {
            const doc = await this.manager.db.get(DATABASE_HANDLES.files_attachments);
            // Now that we have the latest revision, we can call putAttachment
            await this.manager.db.putAttachment(
                DATABASE_HANDLES.files_attachments,
                attachment.attachment_id,
                doc._rev,
                file,
                attachment.type
            );
            console.log("file added successfully.");
        } catch (error) {
            console.error("Error creating file:", error, arguments);
        }
    }
    async getFile(attachment: Attachment, asFile: boolean = false): Promise<Blob | Buffer | null> {
        try {
            const blob = await this.manager.db.getAttachment(
                DATABASE_HANDLES.files_attachments,
                attachment.attachment_id
            );
            console.log("file added successfully.");
            if (asFile) {
                return new File([blob], attachment.name, {
                    type: attachment.type,
                    lastModified: attachment.lastModified,
                });
            } else {
                return blob;
            }
        } catch (error) {
            console.error("Error creating file:", error);
            return null;
        }
    }
}
