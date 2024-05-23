interface Node {
    machine_id: string;
    active: boolean;
    device_name: string;
}

export interface TopLevelDatabase {
    _id: string;
    chats: Chat[];
}

export interface Auth {
    user_id: string;
    machine_id: string;
    known_nodes: string[];
}

// note, file, chat, chat, message, state
// 1 active, default
// 2 pinned to top
// 3 archid
// 4 removed / trashed
// 5 deleted => removed entirely so its all gone
type State = 1 | 2 | 3 | 4 | 5;
interface DeletedState {
    state: 5;
    modified_at: number;
}

// chats {} key:chat_id, value:Chat
// chats and messages are deleted my flag.
// chats can also be archived to be put to the bottom of it;
export interface Chat {
    chat_id: string;
    state: State;
    chat_name: string;
    messages: {
        [key: string]: Message;
    };
    messages_count: number;
    archived?: boolean;
    removed?: boolean;
    modified_at?: number; // for conflict resolution
}
export interface DeletedChat extends DeletedState {
    chat_id: string;
}
export interface DeletedMessage extends DeletedState {
    message_id: string;
}
export interface DeletedAttachment extends DeletedState {
    attachment_id: string;
}
export interface DeletedNote extends DeletedState {
    note_id: string;
}
export interface Message {
    message_id: string;
    state: State;
    created_at: number; // for order in chats
    modified_at?: number; // for conflict resolution
    text: string;
    attachments?: Attachment[];
    removed?: boolean;
}

// attachments stored at specific folder and found by id? or use name as is...
// attachments deleted by removing the message and removing attach from there
// later by unlink method to walk on current state and delete anything thats not in current messages;
export interface Attachment {
    attachment_id: string;
    // voice/photo/etc for custom formats;
    attachment_type: string;
    created_at: number;
    name: string;
    // in bytes to determine autoload;
    size: number;
    // mime type technical
    type: string;
    lastModified?: number;
}
export interface EntityFile extends Attachment {
    // files being used as in own specific tab...
    file_path: string; // path in folder structure...
    file_name: string; // own name if specified for this file to be used instead of basic file name
    modified_at?: number; // to use as last modified for conflics resolution
    removed?: boolean; // marking deleted files;
}

export interface AttachmentFile extends Attachment {
    file: File;
}
export interface AttachmentBuffer extends Attachment {
    buffer: Uint8Array;
}
export interface AttachmentBufferPart extends Attachment {}

export interface FileLocal {
    attachment_id: string;
    loaded: boolean; // if file fully loaded locally...
    file: File | Blob | ArrayBuffer; // file as entire, or arraybuffer if its loading now;
    size: number;
}
// stores local state of files, which are loaded which are still loading...
export interface FileQueue {}

// data sent plaintext between nodes
export interface DataMessage {
    format: string;
    // uuid4
    id: string;
    // when message formed
    created_at: number;
    from_machine_id: string;
    // encrypted with private key mgspack
    event: string;
    document?: any;
}

export interface DataMessageEncrypted {
    format: string;
    iv: Uint8Array;
    data: Uint8Array;
}
export interface DataMessageInternal {
    // event or command, type of data
    event: string;
    // document from database or smth...
    document?: any;
}

// TODO: rethink it all...
// better to have database => sync it between devices
// like when one comes online we sync it between them and thats it.
// using simple replicate to file back and forth...

// idea => use gundb for peer discovery and connections
// store medatadata about chats and the like in fully encrypted way
// it can user indexed db so probably for files correct... but I also want to store files in my own way so...

export interface NoteDocument {
    notes: NoteList;
}
export interface NoteList {
    [key: string]: Note;
}
export interface Note {
    note_id: string;
    state: State;
    removed?: boolean;
    created_at: number;
    modified_at?: number;
    // note (text plain), checklist, outline
    note_type: string;
    color: string | null;

    note_title: string;
    // for note type text
    content: {
        text_content?: string;
        checklist_content?: string[];
        outline_content?: string[];
    };
}

export interface SharedEventLog {
    [key: string]: DataMessage;
}
export interface DataMessageSharedEvent extends DataMessage {
    processed?: boolean;
    request_id?: string;
    for_request_id?: string;
}

// event => create wrapper => apeend to db;
// on === db change => for each not processed => process;
// keep local version of saved events
// request === wait for specific event... or how better
