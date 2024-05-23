import { Peer, DataConnection } from "peerjs";
import { APP_MACHINE_PREFIX } from "../constants";
import { generateUUID } from "../helpers/crypto";

import { store, gunManager, dbMgr } from "../store";

import { DataMessageEncrypted } from "../types";

import { PeerRequest, PeerListen, PeerListenFile, PeerRequestFile } from "../helpers/rq-v2";

// singleton class manager for peer connections;
export class PeerManager {
    started = false;
    connection: Peer | null;
    connMap: {
        [key: string]: DataConnection;
    } = {};

    connectionCheckInterval: any;

    constructor() {
        this.connection = null;
    }
    async init() {
        const idString = this.idStringOwn;
        this.connection = new Peer(idString);

        this.connection.on("open", () => {
            this.started = true;

            console.log("peer => connection open or reconnected", this.connection);

            // remove previos connection check
            clearInterval(this.connectionCheckInterval);
            this.connectionCheckInterval = setInterval(() => {
                this.intervalConnectionCheckAndReport();
            }, 10 * 1000);

            // soon after sell others we online
            setTimeout(() => {
                this.signalOnlineStatus();
            }, 250);

            // start sync process with other nodes
            setTimeout(() => {
                store.sync.onConnectSync();
            }, 1000);
        });

        this.connection.on("close", () => {
            console.warn("peer => connection close");
            this.connectionErrorOrLostHandler();
        });

        this.connection.on("disconnected", () => {
            console.warn("peer => connection disconnected");
            this.connectionErrorOrLostHandler();
        });

        this.connection.on("error", (error: any) => {
            console.error("peer => connection error", error);
            // this.connectionErrorOrLostHandler();
        });

        // on incoming connection
        this.connection.on("connection", (conn: DataConnection) => {
            const remote_machine_id = conn.metadata.machine_id;
            this.connMap[remote_machine_id] = conn;
            this.connAttachListeners(conn, remote_machine_id);
        });

        // when tab close send that we went offline;
        window.addEventListener("beforeunload", event => {
            this.signalOnlineStatus(false);
        });
    }
    intervalConnectionCheckAndReport() {
        this.checkConnections_v2();
        // signal that we online and active;
        this.signalOnlineStatus();
    }
    get idStringOwn() {
        // return APP_MACHINE_PREFIX + store.auth.user_id + "_" + store.auth.machine_id;
        return APP_MACHINE_PREFIX + store.auth.machine_id;
    }
    idStringRemote(machine_id: string) {
        // return APP_MACHINE_PREFIX + store.auth.user_id + "_" + machine_id;
        return APP_MACHINE_PREFIX + machine_id;
    }
    getConnectedPeeers() {
        return Object.values(this.connMap).filter(conn => conn.open);
    }
    signalOnlineStatus(online = true) {
        gunManager.signal(store.auth.machine_id, {
            online,
            last_active: Date.now(),
        });
    }

    connectionErrorOrLostHandler() {
        this.signalOnlineStatus(false);
        setTimeout(() => {
            console.warn("peer => reconnecting...", this.connection.open);
            if (this.connection.destroyed) {
                this.init();
            } else {
                this.connection.reconnect();
            }
        }, 2000);
    }

    // TODO => move all encryption here, so all messages in the sockets are enc by default?
    // TODO => currently have message wrappers and the like, but I want to just encrypt all and send directly as arraybuffers all the damn data?
    async encryptionHandler(plainText: any) {
        return store.encryptData(plainText);
    }
    connAttachListeners(conn: DataConnection, remote_machine_id: string) {
        // usage =>
        // const methodHandler = new PeerListen(conn, 'method');
        // conn.on('data', data => {
        //     decryptData
        //     methodHandler.handler(decryptData, received => {
        //         return xxx
        //     });
        // });
        const rqAllSync = new PeerListen(conn, "rq/all/sync", this.encryptionHandler);
        const rqFileCheck = new PeerListen(conn, "rq/file/check", this.encryptionHandler);
        const rqFileFull = new PeerListen(conn, "rq/file/full", this.encryptionHandler);
        const rqFileStream = new PeerListenFile(conn, "rq/file/stream", this.encryptionHandler);

        conn.on("data", async (data: any) => {
            // console.log("received data from => ", conn.label, data);
            const decryptedDoc = await store.decryptData(data);
            if (decryptedDoc) {
                // handler for online events
                store.handleMessage(decryptedDoc);
                // handlers for request response type events;
                rqAllSync.handler(decryptedDoc, async (data: any) => {
                    return await store.sync.onConnectSyncRequestHandler(data);
                });
                rqFileCheck.handler(decryptedDoc, async (data: any) => {
                    return await store.entityFiles.request_checkFileExists(data);
                });
                rqFileFull.handler(decryptedDoc, async (data: any) => {
                    return await store.entityFiles.request_getRemoteFile(data);
                });
                rqFileStream.handler(decryptedDoc, async (data: any) => {
                    return await store.entityFiles.request_getRemoteFile(data);
                });
            } else {
                console.warn("peer => could not decrypt message", data, this.connection);
            }
        });
        conn.on("error", (error: any) => {
            console.error("peer => remote connection error", error, this.connection);
        });
        // "all/sync"
        // new PeerListen(conn, "rq/all/sync", async (encryptedDoc: any) => {
        //     return await store.sync.onConnectSyncRequestHandler(encryptedDoc);
        // });
        // new PeerListen(conn, "rq/file/check", async (encryptedDoc: any) => {
        //     return await store.entityFiles.request_checkFileExists(encryptedDoc);
        // });
    }
    async createNewConnection(machine_id: string, timeout: number = 5000) {
        return new Promise<void>(resolve => {
            const idString = this.idStringRemote(machine_id);
            const conn = this.connection.connect(idString, {
                label: store.auth.machine_id,
                metadata: {
                    machine_id: store.auth.machine_id,
                },
            });
            conn.on("open", () => {
                console.log("connection open to =>", conn);
                this.connMap[machine_id] = conn;
                resolve();
                this.connAttachListeners(conn, machine_id);
            });
            // timeout is 10 seconds
            setTimeout(() => {
                resolve();
            }, timeout);
        });
    }
    // runs on enter, on nodes change, and else...
    // @deprecated
    // checkConnectionToOtherNodes() {
    //     const myMachineID = store.auth.machine_id;
    //     const knownNodes: any = Object.values(store.auth.known_nodes).filter(
    //         (node: any) => node.active && node.machine_id !== myMachineID
    //     );

    //     console.log("checkConnectionToOtherNodes => nodes to connect to: ", knownNodes, this.connMap);
    //     knownNodes.forEach((node: any) => {
    //         // if connection present...
    //         const conn = this.connMap[node.machine_id];
    //         console.log("checking if connection present to =>", node.machine_id, conn);
    //         if (!conn) {
    //             console.log("conn not present => creating new connection to =>", node.machine_id);
    //             this.createNewConnection(node.machine_id);
    //         } else {
    //             if (!conn.open) {
    //                 console.log("conn not open => opening connection to =>", node.machine_id);
    //                 conn.close();
    //                 this.createNewConnection(node.machine_id);
    //             } else {
    //                 console.log("connection ok, no need to do anything => ", node.machine_id);
    //             }
    //         }
    //     });
    // }

    createMessageWrapper(message: { event: string; document: any }) {
        return {
            format: "external_v1",
            id: generateUUID(),
            created_at: Date.now(),
            from_machine_id: store.auth.machine_id,
            ...message,
        };
    }
    async handleMessage(message: { event: string; document: any }) {
        // TODO: process here if message is not too stale?
        store.handleMessage(message);
    }

    async broadcastMessage(message: { event: string; document: any }) {
        const wrapper = this.createMessageWrapper(message);
        const encDoc: DataMessageEncrypted = await store.encryptData(wrapper);

        for (const conn of Object.values(this.connMap)) {
            if (conn.open) {
                conn.send(encDoc);
            }
        }
    }

    // chechking connections to other nodes but via gun interface.
    async checkConnections_v2(timeout = 5000) {
        const gunsNodes = await gunManager.getActiveNodes();
        // console.log("checkConnections_v2 => ", gunsNodes);
        await Promise.all(
            Object.entries(gunsNodes).map(async ([machine_id, status]) => {
                // do not connect to my own machine_id
                if (machine_id === store.auth.machine_id) {
                    return;
                }
                // only connect to those online;
                // online and last active in last 60 sec...
                const isPeerOnline = status.online;
                const isPeerActiveLastMin = Date.now() - (status.last_active || 0) <= 60 * 1000;
                if (isPeerOnline && isPeerActiveLastMin) {
                    // check if we have opened connection to that node;
                    if (this.connMap[machine_id]?.open) {
                        return;
                    } else {
                        // try to connect
                        return await this.createNewConnection(machine_id, timeout);
                    }
                }
            })
        );
    }

    getConnectedMachines() {
        return Object.keys(this.connMap).filter(machine_id => this.connMap[machine_id]?.open);
    }

    async peerRequest(machine_id: string, { method, data, timeout }: any) {
        const connection = this.connMap[machine_id];
        if (connection?.open) {
            console.log("peerRequest / conn open => waiting to send");

            const rq = new PeerRequest(
                connection,
                { method, data, timeout },
                {
                    middlewareReceive: async data => store.decryptData(data),
                    middlewareSend: async data => store.encryptData(data),
                }
            );
            const response: any = await rq.start();
            console.log("peerRequest / got response => ", response);
            rq.destroy();
            if (response.success) {
                return response.data;
            } else {
                return null;
            }
        } else {
            console.log("peerRequest / conn not open... => null");
            return null;
        }
    }
    async peerRequestFile(machine_id: string, { method, data, timeout, progressCallback }: any) {
        const connection = this.connMap[machine_id];
        if (connection?.open) {
            console.log("peerRequest / conn open => waiting to send");

            const rq = new PeerRequestFile(
                connection,
                { method, data, timeout, progressCallback },
                {
                    middlewareReceive: async data => store.decryptData(data),
                    middlewareSend: async data => store.encryptData(data),
                }
            );
            const response: any = await rq.start();
            console.log("peerRequest / got response => ", response);
            rq.destroy();
            if (response.success) {
                return response.data;
            } else {
                return null;
            }
        } else {
            console.log("peerRequest / conn not open... => null");
            return null;
        }
    }
    async peerRequestAll({ method, data, timeout }: any) {
        return Promise.all(
            Object.keys(this.connMap).map(machine_id => this.peerRequest(machine_id, { method, data, timeout }))
        );
    }
    async peerRequestFastest({ method, data, timeout }: any) {
        return Promise.race(
            Object.keys(this.connMap).map(machine_id => this.peerRequest(machine_id, { method, data, timeout }))
        );
    }

    // maybe better => query each peer if he has file - has => download, else go thru all others...

    // TODO: implement this sometime later...
    // same but returns fastest machine_id answered for further query
    async peerFastestFile({ method, data, timeout }: any): Promise<any> {
        const timeTable: { [machine_id: string]: number } = {};
        const results = await Promise.all(
            Object.keys(this.connMap).map(async machine_id => {
                const start = Date.now();
                const response = await this.peerRequest(machine_id, { method, data, timeout });
                const end = Date.now() - start;
                timeTable[machine_id] = end;
                return response;
            })
        );
        console.log("timeTable => ", timeTable);
        return results;
    }

    // async sendData(data, nodes) {}
    // startConnection() {}

    // createInitializingConnection({ user_id, machine_id }, known_node) {
    //     const idString = APP_MACHINE_PREFIX + user_id + "--" + machine_id;
    // }
}

// have user and machine id
// first attempting to connect to existing user_id, if have a device online;
// if found => request known nodes and connect to all nodes...
