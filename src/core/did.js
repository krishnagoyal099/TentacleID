/**
 * TentacleID - Decentralized Identifier (DID) Management
 * Implements did:key method per W3C DID specification
 */

import { 
  generateKeyPair, 
  importKeyPair,
  encodePublicKeyMultibase,
  arrayBufferToBase64
} from './crypto.js';

/**
 * Create a new DID identity
 * @returns {Promise<{did: string, didDocument: Object, keyPair: Object}>}
 */
export async function createIdentity() {
  const keyPair = await generateKeyPair();
  const multibaseKey = await encodePublicKeyMultibase(keyPair.publicKeyJwk);
  
  const did = `did:key:${multibaseKey}`;
  const didDocument = createDIDDocument(did, keyPair.publicKeyJwk, multibaseKey);

  return {
    did,
    didDocument,
    keyPair: {
      publicKeyJwk: keyPair.publicKeyJwk,
      privateKeyJwk: keyPair.privateKeyJwk
    }
  };
}

/**
 * Create a DID Document
 * @param {string} did 
 * @param {Object} publicKeyJwk 
 * @param {string} multibaseKey 
 * @returns {Object}
 */
function createDIDDocument(did, publicKeyJwk, multibaseKey) {
  const keyId = `${did}#${multibaseKey}`;
  
  return {
    '@context': [
      'https://www.w3.org/ns/did/v1',
      'https://w3id.org/security/suites/jws-2020/v1'
    ],
    id: did,
    verificationMethod: [
      {
        id: keyId,
        type: 'JsonWebKey2020',
        controller: did,
        publicKeyJwk: {
          kty: publicKeyJwk.kty,
          crv: publicKeyJwk.crv,
          x: publicKeyJwk.x,
          y: publicKeyJwk.y
        }
      }
    ],
    authentication: [keyId],
    assertionMethod: [keyId],
    capabilityInvocation: [keyId],
    capabilityDelegation: [keyId]
  };
}

/**
 * Resolve a did:key to its DID Document
 * @param {string} did 
 * @returns {Promise<Object>}
 */
export async function resolveDID(did) {
  if (!did.startsWith('did:key:')) {
    throw new Error('Only did:key method is supported');
  }

  const multibaseKey = did.substring(8); // Remove 'did:key:'
  
  // For did:key, we can derive the document from the key itself
  // In a real implementation, this would involve proper multibase decoding
  
  return {
    '@context': 'https://w3id.org/did-resolution/v1',
    didDocument: {
      '@context': [
        'https://www.w3.org/ns/did/v1',
        'https://w3id.org/security/suites/jws-2020/v1'
      ],
      id: did,
      verificationMethod: [
        {
          id: `${did}#${multibaseKey}`,
          type: 'JsonWebKey2020',
          controller: did
        }
      ],
      authentication: [`${did}#${multibaseKey}`],
      assertionMethod: [`${did}#${multibaseKey}`]
    },
    didResolutionMetadata: {
      contentType: 'application/did+ld+json'
    },
    didDocumentMetadata: {}
  };
}

/**
 * Create an authentication proof (for login)
 * @param {Object} identity - Identity object with DID and keyPair
 * @param {string} challenge - Challenge nonce from verifier
 * @param {string} domain - Domain making the request
 * @returns {Promise<Object>}
 */
export async function createAuthenticationProof(identity, challenge, domain) {
  const { sign } = await import('./crypto.js');
  const { publicKeyJwk, privateKeyJwk } = identity.keyPair;
  const keyPair = await importKeyPair(publicKeyJwk, privateKeyJwk);
  
  const payload = {
    iss: identity.did,
    aud: domain,
    nonce: challenge,
    iat: Math.floor(Date.now() / 1000),
    exp: Math.floor(Date.now() / 1000) + 300 // 5 minute expiry
  };

  const payloadString = JSON.stringify(payload);
  const signature = await sign(keyPair.privateKey, payloadString);

  return {
    type: 'TentacleIDAuthProof',
    did: identity.did,
    payload,
    signature,
    publicKeyJwk: publicKeyJwk
  };
}

/**
 * Verify an authentication proof
 * @param {Object} proof 
 * @param {string} expectedChallenge 
 * @param {string} expectedDomain 
 * @returns {Promise<{valid: boolean, did?: string, error?: string}>}
 */
export async function verifyAuthenticationProof(proof, expectedChallenge, expectedDomain) {
  const { verify, importKeyPair } = await import('./crypto.js');
  
  try {
    // Check expiry
    if (proof.payload.exp < Math.floor(Date.now() / 1000)) {
      return { valid: false, error: 'Proof expired' };
    }

    // Check challenge
    if (proof.payload.nonce !== expectedChallenge) {
      return { valid: false, error: 'Challenge mismatch' };
    }

    // Check domain
    if (proof.payload.aud !== expectedDomain) {
      return { valid: false, error: 'Domain mismatch' };
    }

    // Verify signature
    const keyPair = await importKeyPair(proof.publicKeyJwk, proof.publicKeyJwk);
    const payloadString = JSON.stringify(proof.payload);
    const isValid = await verify(keyPair.publicKey, proof.signature, payloadString);

    if (!isValid) {
      return { valid: false, error: 'Invalid signature' };
    }

    return { valid: true, did: proof.did };
  } catch (error) {
    return { valid: false, error: error.message };
  }
}

/**
 * Get shortened display version of DID
 * @param {string} did 
 * @returns {string}
 */
export function shortenDID(did) {
  if (!did || did.length < 30) return did;
  const parts = did.split(':');
  if (parts.length < 3) return did;
  const key = parts[2];
  return `did:key:${key.substring(0, 8)}...${key.substring(key.length - 6)}`;
}

/**
 * Check if a string is a valid DID format
 * @param {string} did 
 * @returns {boolean}
 */
export function isValidDID(did) {
  if (!did || typeof did !== 'string') return false;
  const didRegex = /^did:[a-z0-9]+:[a-zA-Z0-9._%-]+$/;
  return didRegex.test(did);
}
