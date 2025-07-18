"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.withLock = withLock;
const locks = new Map();
async function withLock(key, fn) {
    const last = locks.get(key) ?? Promise.resolve();
    let resolveNext, rejectNext;
    const next = new Promise((res, rej) => { resolveNext = res; rejectNext = rej; });
    locks.set(key, last.then(fn).then(resolveNext, rejectNext).finally(() => {
        if (locks.get(key) === next)
            locks.delete(key);
    }));
    return next;
}
