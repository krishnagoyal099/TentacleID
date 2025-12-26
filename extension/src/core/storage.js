/**
 * TentacleID - Secure Storage Layer
 * Encrypted IndexedDB wrapper for credentials and keys
 */

import { deriveKey, encrypt, decrypt, generateSalt, arrayBufferToBase64, base64ToArrayBuffer } from './crypto.js';

const DB_NAME = 'TentacleID';
const DB_VERSION = 1;
const STORES = {
  IDENTITY: 'identity',
  CREDENTIALS: 'credentials',
  PERMISSIONS: 'permissions',
  SETTINGS: 'settings'
};

let db = null;
let encryptionKey = null;

/**
 * Initialize the storage with password protection
 * @param {string} password - User's master password
 * @returns {Promise<boolean>}
 */
export async function initializeStorage(password) {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onerror = () => reject(request.error);
    
    request.onupgradeneeded = (event) => {
      const database = event.target.result;
      
      // Identity store - main user identity
      if (!database.objectStoreNames.contains(STORES.IDENTITY)) {
        database.createObjectStore(STORES.IDENTITY, { keyPath: 'id' });
      }
      
      // Credentials store - verifiable credentials
      if (!database.objectStoreNames.contains(STORES.CREDENTIALS)) {
        const credStore = database.createObjectStore(STORES.CREDENTIALS, { keyPath: 'id' });
        credStore.createIndex('type', 'type', { unique: false });
        credStore.createIndex('issuer', 'issuer', { unique: false });
      }
      
      // Permissions store - granted access permissions
      if (!database.objectStoreNames.contains(STORES.PERMISSIONS)) {
        const permStore = database.createObjectStore(STORES.PERMISSIONS, { keyPath: 'id' });
        permStore.createIndex('domain', 'domain', { unique: false });
        permStore.createIndex('expiresAt', 'expiresAt', { unique: false });
      }
      
      // Settings store - app settings
      if (!database.objectStoreNames.contains(STORES.SETTINGS)) {
        database.createObjectStore(STORES.SETTINGS, { keyPath: 'key' });
      }
    };
    
    request.onsuccess = async () => {
      db = request.result;
      
      // Get or create salt
      try {
        let salt = await getSettingInternal('encryptionSalt');
        if (!salt) {
          salt = arrayBufferToBase64(generateSalt());
          await setSettingInternal('encryptionSalt', salt);
        }
        
        const saltBuffer = new Uint8Array(base64ToArrayBuffer(salt));
        encryptionKey = await deriveKey(password, saltBuffer);
        resolve(true);
      } catch (error) {
        console.error('Storage initialization error:', error);
        reject(error);
      }
    };
  });
}

/**
 * Internal getSetting that assumes db is ready
 */
function getSettingInternal(key) {
  return new Promise((resolve, reject) => {
    if (!db) {
      resolve(null);
      return;
    }
    
    const tx = db.transaction(STORES.SETTINGS, 'readonly');
    const store = tx.objectStore(STORES.SETTINGS);
    const request = store.get(key);
    
    request.onsuccess = () => resolve(request.result?.value);
    request.onerror = () => reject(request.error);
  });
}

/**
 * Internal setSetting that assumes db is ready
 */
function setSettingInternal(key, value) {
  return new Promise((resolve, reject) => {
    if (!db) {
      reject(new Error('Database not ready'));
      return;
    }
    
    const tx = db.transaction(STORES.SETTINGS, 'readwrite');
    const store = tx.objectStore(STORES.SETTINGS);
    const request = store.put({ key, value });
    
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}



/**
 * Check if storage is initialized and unlocked
 * @returns {boolean}
 */
export function isUnlocked() {
  return db !== null && encryptionKey !== null;
}

/**
 * Lock the storage (clear encryption key from memory)
 */
export function lockStorage() {
  encryptionKey = null;
}

/**
 * Check if an identity exists
 * @returns {Promise<boolean>}
 */
export async function hasIdentity() {
  return new Promise((resolve, reject) => {
    if (!db) {
      resolve(false);
      return;
    }
    
    const tx = db.transaction(STORES.IDENTITY, 'readonly');
    const store = tx.objectStore(STORES.IDENTITY);
    const request = store.get('primary');
    
    request.onsuccess = () => resolve(request.result !== undefined);
    request.onerror = () => reject(request.error);
  });
}

/**
 * Save the primary identity (encrypted)
 * @param {Object} identity 
 * @returns {Promise<void>}
 */
export async function saveIdentity(identity) {
  if (!encryptionKey) throw new Error('Storage is locked');
  
  const encrypted = await encrypt(encryptionKey, JSON.stringify(identity));
  
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORES.IDENTITY, 'readwrite');
    const store = tx.objectStore(STORES.IDENTITY);
    
    const record = {
      id: 'primary',
      data: encrypted.ciphertext,
      iv: encrypted.iv,
      did: identity.did // Store DID unencrypted for display
    };
    
    const request = store.put(record);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

/**
 * Get the primary identity (decrypted)
 * @returns {Promise<Object|null>}
 */
export async function getIdentity() {
  if (!encryptionKey) throw new Error('Storage is locked');
  
  return new Promise(async (resolve, reject) => {
    const tx = db.transaction(STORES.IDENTITY, 'readonly');
    const store = tx.objectStore(STORES.IDENTITY);
    const request = store.get('primary');
    
    request.onsuccess = async () => {
      if (!request.result) {
        resolve(null);
        return;
      }
      
      try {
        const decrypted = await decrypt(
          encryptionKey, 
          request.result.data, 
          request.result.iv
        );
        resolve(JSON.parse(decrypted));
      } catch (error) {
        reject(error);
      }
    };
    
    request.onerror = () => reject(request.error);
  });
}

/**
 * Save a credential
 * @param {Object} credential 
 * @returns {Promise<string>} Credential ID
 */
export async function saveCredential(credential) {
  if (!encryptionKey) throw new Error('Storage is locked');
  
  const id = credential.id || `cred_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  const encrypted = await encrypt(encryptionKey, JSON.stringify(credential));
  
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORES.CREDENTIALS, 'readwrite');
    const store = tx.objectStore(STORES.CREDENTIALS);
    
    const record = {
      id,
      type: credential.type || 'VerifiableCredential',
      issuer: credential.issuer?.id || credential.issuer || 'unknown',
      issuedAt: credential.issuanceDate || new Date().toISOString(),
      data: encrypted.ciphertext,
      iv: encrypted.iv
    };
    
    const request = store.put(record);
    request.onsuccess = () => resolve(id);
    request.onerror = () => reject(request.error);
  });
}

/**
 * Get a credential by ID
 * @param {string} id 
 * @returns {Promise<Object|null>}
 */
export async function getCredential(id) {
  if (!encryptionKey) throw new Error('Storage is locked');
  
  return new Promise(async (resolve, reject) => {
    const tx = db.transaction(STORES.CREDENTIALS, 'readonly');
    const store = tx.objectStore(STORES.CREDENTIALS);
    const request = store.get(id);
    
    request.onsuccess = async () => {
      if (!request.result) {
        resolve(null);
        return;
      }
      
      try {
        const decrypted = await decrypt(
          encryptionKey,
          request.result.data,
          request.result.iv
        );
        resolve(JSON.parse(decrypted));
      } catch (error) {
        reject(error);
      }
    };
    
    request.onerror = () => reject(request.error);
  });
}

/**
 * Get all credentials (metadata only, for listing)
 * @returns {Promise<Array>}
 */
export async function listCredentials() {
  return new Promise((resolve, reject) => {
    if (!db) {
      resolve([]);
      return;
    }
    
    const tx = db.transaction(STORES.CREDENTIALS, 'readonly');
    const store = tx.objectStore(STORES.CREDENTIALS);
    const request = store.getAll();
    
    request.onsuccess = () => {
      const credentials = request.result.map(c => ({
        id: c.id,
        type: c.type,
        issuer: c.issuer,
        issuedAt: c.issuedAt
      }));
      resolve(credentials);
    };
    
    request.onerror = () => reject(request.error);
  });
}

/**
 * Delete a credential
 * @param {string} id 
 * @returns {Promise<void>}
 */
export async function deleteCredential(id) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORES.CREDENTIALS, 'readwrite');
    const store = tx.objectStore(STORES.CREDENTIALS);
    const request = store.delete(id);
    
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

/**
 * Save a permission grant
 * @param {Object} permission 
 * @returns {Promise<string>}
 */
export async function savePermission(permission) {
  const id = `perm_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORES.PERMISSIONS, 'readwrite');
    const store = tx.objectStore(STORES.PERMISSIONS);
    
    const record = {
      id,
      domain: permission.domain,
      claims: permission.claims,
      grantedAt: Date.now(),
      expiresAt: permission.expiresAt,
      purpose: permission.purpose
    };
    
    const request = store.put(record);
    request.onsuccess = () => resolve(id);
    request.onerror = () => reject(request.error);
  });
}

/**
 * Get active permissions for a domain
 * @param {string} domain 
 * @returns {Promise<Array>}
 */
export async function getPermissionsForDomain(domain) {
  return new Promise((resolve, reject) => {
    if (!db) {
      resolve([]);
      return;
    }
    
    const tx = db.transaction(STORES.PERMISSIONS, 'readonly');
    const store = tx.objectStore(STORES.PERMISSIONS);
    const index = store.index('domain');
    const request = index.getAll(domain);
    
    request.onsuccess = () => {
      const now = Date.now();
      const active = request.result.filter(p => p.expiresAt > now);
      resolve(active);
    };
    
    request.onerror = () => reject(request.error);
  });
}

/**
 * Revoke a permission
 * @param {string} id 
 * @returns {Promise<void>}
 */
export async function revokePermission(id) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORES.PERMISSIONS, 'readwrite');
    const store = tx.objectStore(STORES.PERMISSIONS);
    const request = store.delete(id);
    
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

/**
 * Clean up expired permissions
 * @returns {Promise<number>} Number of expired permissions removed
 */
export async function cleanupExpiredPermissions() {
  return new Promise((resolve, reject) => {
    if (!db) {
      resolve(0);
      return;
    }
    
    const tx = db.transaction(STORES.PERMISSIONS, 'readwrite');
    const store = tx.objectStore(STORES.PERMISSIONS);
    const request = store.getAll();
    
    request.onsuccess = () => {
      const now = Date.now();
      let removed = 0;
      
      request.result.forEach(p => {
        if (p.expiresAt <= now) {
          store.delete(p.id);
          removed++;
        }
      });
      
      resolve(removed);
    };
    
    request.onerror = () => reject(request.error);
  });
}

/**
 * Get a setting value
 * @param {string} key 
 * @returns {Promise<any>}
 */
async function getSetting(key) {
  return new Promise((resolve, reject) => {
    if (!db) {
      resolve(null);
      return;
    }
    
    const tx = db.transaction(STORES.SETTINGS, 'readonly');
    const store = tx.objectStore(STORES.SETTINGS);
    const request = store.get(key);
    
    request.onsuccess = () => resolve(request.result?.value);
    request.onerror = () => reject(request.error);
  });
}

/**
 * Set a setting value
 * @param {string} key 
 * @param {any} value 
 * @returns {Promise<void>}
 */
async function setSetting(key, value) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORES.SETTINGS, 'readwrite');
    const store = tx.objectStore(STORES.SETTINGS);
    const request = store.put({ key, value });
    
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

/**
 * Export storage settings
 */
export { getSetting, setSetting };
