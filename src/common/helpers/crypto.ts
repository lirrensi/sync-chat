// generate uuid
import { v4 as uuidv4 } from "uuid";
import { snapshot } from "valtio";
import * as msgpack from "@msgpack/msgpack";
import * as pako from "pako";

export function generateUUID() {
    return uuidv4();
}

// Convert a hexadecimal string to an ArrayBuffer
function hexStringToArrayBuffer(hexString: string) {
    const buffer = new ArrayBuffer(hexString.length / 2);
    const view = new Uint8Array(buffer);
    for (let i = 0; i < hexString.length; i += 2) {
        view[i / 2] = parseInt(hexString.substr(i, 2), 16);
    }
    return buffer;
}
function arrayBufferToBase64(buffer: ArrayBuffer) {
    let binary = "";
    const bytes = new Uint8Array(buffer);
    const len = bytes.byteLength;
    for (var i = 0; i < len; i++) {
        binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary);
}

// Function to encrypt a key
function encryptKeySimple(rawKey: ArrayBuffer, password: string) {
    // Convert the raw key and password to Uint8Arrays
    const keyArray = new Uint8Array(rawKey);
    const passwordArray = new TextEncoder().encode(password);

    // Derive a key from the password
    return window.crypto.subtle
        .importKey("raw", passwordArray, { name: "PBKDF2" }, false, ["deriveBits"])
        .then(passwordDerivedKey => {
            // Use the derived key to encrypt the raw key
            return window.crypto.subtle.deriveBits(
                {
                    name: "PBKDF2",
                    salt: passwordArray,
                    iterations: 100000,
                    hash: "SHA-256",
                },
                passwordDerivedKey,
                256
            );
        })
        .then(derivedBits => {
            return window.crypto.subtle.importKey("raw", derivedBits, { name: "AES-CBC" }, false, ["encrypt"]);
        })
        .then(aesKey => {
            // Encrypt the raw key using AES-CBC
            return window.crypto.subtle.encrypt(
                {
                    name: "AES-CBC",
                    iv: window.crypto.getRandomValues(new Uint8Array(16)),
                },
                aesKey,
                keyArray
            );
        })
        .then(encryptedKey => {
            // Convert the encrypted key to a base64 string and return
            return arrayBufferToBase64(encryptedKey);
        })
        .catch(error => {
            console.error("Encryption error:", error);
        });
}
// Function to decrypt a key
function decryptKeySimple(encryptedKeyString: string, password: string) {
    // Convert the encrypted key string to a Uint8Array
    const encryptedKey = new Uint8Array(
        atob(encryptedKeyString)
            .split("")
            .map(char => char.charCodeAt(0))
    );

    // Convert the password to a Uint8Array
    const passwordArray = new TextEncoder().encode(password);

    // Derive a key from the password
    return window.crypto.subtle
        .importKey("raw", passwordArray, { name: "PBKDF2" }, false, ["deriveBits"])
        .then(passwordDerivedKey => {
            // Use the derived key to decrypt the encrypted key
            return window.crypto.subtle.deriveBits(
                {
                    name: "PBKDF2",
                    salt: passwordArray,
                    iterations: 100000,
                    hash: "SHA-256",
                },
                passwordDerivedKey,
                256
            );
        })
        .then(derivedBits => {
            return window.crypto.subtle.importKey("raw", derivedBits, { name: "AES-CBC" }, false, ["decrypt"]);
        })
        .then(aesKey => {
            // Decrypt the encrypted key using AES-CBC
            return window.crypto.subtle.decrypt(
                {
                    name: "AES-CBC",
                    iv: encryptedKey.slice(0, 16),
                },
                aesKey,
                encryptedKey.slice(16)
            );
        })
        .catch(error => {
            console.error("Decryption error:", error);
        });
}

async function encryptTextSimple(text: string, password: string) {
    // Convert text to ArrayBuffer
    const textBuffer = new TextEncoder().encode(text);

    // Derive key from password using PBKDF2
    const salt = window.crypto.getRandomValues(new Uint8Array(16));
    const keyMaterial = await window.crypto.subtle.importKey(
        "raw",
        new TextEncoder().encode(password),
        { name: "PBKDF2" },
        false,
        ["deriveKey"]
    );
    const key = await window.crypto.subtle.deriveKey(
        {
            name: "PBKDF2",
            salt: salt,
            iterations: 100000,
            hash: "SHA-256",
        },
        keyMaterial,
        { name: "AES-GCM", length: 256 },
        true,
        ["encrypt"]
    );

    // Encrypt text using AES-GCM
    const iv = window.crypto.getRandomValues(new Uint8Array(12));
    const encryptedData = await window.crypto.subtle.encrypt({ name: "AES-GCM", iv: iv }, key, textBuffer);

    // Concatenate salt and IV with encrypted data
    const encryptedDataWithHeader = new Uint8Array([...salt, ...iv, ...new Uint8Array(encryptedData)]);

    // Convert encrypted data to base64
    return btoa(String.fromCharCode(...encryptedDataWithHeader));
}

async function decryptTextSimple(encryptedText: string, password: string) {
    // Decode base64 string to Uint8Array
    const encryptedDataWithHeader = new Uint8Array(
        atob(encryptedText)
            .split("")
            .map(char => char.charCodeAt(0))
    );

    // Extract salt, IV, and encrypted data
    const salt = encryptedDataWithHeader.slice(0, 16);
    const iv = encryptedDataWithHeader.slice(16, 28);
    const encryptedData = encryptedDataWithHeader.slice(28);

    // Derive key from password using PBKDF2
    const keyMaterial = await window.crypto.subtle.importKey(
        "raw",
        new TextEncoder().encode(password),
        { name: "PBKDF2" },
        false,
        ["deriveKey"]
    );
    const key = await window.crypto.subtle.deriveKey(
        {
            name: "PBKDF2",
            salt: salt,
            iterations: 100000,
            hash: "SHA-256",
        },
        keyMaterial,
        { name: "AES-GCM", length: 256 },
        true,
        ["decrypt"]
    );

    // Decrypt data using AES-GCM
    const decryptedData = await window.crypto.subtle.decrypt({ name: "AES-GCM", iv: iv }, key, encryptedData);

    // Convert ArrayBuffer to string
    return new TextDecoder().decode(decryptedData);
}

export class KeyManager {
    private key: CryptoKey | null;
    constructor() {
        this.key = null;
    }

    async generateKey() {
        try {
            const key = await window.crypto.subtle.generateKey(
                {
                    name: "AES-GCM",
                    length: 256, // key length in bits
                },
                true, // whether the key is extractable (i.e., can be exported)
                ["encrypt", "decrypt"] // the key can be used for both encryption and decryption
            );
            this.key = key;
        } catch (e: any) {
            console.error("Error generating AES key: " + e.message);
        }
    }
    async exportKeyString(password: string) {
        // special hack required to avoid error of 'type of not CryptoKey'
        // const key: any = (this.key as any).$raw;
        const key: any = this.key as any;
        console.log("key is =>", key);
        if (!key) {
            console.error("Key not yet generated");
            return "";
        } else {
            console.log("key present => ", [key]);
        }
        // Export the key as a raw ArrayBuffer
        const rawKeyJWK = await window.crypto.subtle.exportKey("jwk", key);
        const keyStringPlainText = JSON.stringify(rawKeyJWK);

        return encryptTextSimple(keyStringPlainText, password);
    }
    // Create a CryptoKey object from an AES key string
    async importKeyString(text: string, password: string) {
        try {
            // const rawKey = hexStringToArrayBuffer(keyString);
            const rawKeyJSON = await decryptTextSimple(text, password);
            const jwk = JSON.parse(rawKeyJSON);
            if (!jwk) {
                console.error("Invalid key string");
                return;
            }
            const importedKey = await window.crypto.subtle.importKey(
                "jwk", // format of the key
                jwk,
                { name: "AES-GCM" },
                true, // whether the key is extractable (i.e., can be exported)
                ["encrypt", "decrypt"] // the key can be used for both encryption and decryption
            );
            this.key = importedKey;
            return true;
        } catch (error) {
            console.error("Error importing AES key: " + error, arguments);
            return false;
        }
    }
    async encryptData(data: any = {}) {
        const packedData = pako.deflate(msgpack.encode(data));

        // Generate a random IV (Initialization Vector)
        const iv = crypto.getRandomValues(new Uint8Array(12));

        try {
            // Encrypt the data
            const encryptedData = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, this.key, packedData);
            return {
                format: "v1_aes-256-gcm",
                iv: iv,
                data: new Uint8Array(encryptedData),
            };
        } catch (error) {
            console.error("Encryption error:", error);
            return null;
        }
    }
    async decryptData({ data, iv }: any) {
        try {
            // Decrypt the data
            const decryptedData = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, this.key, data);
            // Unpack the decrypted data using MessagePack
            const unpackedData = msgpack.decode(pako.inflate(decryptedData));
            return unpackedData;
        } catch (error) {
            console.error("Decryption error:", error);
            return null;
        }
    }
}
