import { isPlatform } from "@ionic/react";
import { generateUUID } from "../helpers/crypto";
import { Attachment } from "../types";
import { store } from "../store";
// import {Da}

export function makeDownloadFile(data: string, name: string) {
    // Create a blob with the JSON string
    const blob = new Blob([data], { type: "application/json" });

    // Create a link element
    const a = document.createElement("a");
    a.style.display = "none";

    // Create a URL for the blob and set it as the href of the link
    const url = window.URL.createObjectURL(blob);
    a.href = url;

    // Set the filename for the download
    a.download = name;

    // Append the link to the body and click it programmatically
    document.body.appendChild(a);
    a.click();

    // Clean up
    window.URL.revokeObjectURL(url);
    document.body.removeChild(a);
}

export async function parseJSONFile(file: File): Promise<{ [key: string]: any } | null> {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();

        reader.onload = function (event) {
            try {
                // Check if the file type is JSON
                if (file.type === "application/json") {
                    // Parse the JSON content
                    const result = event.target?.result;
                    if (result && typeof result === "string") {
                        const jsonData = JSON.parse(result);
                        resolve(jsonData);
                    } else {
                        resolve(null);
                    }
                } else {
                    reject(new Error('File is not of type "application/json"'));
                }
            } catch (error) {
                resolve(null);
                // reject(new Error("Error parsing JSON: " + error.message));
            }
        };

        // Read the file as text
        reader.readAsText(file);
    });
}

// attachment_id: string;
//     // voice/photo/etc for custom formats;
//     attachment_type: string;
//     created_at: number;
//     file_name: string;
//     // in bytes to determine autoload;
//     file_size: number;
//     // mime type technical
//     file_type: string;

export async function promptFileBasic() {
    return new Promise((resolve, reject) => {
        // Create a file input element
        const input = document.createElement("input");
        input.type = "file";
        input.multiple = true;

        // Listen for changes in the file input
        input.addEventListener("change", (event: any) => {
            // Retrieve the selected files
            const files: FileList = event.target.files;
            const argObjects = [];
            for (const file of files) {
                argObjects.push({
                    file,
                    attachment: {
                        attachment_id: generateUUID(),
                        attachment_type: "file",
                        created_at: Date.now(),
                        name: file.name,
                        size: file.size,
                        type: file.type,
                        lastModified: file.lastModified,
                    },
                });
            }

            resolve(argObjects);
        });

        // Trigger a click event on the file input
        input.click();
    });
}
export async function promptFilesAndReturnJustFiles(): Promise<File[]> {
    return new Promise((resolve, reject) => {
        // Create a file input element
        const input = document.createElement("input");
        input.type = "file";
        input.multiple = true;

        // Listen for changes in the file input
        input.addEventListener("change", (event: any) => {
            // Retrieve the selected files
            const files: FileList = event.target.files;
            const returnFiles: File[] = [];
            for (const file of files) {
                returnFiles.push(file);
            }

            resolve(returnFiles);
        });

        // Trigger a click event on the file input
        input.click();
    });
}
export function downloadFile(attachment: Attachment, blob: Blob) {
    // Create a blob with the JSON string
    // const blobToDownload = new Blob([blob], { type: "application/json" });

    // Create a link element
    const a = document.createElement("a");
    a.style.display = "none";

    // Create a URL for the blob and set it as the href of the link
    const url = window.URL.createObjectURL(blob);
    a.href = url;

    // Set the filename for the download
    a.download = attachment.name;

    // Append the link to the body and click it programmatically
    document.body.appendChild(a);
    a.click();

    // Clean up
    window.URL.revokeObjectURL(url);
    document.body.removeChild(a);
}

export async function existingFileDownload(attachment: Attachment, prompt = false) {
    const blob = await store.entityFiles.getFileLocal(attachment);
    if (blob) {
        downloadFile(attachment, blob);
    } else {
        // express the toast;
    }
}

// to extract files based on system
// in browser => use browser db;
// in mobile/electrol => use file system
export class FileStorage {
    private backend: string;
    private databaseManager: any;

    constructor(databaseManager?: any) {
        if (isPlatform("capacitor")) {
            this.backend = "mobile";
        } else if (isPlatform("electron")) {
            this.backend = "desktop";
        } else {
            this.backend = "browser";
            this.databaseManager = databaseManager;
        }
    }

    async getFileBrowser(attachment: Attachment) {
        const blob: Blob = await this.databaseManager.dbGetFile(attachment);
        if (!blob) {
            return null;
        }
        const file = new File([blob], attachment.name, {
            type: attachment.type,
            lastModified: attachment.lastModified,
        });
        return file;
    }
    async storeFileBrowser(attachment: Attachment, file: File) {
        return this.databaseManager.dbStoreFile(attachment, file);
    }
    async checkAttachmentLoaded(attachment: Attachment) {
        return this.databaseManager.dbCheckFile(attachment);
    }
}
