import * as uuid from "uuid";

// import peerjs from "peerjs";
import { DataConnection } from "peerjs";
// const peerFileTransfer = new PeerFileTransfer();

// // Establish a connection to another peer
// const peer = new Peer();

// peer.on("open", () => {
//     // Connect to the peer
//     const conn = peer.connect("receiverPeerID");

//     // Send a file to the connected peer
//     peerFileTransfer.sendFile(conn, fileInput.files[0], {
//         chunkSize: 1024 * 1024, // 1MB chunk size (adjust as needed)
//         metadata: {
//             filename: fileInput.files[0].name,
//             mimeType: fileInput.files[0].type,
//             // Any additional metadata you want to send
//         },
//     });
// });

// // Receive a file from another peer
// peer.on("connection", conn => {
//     peerFileTransfer.receiveFile(conn, {
//         onComplete: file => {
//             console.log("Received file:", file);
//             // Do something with the received file
//         },
//         onError: error => {
//             console.error("Error receiving file:", error);
//         },
//     });
//     conn.send();
// });
// class SendFile {
//     constructor(connection, data, options) {
//         this.id = uuid.v4();
//         this.connection = connection;

//         if (data instanceof ArrayBuffer) {
//             this.data = splitArrayBuffer(data);
//         } else {
//             console.warn("error => arg not an ArrayBuffer");
//             throw new Error("arg not an ArrayBuffer");
//         }
//     }
// }
async function wait(ms: number) {
    return new Promise(resolve => setTimeout(resolve, ms));
}
const CHUNK_SIZE: number = 1024 * 1024;
interface PeerRequestOptions {
    method: string;
    data: any;
    timeout?: number;
    progressCallback?: Function;
}
export class PeerRequest {
    connection: DataConnection;
    prefix: string = "rq";
    id: string;
    method: string;
    data: any;
    timeout: number = 60000;
    resolve: any;
    rqTimeout: NodeJS.Timeout;

    constructor(connection: DataConnection, { method, data, timeout }: PeerRequestOptions) {
        this.connection = connection;

        this.id = uuid.v4();

        this.method = method;
        this.data = data;
        this.timeout = timeout;

        // Bind receiver method to the instance to maintain correct 'this' context
        this.receiver = this.receiver.bind(this);
    }

    receiver(incData: any) {
        if (incData?.prefix === this.prefix && incData?.id === this.id) {
            this.resolve({
                success: true,
                errorType: null,
                data: incData.data,
            });
            this.destroy();
        }
    }

    async start() {
        const request = {
            prefix: this.prefix,
            id: this.id,
            method: this.method,
            data: this.data,
        };

        return new Promise(resolve => {
            this.resolve = resolve;
            try {
                this.rqTimeout = setTimeout(() => {
                    console.log(`request ${this.method} ${this.id} timeout`);
                    resolve({
                        success: false,
                        errorType: "timeout",
                        data: null,
                    });
                    this.destroy();
                }, this.timeout);

                this.connection.on("data", this.receiver);
                this.connection.send(request);
            } catch (error) {
                resolve({
                    success: false,
                    errorType: "catch",
                    error,
                    data: null,
                });
                this.destroy();
            }
        });
    }
    destroy() {
        clearTimeout(this.rqTimeout);
        this.connection.off("data", this.receiver);
        // this = null;
    }
}

export class PeerListen {
    connection: DataConnection;
    prefix: string = "rq";
    method: string;
    callback: Function | Promise<any>;

    constructor(connection: DataConnection, method: string, callback: Function | Promise<any>) {
        this.connection = connection;

        this.prefix = "rq";

        this.method = method;
        this.callback = callback;

        connection.on("data", this.handler.bind(this));
    }
    async execCallback(callback: Function | Promise<any>, data: any) {
        // Check if the callback returns a promise
        if (typeof callback === "function") {
            const result = callback(data);
            // If the result is a promise, await it
            if (result instanceof Promise) {
                return await result;
            }
            // Otherwise, return the result directly
            return result;
        } else {
            console.error("Callback must be a function");
            return null;
        }
    }

    async handler(incData: any) {
        console.warn("handler DEBUG => ", incData, this);
        if (incData?.prefix === this.prefix && incData?.method === this.method && incData?.id) {
            console.log(`got request ${incData.method} ${incData.id} ...`);
            const callbackResult = await this.execCallback(this.callback, incData.data);
            console.log(`got request ${incData.method} ${incData.id} callback run => `, callbackResult);
            const response = {
                prefix: this.prefix,
                id: incData.id,
                data: callbackResult,
            };
            this.connection.send(response);
        }
    }
    destroy() {
        this.connection.off("data", this.handler);
        // this = null;
    }
}

export class PeerRequestFile extends PeerRequest {
    prefix: string = "rq-file";
    progressCallback: Function;
    buffer: {
        [key: number]: ArrayBuffer;
    };

    constructor(connection: DataConnection, { method, data, timeout, progressCallback }: PeerRequestOptions) {
        super(connection, { method, data, timeout });
        this.connection = connection;

        this.id = uuid.v4();

        this.method = method;
        this.data = data;
        this.timeout = timeout;
        this.progressCallback = progressCallback;

        this.buffer = {};
        // wait, pending, complete, fail;
        // this.status = "wait";
    }
    async handler(incData: any) {
        if (incData?.prefix === "rq-file" && incData?.id === this.id) {
            // clear timeout as soon as we get first file...
            // TODO: instead reset timeout after each chunk, so timeout is after last chunk...
            clearTimeout(this.rqTimeout);

            const bufferChunk = incData.data;
            if (bufferChunk) {
                this.buffer = {
                    ...this.buffer,
                    ...bufferChunk,
                };
            }
            const percentDone = this.calculatePercentage(this.buffer);
            if (this.progressCallback) {
                this.progressCallback(percentDone);
            }
            if (percentDone === 1) {
                // TODO...
                // concat buffer
                // this.resolve...
            }
        }
    }

    calculatePercentage(buffer: any) {
        let nonNullCount = 0;
        let totalCount = 0;

        for (const key in buffer as any) {
            const bufferIndex: any = Number(key);
            if (buffer.hasOwnProperty(key)) {
                totalCount++;
                if (buffer[bufferIndex]) {
                    nonNullCount++;
                }
            }
        }

        // Calculate the percentage
        const percentage = nonNullCount / totalCount;

        return percentage;
    }
}

export class PeerListenFile extends PeerListen {
    constructor(connection: DataConnection, method: string, callback: Function | Promise<any>) {
        super(connection, method, callback);

        this.prefix = "rq-file";
    }
    async handler(incData: any) {
        if (incData?.prefix === this.prefix && incData?.method === this.method && incData?.id) {
            const response: any = {
                prefix: this.prefix,
                id: incData.id,
                data: null,
            };
            const callbackResult = await this.execCallback(this.callback, incData.data);
            if (!callbackResult || !(callbackResult instanceof ArrayBuffer)) {
                this.connection.send(response);
                return;
            }
            // split for map of chunks...
            const buffer = this.splitArrayBuffer(callbackResult);
            // send first method to send the map of chunks so clients knows how much to get...
            const emptyBuffer: {
                [key: number]: null;
            } = {};
            for (const index in buffer) {
                emptyBuffer[index] = null;
            }
            response.data = emptyBuffer;
            this.connection.send(response);

            // wait...
            // start sending as is;
            for (const index in buffer) {
                await wait(100);
                const chunk = { [index]: buffer[index] };
                response.data = chunk;
                this.connection.send(response);
            }
        }
    }

    splitArrayBuffer(arrayBuffer: ArrayBuffer | Uint8Array, chunkSize = CHUNK_SIZE) {
        const bytes = new Uint8Array(arrayBuffer);
        const chunks: { [key: number]: ArrayBuffer } = {};

        for (let i = 0; i < bytes.length; i += chunkSize) {
            const chunkIndex = Math.floor(i / chunkSize);
            chunks[chunkIndex] = arrayBuffer.slice(i, i + chunkSize);
        }

        return chunks;
    }
}
