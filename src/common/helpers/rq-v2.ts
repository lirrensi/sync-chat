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
type MiddlewareFunction = (data: any) => Promise<any>;
interface PeerRequestOptionsMiddleware {
    middlewareReceive?: MiddlewareFunction;
    middlewareSend?: MiddlewareFunction;
}

interface BufferMap {
    [key: number]: Uint8Array | null;
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
    middlewareReceive?: MiddlewareFunction;
    middlewareSend?: MiddlewareFunction;

    constructor(
        connection: DataConnection,
        { method, data, timeout }: PeerRequestOptions,
        { middlewareReceive, middlewareSend }: PeerRequestOptionsMiddleware
    ) {
        this.connection = connection;

        this.id = uuid.v4();

        this.method = method;
        this.data = data;
        this.timeout = timeout;

        // Bind receiver method to the instance to maintain correct 'this' context
        this.receiver = this.receiver.bind(this);

        this.middlewareReceive = middlewareReceive;
        this.middlewareSend = middlewareSend;
    }

    async receiver(incRaw: any) {
        const incData = await this.middlewareReceive(incRaw);
        if (incData?.prefix === this.prefix && incData?.id === this.id) {
            this.resolve({
                success: true,
                errorType: null,
                data: incData.data,
            });
            this.destroy();
        }
    }

    setTimeout() {
        clearTimeout(this.rqTimeout);
        this.rqTimeout = setTimeout(() => {
            console.log(`request ${this.method} ${this.id} timeout`);
            this.resolve({
                success: false,
                errorType: "timeout",
                data: null,
            });
            this.destroy();
        }, this.timeout);
    }

    async start() {
        const request = {
            prefix: this.prefix,
            id: this.id,
            method: this.method,
            data: this.data,
        };
        const encryptedRequest = await this.middlewareSend(request);

        return new Promise(resolve => {
            this.resolve = resolve;
            try {
                this.setTimeout();

                this.connection.on("data", this.receiver);
                this.connection.send(encryptedRequest);
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
    middlewareSend?: MiddlewareFunction;

    constructor(conn: DataConnection, method: string, middlewareSend?: MiddlewareFunction) {
        this.connection = conn;
        this.method = method;
        this.middlewareSend = middlewareSend;
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

    async handler(incData: any, callback: Function | Promise<any>) {
        if (incData?.prefix === this.prefix && incData?.method === this.method && incData?.id) {
            console.log(`got request ${incData.method} ${incData.id} ...`);
            const callbackResult = await this.execCallback(callback, incData.data);
            console.log(`got request ${incData.method} ${incData.id} callback run => `, callbackResult);
            const response = {
                prefix: this.prefix,
                id: incData.id,
                data: callbackResult,
            };
            const encryptedResponse = await this.middlewareSend(response);
            this.connection.send(encryptedResponse);
        }
    }
}

// usage =>
// const methodHandler = new PeerListen(conn, 'method');
// conn.on('data', data => {
//     decryptData
//     methodHandler.handler(decryptData, received => {
//         return xxx
//     });
// })

export class PeerRequestFile extends PeerRequest {
    prefix: string = "rq-file";
    progressCallback: Function;
    buffer: BufferMap;

    constructor(
        connection: DataConnection,
        { method, data, timeout, progressCallback }: PeerRequestOptions,
        { middlewareReceive, middlewareSend }: PeerRequestOptionsMiddleware
    ) {
        super(connection, { method, data, timeout }, { middlewareReceive, middlewareSend });
        this.progressCallback = progressCallback;

        this.buffer = {};
    }
    async receiver(incRaw: any) {
        const incData = await this.middlewareReceive(incRaw);
        if (incData?.prefix === "rq-file" && incData?.id === this.id) {
            // clear timeout as soon as we get first file...
            // ? TODO: instead reset timeout after each chunk, so timeout is after last chunk...
            this.setTimeout();

            const incomingData = incData.data;
            if (incomingData.cancel) {
                // TODO: implement cancel...
            }
            if (incomingData.buffer) {
                this.buffer = {
                    ...this.buffer,
                    ...incomingData.buffer,
                };
            }
            const percentDone = this.calculatePercentage(this.buffer);
            if (this.progressCallback) {
                this.progressCallback(percentDone);
            }

            console.warn("file progress => ", incomingData, percentDone);
            if (percentDone === 1) {
                const fullBuffer = this.concatBufferMap(this.buffer);
                this.resolve({
                    success: true,
                    errorType: null,
                    data: fullBuffer,
                });
            }
        }
    }

    calculatePercentage(buffer: BufferMap) {
        let nonNullCount = 0;
        let totalCount = 0;

        for (const key in buffer) {
            const bufferIndex = Number(key);
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
    concatBufferMap(bufferMap: BufferMap): Uint8Array | null {
        // Check if bufferMap is empty
        if (Object.keys(bufferMap).length === 0) {
            return null;
        }

        // Calculate the total length of the concatenated buffer
        let totalLength = 0;
        for (const key in bufferMap) {
            if (bufferMap[key] !== null) {
                totalLength += bufferMap[key]!.length;
            }
        }

        // Create a new Uint8Array to hold the concatenated buffer
        const concatenatedBuffer = new Uint8Array(totalLength);

        // Concatenate the buffers
        let offset = 0;
        for (const key in bufferMap) {
            if (bufferMap[key] !== null) {
                concatenatedBuffer.set(bufferMap[key]!, offset);
                offset += bufferMap[key]!.length;
            }
        }

        return concatenatedBuffer;
    }
}

export class PeerListenFile extends PeerListen {
    constructor(conn: DataConnection, method: string, middlewareSend?: MiddlewareFunction) {
        super(conn, method, middlewareSend);
        this.prefix = "rq-file";
    }
    async handler(incData: any, callback: Function | Promise<any>) {
        if (incData?.prefix === this.prefix && incData?.method === this.method && incData?.id) {
            const response: any = {
                prefix: this.prefix,
                id: incData.id,
                data: null,
                error: false,
                errorMessage: null,
            };
            const callbackResult = await this.execCallback(callback, incData.data);
            if (!callbackResult || !(callbackResult instanceof Uint8Array)) {
                console.error("callback must return Uint8Array");
                response.error = true;
                response.errorMessage = "callback must return Uint8Array";

                this.sendWithMiddleware(response);
                return;
            }
            // split for map of chunks...
            const buffer: BufferMap = this.splitUint8Array(callbackResult);
            // send first method to send the map of chunks so clients knows how much to get...
            const emptyBuffer: BufferMap = {};

            for (const index in buffer) {
                emptyBuffer[index] = null;
            }
            response.data = {
                buffer: emptyBuffer,
            };
            this.sendWithMiddleware(response);

            // wait...
            // start sending as is;
            for (const index in buffer) {
                await wait(100);
                const chunk = { [index]: buffer[index] };
                response.data = {
                    buffer: chunk,
                };
                this.sendWithMiddleware(response);
            }
        }
    }
    async sendWithMiddleware(data: any) {
        this.connection.send(await this.middlewareSend(data));
    }

    splitUint8Array(uint8Array: Uint8Array, chunkSize: number = CHUNK_SIZE): BufferMap {
        const chunks: { [key: number]: Uint8Array } = {};

        for (let i = 0; i < uint8Array.length; i += chunkSize) {
            const chunkIndex = Math.floor(i / chunkSize);
            chunks[chunkIndex] = uint8Array.slice(i, i + chunkSize);
        }

        return chunks;
    }
}
