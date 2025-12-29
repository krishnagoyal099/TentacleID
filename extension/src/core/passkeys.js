/**
 * TentacleID Passkey (WebAuthn) Integration Module
 * 
 * Enables biometric authentication (fingerprint, face ID) for wallet unlock.
 * Uses the Web Authentication API (WebAuthn) standard.
 */

// ============ Configuration ============

const RELYING_PARTY = {
  name: 'TentacleID',
  id: typeof window !== 'undefined' ? window.location.hostname : 'localhost'
};

const USER_VERIFICATION = 'preferred'; // 'required' | 'preferred' | 'discouraged'
const AUTHENTICATOR_ATTACHMENT = 'platform'; // 'platform' for built-in, 'cross-platform' for USB keys

// Storage key for credentials
const PASSKEY_STORAGE_KEY = 'tentacleid_passkeys';

// ============ Support Detection ============

/**
 * Check if WebAuthn/Passkeys are supported in this browser
 * @returns {Promise<{supported: boolean, platformAuth: boolean}>}
 */
export async function isPasskeySupported() {
  // Check basic support
  if (!window.PublicKeyCredential) {
    return { supported: false, platformAuth: false, reason: 'WebAuthn not supported' };
  }
  
  try {
    // Check if platform authenticator (fingerprint/faceID) is available
    const platformAuth = await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable();
    
    // Check for conditional mediation support (auto-fill passkeys)
    let conditionalSupport = false;
    if (PublicKeyCredential.isConditionalMediationAvailable) {
      conditionalSupport = await PublicKeyCredential.isConditionalMediationAvailable();
    }
    
    return {
      supported: true,
      platformAuth,
      conditionalSupport,
      reason: platformAuth ? 'Platform authenticator available' : 'Only external authenticators'
    };
  } catch (error) {
    return { supported: false, platformAuth: false, reason: error.message };
  }
}

// ============ Passkey Registration ============

/**
 * Register a new passkey for the user
 * 
 * @param {string} userId - User's DID or unique identifier
 * @param {string} displayName - User's display name
 * @returns {Promise<{success: boolean, credential?: Object, error?: string}>}
 */
export async function registerPasskey(userId, displayName = 'TentacleID User') {
  const support = await isPasskeySupported();
  if (!support.supported) {
    return { success: false, error: support.reason };
  }
  
  try {
    // Generate a random challenge
    const challenge = new Uint8Array(32);
    crypto.getRandomValues(challenge);
    
    // Convert userId to bytes
    const userIdBytes = new TextEncoder().encode(userId.slice(0, 64)); // Max 64 bytes
    
    // Create credential options
    const createOptions = {
      publicKey: {
        // Challenge for this registration
        challenge,
        
        // Relying party info
        rp: RELYING_PARTY,
        
        // User info
        user: {
          id: userIdBytes,
          name: userId,
          displayName: displayName
        },
        
        // Supported algorithms (ES256 and RS256)
        pubKeyCredParams: [
          { type: 'public-key', alg: -7 },  // ES256
          { type: 'public-key', alg: -257 }  // RS256
        ],
        
        // Authenticator requirements
        authenticatorSelection: {
          authenticatorAttachment: AUTHENTICATOR_ATTACHMENT,
          userVerification: USER_VERIFICATION,
          residentKey: 'preferred',
          requireResidentKey: false
        },
        
        // Timeout (2 minutes)
        timeout: 120000,
        
        // Attestation preference
        attestation: 'none' // 'direct' if you need to verify the authenticator
      }
    };
    
    // Create the credential
    const credential = await navigator.credentials.create(createOptions);
    
    // Extract and store credential info
    const credentialInfo = {
      id: credential.id,
      rawId: arrayBufferToBase64(credential.rawId),
      type: credential.type,
      userId: userId,
      displayName: displayName,
      createdAt: Date.now(),
      // Store public key for verification (in real app, send to server)
      publicKey: arrayBufferToBase64(credential.response.getPublicKey?.() || new ArrayBuffer(0)),
      authenticatorData: arrayBufferToBase64(credential.response.authenticatorData || new ArrayBuffer(0))
    };
    
    // Save to storage
    await saveCredentialToStorage(credentialInfo);
    
    return {
      success: true,
      credential: credentialInfo
    };
    
  } catch (error) {
    console.error('Passkey registration failed:', error);
    return {
      success: false,
      error: error.message || 'Registration failed'
    };
  }
}

// ============ Passkey Authentication ============

/**
 * Authenticate using a registered passkey
 * 
 * @returns {Promise<{success: boolean, userId?: string, error?: string}>}
 */
export async function authenticateWithPasskey() {
  const support = await isPasskeySupported();
  if (!support.supported) {
    return { success: false, error: support.reason };
  }
  
  try {
    // Get stored credentials
    const storedCredentials = await getStoredCredentials();
    
    if (storedCredentials.length === 0) {
      return { success: false, error: 'No passkeys registered' };
    }
    
    // Generate challenge
    const challenge = new Uint8Array(32);
    crypto.getRandomValues(challenge);
    
    // Create allowed credentials list
    const allowCredentials = storedCredentials.map(cred => ({
      type: 'public-key',
      id: base64ToArrayBuffer(cred.rawId),
      transports: ['internal', 'hybrid'] // Platform and cross-device
    }));
    
    // Authentication options
    const getOptions = {
      publicKey: {
        challenge,
        rpId: RELYING_PARTY.id,
        allowCredentials,
        userVerification: USER_VERIFICATION,
        timeout: 60000
      }
    };
    
    // Request authentication
    const assertion = await navigator.credentials.get(getOptions);
    
    // Find matching credential
    const matchedCred = storedCredentials.find(c => c.id === assertion.id);
    
    if (!matchedCred) {
      return { success: false, error: 'Credential not found' };
    }
    
    // In a real app, verify the assertion signature against stored public key
    // For this demo, successful assertion means authentication passed
    
    return {
      success: true,
      userId: matchedCred.userId,
      credentialId: assertion.id,
      authenticatedAt: Date.now()
    };
    
  } catch (error) {
    console.error('Passkey authentication failed:', error);
    
    // Handle specific error types
    if (error.name === 'NotAllowedError') {
      return { success: false, error: 'Authentication cancelled by user' };
    }
    if (error.name === 'SecurityError') {
      return { success: false, error: 'Security error - ensure HTTPS' };
    }
    
    return {
      success: false,
      error: error.message || 'Authentication failed'
    };
  }
}

// ============ Credential Management ============

/**
 * Get all stored passkey credentials
 * @returns {Promise<Array>}
 */
export async function getStoredCredentials() {
  try {
    // Try chrome.storage first (for extension)
    if (typeof chrome !== 'undefined' && chrome.storage) {
      return new Promise((resolve) => {
        chrome.storage.local.get(PASSKEY_STORAGE_KEY, (result) => {
          resolve(result[PASSKEY_STORAGE_KEY] || []);
        });
      });
    }
    
    // Fallback to localStorage
    const stored = localStorage.getItem(PASSKEY_STORAGE_KEY);
    return stored ? JSON.parse(stored) : [];
  } catch (error) {
    console.error('Error getting stored credentials:', error);
    return [];
  }
}

/**
 * Save a credential to storage
 * @param {Object} credential - Credential info to save
 */
async function saveCredentialToStorage(credential) {
  const credentials = await getStoredCredentials();
  
  // Remove existing credential with same id (update)
  const filtered = credentials.filter(c => c.id !== credential.id);
  filtered.push(credential);
  
  try {
    if (typeof chrome !== 'undefined' && chrome.storage) {
      await chrome.storage.local.set({ [PASSKEY_STORAGE_KEY]: filtered });
    } else {
      localStorage.setItem(PASSKEY_STORAGE_KEY, JSON.stringify(filtered));
    }
  } catch (error) {
    console.error('Error saving credential:', error);
    throw error;
  }
}

/**
 * Remove a passkey credential
 * @param {string} credentialId - The credential ID to remove
 */
export async function removePasskey(credentialId) {
  const credentials = await getStoredCredentials();
  const filtered = credentials.filter(c => c.id !== credentialId);
  
  try {
    if (typeof chrome !== 'undefined' && chrome.storage) {
      await chrome.storage.local.set({ [PASSKEY_STORAGE_KEY]: filtered });
    } else {
      localStorage.setItem(PASSKEY_STORAGE_KEY, JSON.stringify(filtered));
    }
    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

/**
 * Check if any passkeys are registered
 * @returns {Promise<boolean>}
 */
export async function hasRegisteredPasskeys() {
  const credentials = await getStoredCredentials();
  return credentials.length > 0;
}

// ============ Utility Functions ============

function arrayBufferToBase64(buffer) {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

function base64ToArrayBuffer(base64) {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes.buffer;
}

// ============ Quick Setup Functions ============

/**
 * Complete passkey setup flow
 * @param {string} did - User's DID
 * @returns {Promise<Object>}
 */
export async function setupPasskeyForDID(did) {
  const support = await isPasskeySupported();
  
  if (!support.supported) {
    return {
      success: false,
      error: 'Passkeys not supported on this device',
      support
    };
  }
  
  if (!support.platformAuth) {
    return {
      success: false,
      error: 'No biometric authenticator available',
      support
    };
  }
  
  // Extract display name from DID
  const shortDid = did.length > 20 ? `${did.slice(0, 15)}...${did.slice(-5)}` : did;
  
  const result = await registerPasskey(did, shortDid);
  
  return {
    ...result,
    support
  };
}

/**
 * Quick unlock with passkey if available, with fallback info
 * @returns {Promise<Object>}
 */
export async function quickUnlockWithPasskey() {
  const hasPasskeys = await hasRegisteredPasskeys();
  
  if (!hasPasskeys) {
    return {
      success: false,
      fallbackRequired: true,
      error: 'No passkeys registered - use password'
    };
  }
  
  const result = await authenticateWithPasskey();
  
  if (!result.success) {
    return {
      ...result,
      fallbackRequired: true
    };
  }
  
  return result;
}
