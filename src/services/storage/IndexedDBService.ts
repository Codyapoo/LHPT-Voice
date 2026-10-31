import { ProjectItem } from '../../types';

const DB_NAME = 'LHPTVoiceDB';
const DB_VERSION = 1;
const STORE_NAME = 'projects';

export class IndexedDBService {
  private db: IDBDatabase | null = null;

  public async init(): Promise<boolean> {
    if (typeof indexedDB === 'undefined') return false;
    return new Promise((resolve) => {
      try {
        const req = indexedDB.open(DB_NAME, DB_VERSION);
        req.onupgradeneeded = (e) => {
          const db = (e.target as IDBOpenDBRequest).result;
          if (!db.objectStoreNames.contains(STORE_NAME)) {
            db.createObjectStore(STORE_NAME, { keyPath: 'id' });
          }
        };
        req.onsuccess = (e) => {
          this.db = (e.target as IDBOpenDBRequest).result;
          resolve(true);
        };
        req.onerror = () => resolve(false);
      } catch {
        resolve(false);
      }
    });
  }

  public async getAllProjects(): Promise<ProjectItem[]> {
    if (!this.db) return [];
    return new Promise((resolve) => {
      try {
        const tx = this.db!.transaction(STORE_NAME, 'readonly');
        const store = tx.objectStore(STORE_NAME);
        const req = store.getAll();
        req.onsuccess = () => resolve(req.result || []);
        req.onerror = () => resolve([]);
      } catch {
        resolve([]);
      }
    });
  }

  public async saveAllProjects(projects: ProjectItem[]): Promise<void> {
    if (!this.db) return;
    try {
      const tx = this.db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      store.clear();
      for (const p of projects) {
        store.put(p);
      }
    } catch {
      // Ignore storage quota or sandbox restrictions
    }
  }

  public async clearAll(): Promise<void> {
    if (!this.db) return;
    try {
      const tx = this.db.transaction(STORE_NAME, 'readwrite');
      tx.objectStore(STORE_NAME).clear();
    } catch {
      // Ignore
    }
  }
}
