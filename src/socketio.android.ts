import { Common } from './socketio-common';

declare const io: any, org: any;

export class SocketIO extends Common {
    protected socket: any;

    /* io.socket.client.Socket; */

    constructor(...args: any[]) {
        super();
        switch (args.length) {
            case 2: {
                let opts = new io.socket.client.IO.Options();
                Object.assign(opts, args[1]);
                this.socket = io.socket.client.IO.socket(args[0], opts);
                break;
            }

            case 3: {
                this.socket = args.pop();
                break;
            }

            default:
        }
    }

    connect(){
        this.socket.connect();
    }

    disconnect(){
        this.socket.disconnect();
    }

    get connected(): boolean {
        return this.socket && this.socket.connected();
    }

    on(event: string, callback: (...payload) => void) {
        this.socket.on(event, new io.socket.emitter.Emitter.Listener({
            call(args) {
                let payload = Array.prototype.slice.call(args);
                let ack = payload.pop();
                if (ack && !(ack.getClass().getName().indexOf('io.socket.client.Socket') === 0 && ack.call)) {
                    payload.push(ack);
                    ack = null;
                }

                payload = payload.map(deserialize);

                if (ack) {
                    const _ack = function () {
                        let _args = Array.prototype.slice.call(arguments);
                        ack.call(_args.map(serialize));
                    };
                    payload.push(_ack);
                }
                callback.apply(null, payload);
            }
        }));
    }

    emit(event: string, ...payload: any[]) {
        if (!event) {
            throw Error('Emit Failed: No Event argument');
        }

        // Check for ack callback
        let ack = payload.pop();

        // Remove ack if final argument is not a function
        if (ack && typeof ack !== 'function') {
            payload.push(ack);
            ack = null;
        }

        // Serialize Emit
        const final = payload.map(serialize);

        if (ack) {
            final.push(new io.socket.client.Ack({
                call: function (args) {
                    args = Array.prototype.slice.call(args);
                    ack.apply(null, (<any[]>args).map(deserialize));
                },
            }));
        }

        // Emit
        this.socket.emit(event, final);
    }

    joinNamespace(nsp: string): void {
        if (this.socket.connected()) {
            const manager = this.socket.io();
            this.socket = manager.socket(nsp);

            // Only join if currently connected. Otherwise just configure to join on connect.
            // This mirrors IOS behavior
            this.socket.connect();
        } else {
            const manager = this.socket.io();
            this.socket = manager.socket(nsp);
        }
    }

    leaveNamespace(): void {
        // Not Implemented
    }
}

export function serialize(data: any): any {
    let store;
    switch (typeof data) {
        case 'string':
        case 'boolean':
        case 'number': {
            return data;
        }

        case 'object': {
            if (!data) {
                return null;
            }

            if (data instanceof Date) {
                return data.toJSON();
            }
            if (Array.isArray(data)) {
                store = new org.json.JSONArray();
                data.forEach((item) => store.put(item));
                return store;
            }
            store = new org.json.JSONObject();
            Object.keys(data).forEach((key) => store.put(key, serialize(data[key])));
            return store;
        }

        default:
            return null;
    }

}

export function deserialize(data): any {
    if (data === null || typeof data !== 'object') {
        return data;
    }
    let store;
    switch (data.getClass().getName()) {
        case 'java.lang.String': {
            return String(data);
        }

        case 'java.lang.Boolean': {
            return Boolean(data);
        }

        case 'java.lang.Integer':
        case 'java.lang.Long':
        case 'java.lang.Double':
        case 'java.lang.Short': {
            return Number(data);
        }

        case 'org.json.JSONArray': {
            store = [];
            for (let j = 0; j < data.length(); j++) {
                store[j] = deserialize(data.get(j));
            }
            break;
        }

        case 'org.json.JSONObject': {
            store = {};
            let i = data.keys();
            while (i.hasNext()) {
                let key = i.next();
                store[key] = deserialize(data.get(key));
            }
            break;
        }

        default:
            store = null;
    }
    return store;
}
