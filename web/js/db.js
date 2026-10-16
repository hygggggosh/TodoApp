// db.js —— IndexedDB 薄封装：所有个人数据都在本机
const DB_NAME = "muse";
const DB_VERSION = 2;
let _db = null;

export function uid() { return crypto.randomUUID(); }
export function nowISO() { return new Date().toISOString(); }

export function open() {
  if (_db) return Promise.resolve(_db);
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains("kv")) db.createObjectStore("kv", { keyPath: "key" });
      if (!db.objectStoreNames.contains("tasks")) {
        const s = db.createObjectStore("tasks", { keyPath: "id" });
        s.createIndex("createdAt", "createdAt");
        s.createIndex("done", "done");
      }
      if (!db.objectStoreNames.contains("entries")) {
        const s = db.createObjectStore("entries", { keyPath: "id" });
        s.createIndex("createdAt", "createdAt");
      }
      if (!db.objectStoreNames.contains("memories")) {
        const s = db.createObjectStore("memories", { keyPath: "id" });
        s.createIndex("createdAt", "createdAt");
      }
      if (!db.objectStoreNames.contains("sessions")) {
        const s = db.createObjectStore("sessions", { keyPath: "id" });
        s.createIndex("updatedAt", "updatedAt");
      }
      if (!db.objectStoreNames.contains("messages")) {
        const s = db.createObjectStore("messages", { keyPath: "id" });
        s.createIndex("sessionId", "sessionId");
      }
      if (!db.objectStoreNames.contains("usage")) {
        const s = db.createObjectStore("usage", { keyPath: "id" });
        s.createIndex("ts", "ts");
      }
    };
    req.onsuccess = () => { _db = req.result; resolve(_db); };
    req.onerror = () => reject(req.error);
  });
}

function tx(store, mode) {
  return _db.transaction(store, mode).objectStore(store);
}
export function get(store, key) {
  return new Promise((res, rej) => {
    const r = tx(store, "readonly").get(key);
    r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error);
  });
}
export function getAll(store) {
  return new Promise((res, rej) => {
    const r = tx(store, "readonly").getAll();
    r.onsuccess = () => res(r.result || []); r.onerror = () => rej(r.error);
  });
}
export function put(store, value) {
  return new Promise((res, rej) => {
    const r = tx(store, "readwrite").put(value);
    r.onsuccess = () => res(value); r.onerror = () => rej(r.error);
  });
}
export function del(store, key) {
  return new Promise((res, rej) => {
    const r = tx(store, "readwrite").delete(key);
    r.onsuccess = () => res(true); r.onerror = () => rej(r.error);
  });
}
export function clear(store) {
  return new Promise((res, rej) => {
    const r = tx(store, "readwrite").clear();
    r.onsuccess = () => res(true); r.onerror = () => rej(r.error);
  });
}
export function kvGet(key) {
  return get("kv", key).then(v => (v ? v.value : null));
}
export function kvSet(key, value) {
  return put("kv", { key, value });
}
export async function count(store) {
  return (await getAll(store)).length;
}
