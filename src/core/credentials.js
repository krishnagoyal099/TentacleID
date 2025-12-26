/**
 * TentacleID - Verifiable Credentials with Selective Disclosure
 * Implements W3C VC Data Model with hash-based selective disclosure
 */

import { sign, verify, hash, generateNonce, importKeyPair } from './crypto.js';

/**
 * Create a Verifiable Credential
 * @param {Object} params
 * @param {Object} params.issuer - Issuer identity
 * @param {string} params.subjectDid - Subject's DID
 * @param {Object} params.claims - Claims to include
 * @param {string[]} params.type - Credential types
 * @param {Date} params.expirationDate - Optional expiration
 * @returns {Promise<Object>}
 */
export async function createCredential({ issuer, subjectDid, claims, type = ['VerifiableCredential'], expirationDate }) {
  const credential = {
    '@context': [
      'https://www.w3.org/2018/credentials/v1',
      'https://www.w3.org/2018/credentials/examples/v1'
    ],
    id: `urn:uuid:${generateUUID()}`,
    type,
    issuer: {
      id: issuer.did,
      name: issuer.name || 'TentacleID Issuer'
    },
    issuanceDate: new Date().toISOString(),
    credentialSubject: {
      id: subjectDid,
      ...claims
    }
  };

  if (expirationDate) {
    credential.expirationDate = expirationDate.toISOString();
  }

  // Create disclosure hashes for selective disclosure
  credential._sdHashes = await createSelectiveDisclosureHashes(claims);

  // Sign the credential
  const keyPair = await importKeyPair(issuer.keyPair.publicKeyJwk, issuer.keyPair.privateKeyJwk);
  const canonicalCredential = JSON.stringify(credential);
  const signature = await sign(keyPair.privateKey, canonicalCredential);

  credential.proof = {
    type: 'EcdsaSecp256r1Signature2019',
    created: new Date().toISOString(),
    verificationMethod: `${issuer.did}#keys-1`,
    proofPurpose: 'assertionMethod',
    proofValue: signature
  };

  return credential;
}

/**
 * Create hashes for each claim for selective disclosure
 * @param {Object} claims 
 * @returns {Promise<Object>}
 */
async function createSelectiveDisclosureHashes(claims) {
  const hashes = {};
  
  for (const [key, value] of Object.entries(claims)) {
    const salt = generateNonce(16);
    const claimData = `${salt}:${key}:${JSON.stringify(value)}`;
    hashes[key] = {
      hash: await hash(claimData),
      salt
    };
  }
  
  return hashes;
}

/**
 * Create a presentation with selective disclosure
 * @param {Object} params
 * @param {Object} params.credential - Full credential
 * @param {string[]} params.disclosedClaims - Claims to reveal
 * @param {Object} params.holder - Holder's identity
 * @param {string} params.challenge - Verifier's challenge nonce
 * @param {string} params.domain - Verifier's domain
 * @param {number} params.expiresIn - Presentation validity in seconds (default: 300)
 * @returns {Promise<Object>}
 */
export async function createSelectivePresentation({ 
  credential, 
  disclosedClaims, 
  holder, 
  challenge, 
  domain,
  expiresIn = 300 
}) {
  // Create a derived credential with only selected claims
  const derivedSubject = {
    id: credential.credentialSubject.id
  };

  const disclosures = [];

  for (const claimName of disclosedClaims) {
    if (credential.credentialSubject[claimName] !== undefined) {
      derivedSubject[claimName] = credential.credentialSubject[claimName];
      
      // Include disclosure proof
      if (credential._sdHashes && credential._sdHashes[claimName]) {
        disclosures.push({
          claim: claimName,
          value: credential.credentialSubject[claimName],
          salt: credential._sdHashes[claimName].salt,
          hash: credential._sdHashes[claimName].hash
        });
      }
    }
  }

  // Create the verifiable presentation
  const presentation = {
    '@context': [
      'https://www.w3.org/2018/credentials/v1'
    ],
    type: ['VerifiablePresentation', 'SelectiveDisclosurePresentation'],
    holder: holder.did,
    verifiableCredential: [{
      '@context': credential['@context'],
      id: credential.id,
      type: credential.type,
      issuer: credential.issuer,
      issuanceDate: credential.issuanceDate,
      expirationDate: credential.expirationDate,
      credentialSubject: derivedSubject,
      proof: credential.proof
    }],
    selectiveDisclosure: {
      disclosedClaims,
      disclosures,
      hiddenClaims: Object.keys(credential.credentialSubject)
        .filter(k => k !== 'id' && !disclosedClaims.includes(k))
    },
    presentationMetadata: {
      challenge,
      domain,
      issuedAt: Date.now(),
      expiresAt: Date.now() + (expiresIn * 1000)
    }
  };

  // Sign the presentation
  const keyPair = await importKeyPair(holder.keyPair.publicKeyJwk, holder.keyPair.privateKeyJwk);
  const presentationData = JSON.stringify({
    holder: presentation.holder,
    challenge,
    domain,
    credentialId: credential.id,
    disclosedClaims
  });
  const signature = await sign(keyPair.privateKey, presentationData);

  presentation.proof = {
    type: 'EcdsaSecp256r1Signature2019',
    created: new Date().toISOString(),
    verificationMethod: `${holder.did}#keys-1`,
    proofPurpose: 'authentication',
    challenge,
    domain,
    proofValue: signature
  };

  return presentation;
}

/**
 * Verify a selective disclosure presentation
 * @param {Object} presentation 
 * @param {string} expectedChallenge 
 * @param {string} expectedDomain 
 * @returns {Promise<{valid: boolean, claims?: Object, error?: string}>}
 */
export async function verifyPresentation(presentation, expectedChallenge, expectedDomain) {
  try {
    // Check expiry
    if (presentation.presentationMetadata.expiresAt < Date.now()) {
      return { valid: false, error: 'Presentation expired' };
    }

    // Check challenge and domain
    if (presentation.presentationMetadata.challenge !== expectedChallenge) {
      return { valid: false, error: 'Challenge mismatch' };
    }

    if (presentation.presentationMetadata.domain !== expectedDomain) {
      return { valid: false, error: 'Domain mismatch' };
    }

    // Verify disclosure hashes
    for (const disclosure of presentation.selectiveDisclosure.disclosures) {
      const claimData = `${disclosure.salt}:${disclosure.claim}:${JSON.stringify(disclosure.value)}`;
      const computedHash = await hash(claimData);
      
      if (computedHash !== disclosure.hash) {
        return { valid: false, error: `Invalid disclosure for claim: ${disclosure.claim}` };
      }
    }

    // Extract verified claims
    const claims = {};
    for (const cred of presentation.verifiableCredential) {
      Object.assign(claims, cred.credentialSubject);
    }
    delete claims.id;

    return { 
      valid: true, 
      claims,
      holder: presentation.holder,
      disclosedClaims: presentation.selectiveDisclosure.disclosedClaims,
      hiddenClaims: presentation.selectiveDisclosure.hiddenClaims
    };
  } catch (error) {
    return { valid: false, error: error.message };
  }
}

/**
 * Create a time-limited permission grant
 * @param {Object} params
 * @param {Object} params.holder - Holder's identity
 * @param {string} params.domain - Requesting domain
 * @param {string[]} params.claims - Claims being granted access to
 * @param {number} params.durationMinutes - Access duration
 * @param {string} params.purpose - Purpose of the access
 * @returns {Promise<Object>}
 */
export async function createPermissionGrant({ holder, domain, claims, durationMinutes, purpose }) {
  const grant = {
    id: `grant:${generateUUID()}`,
    type: 'TentacleIDPermissionGrant',
    holder: holder.did,
    domain,
    claims,
    purpose,
    issuedAt: Date.now(),
    expiresAt: Date.now() + (durationMinutes * 60 * 1000)
  };

  // Sign the grant
  const keyPair = await importKeyPair(holder.keyPair.publicKeyJwk, holder.keyPair.privateKeyJwk);
  const grantData = JSON.stringify(grant);
  const signature = await sign(keyPair.privateKey, grantData);

  return {
    ...grant,
    signature,
    publicKeyJwk: holder.keyPair.publicKeyJwk
  };
}

/**
 * Check if a permission grant is valid
 * @param {Object} grant 
 * @returns {{valid: boolean, remainingTime?: number, error?: string}}
 */
export function checkPermissionGrant(grant) {
  const now = Date.now();
  
  if (now >= grant.expiresAt) {
    return { valid: false, error: 'Permission expired' };
  }

  return {
    valid: true,
    remainingTime: grant.expiresAt - now,
    remainingMinutes: Math.ceil((grant.expiresAt - now) / 60000)
  };
}

/**
 * Create derived claims (e.g., "isOver18" from birthdate)
 * @param {Object} claims - Original claims
 * @returns {Object} Derived claims
 */
export function deriveClaims(claims) {
  const derived = {};

  // Age derivation from birthDate
  if (claims.birthDate) {
    const birthDate = new Date(claims.birthDate);
    const today = new Date();
    let age = today.getFullYear() - birthDate.getFullYear();
    const monthDiff = today.getMonth() - birthDate.getMonth();
    
    if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) {
      age--;
    }

    derived.age = age;
    derived.isOver18 = age >= 18;
    derived.isOver21 = age >= 21;
    derived.ageRange = age < 18 ? 'under18' : 
                       age < 25 ? '18-24' : 
                       age < 35 ? '25-34' : 
                       age < 50 ? '35-49' : '50+';
  }

  // Email domain derivation
  if (claims.email) {
    const domain = claims.email.split('@')[1];
    derived.emailDomain = domain;
    derived.hasVerifiedEmail = true;
  }

  // Country/region derivation from address
  if (claims.address?.country) {
    derived.country = claims.address.country;
    derived.isEU = ['AT', 'BE', 'BG', 'HR', 'CY', 'CZ', 'DK', 'EE', 'FI', 'FR', 
                    'DE', 'GR', 'HU', 'IE', 'IT', 'LV', 'LT', 'LU', 'MT', 'NL', 
                    'PL', 'PT', 'RO', 'SK', 'SI', 'ES', 'SE'].includes(claims.address.country);
  }

  return derived;
}

/**
 * Generate a UUID v4
 * @returns {string}
 */
function generateUUID() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = Math.random() * 16 | 0;
    const v = c === 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
}

export { generateUUID };
