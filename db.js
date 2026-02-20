// IndexedDB KV store for Relatório de Voo (não altera layout/funcionalidades)
// Objetivo: substituir flightReports do localStorage por IndexedDB, com migração automática e backup.

const RV_IDB = (() => {
  const DB_NAME = "relatorio_voo_db";
  const DB_VERSION = 1;
  const STORE = "kv";

  let _db = null;

  function _open(){
    if (_db) return Promise.resolve(_db);
    return new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onerror = () => reject(req.error || new Error("Falha ao abrir IndexedDB"));
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(STORE)){
          db.createObjectStore(STORE, { keyPath: "key" });
        }
      };
      req.onsuccess = () => {
        _db = req.result;
        resolve(_db);
      };
    });
  }

  async function get(key){
    const db = await _open();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, "readonly");
      const store = tx.objectStore(STORE);
      const req = store.get(key);
      req.onerror = () => reject(req.error || new Error("Falha ao ler IndexedDB"));
      req.onsuccess = () => resolve(req.result ? req.result.value : null);
    });
  }

  async function set(key, value){
    const db = await _open();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, "readwrite");
      const store = tx.objectStore(STORE);
      const req = store.put({ key, value });
      req.onerror = () => reject(req.error || new Error("Falha ao gravar IndexedDB"));
      req.onsuccess = () => resolve(true);
    });
  }

  async function del(key){
    const db = await _open();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, "readwrite");
      const store = tx.objectStore(STORE);
      const req = store.delete(key);
      req.onerror = () => reject(req.error || new Error("Falha ao apagar IndexedDB"));
      req.onsuccess = () => resolve(true);
    });
  }

  async function migrateFlightReportsFromLocalStorage(){
    try{
      const existing = await get("flightReports");
      if (Array.isArray(existing)) return existing;

      const raw = localStorage.getItem("flightReports");
      if (!raw) return [];

      let parsed = [];
      try { parsed = JSON.parse(raw) || []; } catch { parsed = []; }
      if (!Array.isArray(parsed)) parsed = [];

      // grava no IndexedDB e mantém backup no localStorage (segurança)
      await set("flightReports", parsed);
      localStorage.setItem("flightReports_idb_migrated", "1");

      return parsed;
    }catch{
      // se IndexedDB falhar, mantém comportamento antigo
      let parsed = [];
      try { parsed = JSON.parse(localStorage.getItem("flightReports")) || []; } catch { parsed = []; }
      return Array.isArray(parsed) ? parsed : [];
    }
  }

  return { get, set, del, migrateFlightReportsFromLocalStorage };
})();
