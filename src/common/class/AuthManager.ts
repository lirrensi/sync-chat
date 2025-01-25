import { generateUUID, KeyManager } from "../helpers/crypto";

import store from "../store";
import { DATABASE_HANDLES } from "./DatabaseManager";
// first we create 'account'
// user_id:uuid
// machine_id:uuid
// private key for files
// password to encrypt private key

// unique handle for account => user_id
// connections handle => user_id + machine_id
// user supplies user_id... but how we discover other machines to connect...
// create user + machine => connect => sharing with file or code the user id and new machine id, and both sync 'known nodes'

// auth manager stores own data in secret store;

// nodes => table with nodes
// it has update_date => so all other nodes upon sync will get the actual version
// removed node marked inactive, so other nodes do not send or accept data to that
// if removed node comes offline, sees that it remove - if will not push data and delete own device data and all that

// user data store in database now, not local storage... nothing significant there except the key,
// but the pass stored separately...
// user data and a private key stored in encrypted format only in storage;
// decrypted on app start
// password => if stored locally, else prompt to decrypt the key

interface NodeList {
    last_update: number;
    nodes: {
        [key: string]: Node;
    };
}


// damn hack to have a key outside proxy state as it breaks something;
let keyManager: KeyManager;


