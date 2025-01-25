import GUN, { IGunUserInstance } from "gun";
import "gun/sea";
const SEA = Gun.SEA;
import "gun/lib/radix.js";
import "gun/lib/radisk.js";
import "gun/lib/store.js";
import "gun/lib/rindexed.js";

// gun instance is being used as a common machine ids manager
// there we keep online nodes and such;
export class GunManager {
    gun: any;
    auth: boolean = false;
    constructor() {
        const gun = new GUN({
            peers: ["https://peer.wallie.io/gun"],
            localStorage: false, // Disable localStorage
            indexedDB: true,
        });
        this.gun = gun.user();
    }
    async createUser(user_id: string, pass: string) {
        return new Promise((resolve, reject) => {
            this.gun.create(user_id, pass, (result: any) => {
                if (result.err) {
                    resolve(false);
                } else {
                    resolve(true);
                }
            });
        });
    }
    async logIn(user_id: string, pass: string) {
        console.log("gun attempt to login => ", arguments);
        return new Promise((resolve, reject) => {
            this.gun.auth(user_id, pass, (result: any) => {
                if (result.err) {
                    console.log("gun login err => ", result.err);
                    this.auth = false;
                    resolve(false);
                } else {
                    console.log("gun login success => ", result, this.gun);
                    this.auth = true;
                    resolve(true);
                }
            });
        });
    }
    encryptSea(data: any) {
        const pair = this.gun.pair();
        return SEA.encrypt(data, pair);
    }
    decryptSea(data: any) {
        const pair = this.gun.pair();
        return SEA.decrypt(data, pair);
    }
    async signal(machine_id: string, data: any) {
        const encData = await this.encryptSea(data);
        const put = {
            [machine_id]: encData,
        };
        // console.log("gun signal => ", arguments, encData, put);
        this.gun.get("active_nodes").put(put);
    }
    async getActiveNodes() {
        return new Promise((resolve, reject) => {
            this.gun.get("active_nodes").once(async (data: any) => {
                const nodes: any = {};
                for (const [key, value] of Object.entries(data)) {
                    if (key === "_") continue;
                    nodes[key] = await this.decryptSea(value);
                }
                resolve(nodes);
            });
        });
    }
}
