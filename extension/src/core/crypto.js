/**
 * TentacleID - Core Cryptographic Operations
 * Uses Web Crypto API for secure key generation, signing, and encryption
 */

const ALGORITHM = {
  name: 'ECDSA',
  namedCurve: 'P-256'
};

const SIGN_ALGORITHM = {
  name: 'ECDSA',
  hash: { name: 'SHA-256' }
};

const ENCRYPTION_ALGORITHM = {
  name: 'AES-GCM',
  length: 256
};

/**
 * Generate a new ECDSA P-256 key pair for DID
 * @returns {Promise<{publicKey: CryptoKey, privateKey: CryptoKey, publicKeyJwk: Object, privateKeyJwk: Object}>}
 */
export async function generateKeyPair() {
  const keyPair = await crypto.subtle.generateKey(
    ALGORITHM,
    true, // extractable
    ['sign', 'verify']
  );

  const publicKeyJwk = await crypto.subtle.exportKey('jwk', keyPair.publicKey);
  const privateKeyJwk = await crypto.subtle.exportKey('jwk', keyPair.privateKey);

  return {
    publicKey: keyPair.publicKey,
    privateKey: keyPair.privateKey,
    publicKeyJwk,
    privateKeyJwk
  };
}

/**
 * Import a key pair from JWK format
 * @param {Object} publicKeyJwk 
 * @param {Object} privateKeyJwk 
 * @returns {Promise<{publicKey: CryptoKey, privateKey: CryptoKey}>}
 */
export async function importKeyPair(publicKeyJwk, privateKeyJwk) {
  const publicKey = await crypto.subtle.importKey(
    'jwk',
    publicKeyJwk,
    ALGORITHM,
    true,
    ['verify']
  );

  const privateKey = await crypto.subtle.importKey(
    'jwk',
    privateKeyJwk,
    ALGORITHM,
    true,
    ['sign']
  );

  return { publicKey, privateKey };
}

/**
 * Sign data using private key
 * @param {CryptoKey} privateKey 
 * @param {string|ArrayBuffer} data 
 * @returns {Promise<string>} Base64 encoded signature
 */
export async function sign(privateKey, data) {
  const encoder = new TextEncoder();
  const dataBuffer = typeof data === 'string' ? encoder.encode(data) : data;

  const signature = await crypto.subtle.sign(
    SIGN_ALGORITHM,
    privateKey,
    dataBuffer
  );

  return arrayBufferToBase64(signature);
}

/**
 * Verify a signature using public key
 * @param {CryptoKey} publicKey 
 * @param {string} signature - Base64 encoded signature
 * @param {string|ArrayBuffer} data 
 * @returns {Promise<boolean>}
 */
export async function verify(publicKey, signature, data) {
  const encoder = new TextEncoder();
  const dataBuffer = typeof data === 'string' ? encoder.encode(data) : data;
  const signatureBuffer = base64ToArrayBuffer(signature);

  return crypto.subtle.verify(
    SIGN_ALGORITHM,
    publicKey,
    signatureBuffer,
    dataBuffer
  );
}

/**
 * Hash data using SHA-256
 * @param {string|ArrayBuffer} data 
 * @returns {Promise<string>} Hex encoded hash
 */
export async function hash(data) {
  const encoder = new TextEncoder();
  const dataBuffer = typeof data === 'string' ? encoder.encode(data) : data;

  const hashBuffer = await crypto.subtle.digest('SHA-256', dataBuffer);
  return arrayBufferToHex(hashBuffer);
}

/**
 * Derive an encryption key from a password
 * @param {string} password 
 * @param {Uint8Array} salt 
 * @returns {Promise<CryptoKey>}
 */
export async function deriveKey(password, salt) {
  const encoder = new TextEncoder();
  const passwordBuffer = encoder.encode(password);

  const baseKey = await crypto.subtle.importKey(
    'raw',
    passwordBuffer,
    'PBKDF2',
    false,
    ['deriveKey']
  );

  return crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt,
      iterations: 100000,
      hash: 'SHA-256'
    },
    baseKey,
    ENCRYPTION_ALGORITHM,
    false,
    ['encrypt', 'decrypt']
  );
}

/**
 * Encrypt data with a derived key
 * @param {CryptoKey} key 
 * @param {string} data 
 * @returns {Promise<{ciphertext: string, iv: string}>}
 */
export async function encrypt(key, data) {
  const encoder = new TextEncoder();
  const dataBuffer = encoder.encode(data);
  const iv = crypto.getRandomValues(new Uint8Array(12));

  const ciphertext = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    dataBuffer
  );

  return {
    ciphertext: arrayBufferToBase64(ciphertext),
    iv: arrayBufferToBase64(iv)
  };
}

/**
 * Decrypt data with a derived key
 * @param {CryptoKey} key 
 * @param {string} ciphertext - Base64 encoded
 * @param {string} iv - Base64 encoded
 * @returns {Promise<string>}
 */
export async function decrypt(key, ciphertext, iv) {
  const ciphertextBuffer = base64ToArrayBuffer(ciphertext);
  const ivBuffer = base64ToArrayBuffer(iv);

  const decrypted = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: ivBuffer },
    key,
    ciphertextBuffer
  );

  const decoder = new TextDecoder();
  return decoder.decode(decrypted);
}

/**
 * Generate a random salt for key derivation
 * @returns {Uint8Array}
 */
export function generateSalt() {
  return crypto.getRandomValues(new Uint8Array(16));
}

/**
 * Generate a random nonce/challenge
 * @param {number} length 
 * @returns {string}
 */
export function generateNonce(length = 32) {
  const array = crypto.getRandomValues(new Uint8Array(length));
  return arrayBufferToBase64(array.buffer);
}

// ============ Utility Functions ============

/**
 * Convert ArrayBuffer to Base64 string
 * @param {ArrayBuffer} buffer 
 * @returns {string}
 */
export function arrayBufferToBase64(buffer) {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

/**
 * Convert Base64 string to ArrayBuffer
 * @param {string} base64 
 * @returns {ArrayBuffer}
 */
export function base64ToArrayBuffer(base64) {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes.buffer;
}

/**
 * Convert ArrayBuffer to Hex string
 * @param {ArrayBuffer} buffer 
 * @returns {string}
 */
export function arrayBufferToHex(buffer) {
  const bytes = new Uint8Array(buffer);
  return Array.from(bytes)
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}

/**
 * Convert Hex string to ArrayBuffer
 * @param {string} hex 
 * @returns {ArrayBuffer}
 */
export function hexToArrayBuffer(hex) {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) {
    bytes[i / 2] = parseInt(hex.substr(i, 2), 16);
  }
  return bytes.buffer;
}

/**
 * Encode public key to multibase format (for did:key)
 * @param {Object} publicKeyJwk 
 * @returns {Promise<string>}
 */
export async function encodePublicKeyMultibase(publicKeyJwk) {
  // For P-256, we use the compressed point format with multicodec prefix
  // Multicodec for P-256 public key is 0x1200
  const x = base64ToArrayBuffer(publicKeyJwk.x.replace(/-/g, '+').replace(/_/g, '/'));
  const y = base64ToArrayBuffer(publicKeyJwk.y.replace(/-/g, '+').replace(/_/g, '/'));
  
  const xBytes = new Uint8Array(x);
  const yBytes = new Uint8Array(y);
  
  // Compressed format: 0x02 or 0x03 prefix + x coordinate
  const prefix = (yBytes[yBytes.length - 1] & 1) === 0 ? 0x02 : 0x03;
  
  // Multicodec P-256 public key prefix: 0x80 0x24
  const multicodec = new Uint8Array([0x80, 0x24]);
  
  const compressed = new Uint8Array(2 + 1 + xBytes.length);
  compressed.set(multicodec, 0);
  compressed[2] = prefix;
  compressed.set(xBytes, 3);
  
  // Base58btc encoding with 'z' multibase prefix
  return 'z' + base58Encode(compressed);
}

/**
 * Simple Base58 encoding (Bitcoin alphabet)
 * @param {Uint8Array} bytes 
 * @returns {string}
 */
function base58Encode(bytes) {
  const ALPHABET = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
  
  // Convert bytes to big integer
  let num = BigInt(0);
  for (let i = 0; i < bytes.length; i++) {
    num = num * BigInt(256) + BigInt(bytes[i]);
  }
  
  // Convert to base58
  let result = '';
  while (num > 0) {
    result = ALPHABET[Number(num % BigInt(58))] + result;
    num = num / BigInt(58);
  }
  
  // Add leading zeros
  for (let i = 0; i < bytes.length && bytes[i] === 0; i++) {
    result = '1' + result;
  }
  
  return result || '1';
}
