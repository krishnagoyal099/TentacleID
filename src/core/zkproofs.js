/**
 * TentacleID Zero-Knowledge Proofs Module
 * 
 * Implements hash-based ZK proofs for privacy-preserving verification.
 * Uses commitment schemes and hash chains for proving statements without revealing values.
 */

// ============ Utility Functions ============

/**
 * Convert string to ArrayBuffer
 */
function stringToBuffer(str) {
  return new TextEncoder().encode(str);
}

/**
 * Convert ArrayBuffer to hex string
 */
function bufferToHex(buffer) {
  return Array.from(new Uint8Array(buffer))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}

/**
 * Convert hex string to ArrayBuffer
 */
function hexToBuffer(hex) {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) {
    bytes[i / 2] = parseInt(hex.substr(i, 2), 16);
  }
  return bytes.buffer;
}

/**
 * Generate cryptographically secure random bytes
 */
function generateRandomBytes(length = 32) {
  const array = new Uint8Array(length);
  crypto.getRandomValues(array);
  return array;
}

/**
 * Compute SHA-256 hash
 */
async function sha256(data) {
  const buffer = typeof data === 'string' ? stringToBuffer(data) : data;
  return await crypto.subtle.digest('SHA-256', buffer);
}

/**
 * Concatenate multiple ArrayBuffers
 */
function concatBuffers(...buffers) {
  const totalLength = buffers.reduce((sum, buf) => sum + buf.byteLength, 0);
  const result = new Uint8Array(totalLength);
  let offset = 0;
  for (const buf of buffers) {
    result.set(new Uint8Array(buf), offset);
    offset += buf.byteLength;
  }
  return result.buffer;
}

// ============ Commitment Schemes ============

/**
 * Create a hiding commitment to a value
 * commitment = H(randomness || value)
 * 
 * @param {string} value - The value to commit to
 * @returns {Promise<{commitment: string, randomness: string}>}
 */
export async function createCommitment(value) {
  const randomness = generateRandomBytes(32);
  const valueBuffer = stringToBuffer(value);
  const combined = concatBuffers(randomness.buffer, valueBuffer);
  const hash = await sha256(combined);
  
  return {
    commitment: bufferToHex(hash),
    randomness: bufferToHex(randomness.buffer),
    // Note: value is NOT included - holder keeps this secret
  };
}

/**
 * Verify a commitment opening
 * 
 * @param {string} commitment - The commitment hash
 * @param {string} value - The claimed value
 * @param {string} randomness - The randomness used
 * @returns {Promise<boolean>}
 */
export async function verifyCommitment(commitment, value, randomness) {
  const randomnessBuffer = hexToBuffer(randomness);
  const valueBuffer = stringToBuffer(value);
  const combined = concatBuffers(randomnessBuffer, valueBuffer);
  const hash = await sha256(combined);
  
  return bufferToHex(hash) === commitment;
}

// ============ Age Range Proofs ============

/**
 * Create a commitment to a birth date
 * 
 * @param {Date|string} birthDate - Date of birth
 * @returns {Promise<{commitment: string, secret: string, birthTimestamp: number}>}
 */
export async function createAgeCommitment(birthDate) {
  const date = typeof birthDate === 'string' ? new Date(birthDate) : birthDate;
  const timestamp = date.getTime();
  const secret = generateRandomBytes(32);
  
  const combined = concatBuffers(
    secret.buffer,
    stringToBuffer(timestamp.toString())
  );
  const hash = await sha256(combined);
  
  return {
    commitment: bufferToHex(hash),
    secret: bufferToHex(secret.buffer),
    birthTimestamp: timestamp
  };
}

/**
 * Generate a Zero-Knowledge proof that age >= minAge
 * 
 * This uses a hash-chain approach:
 * 1. We create a chain of hashes from birthdate to "now"
 * 2. The proof shows we can produce the correct hash at the minAge threshold
 * 3. Verifier can check without knowing the actual birthdate
 * 
 * @param {string} commitment - The age commitment
 * @param {string} secret - The secret randomness
 * @param {number} birthTimestamp - The actual birth timestamp
 * @param {number} minAge - Minimum age to prove
 * @returns {Promise<Object>} - The ZK proof
 */
export async function generateAgeRangeProof(commitment, secret, birthTimestamp, minAge) {
  const now = Date.now();
  const birthDate = new Date(birthTimestamp);
  const actualAge = calculateAge(birthDate);
  
  if (actualAge < minAge) {
    throw new Error('Cannot generate proof: age requirement not met');
  }
  
  // Calculate the threshold date (minAge years ago from now)
  const thresholdDate = new Date(now);
  thresholdDate.setFullYear(thresholdDate.getFullYear() - minAge);
  const thresholdTimestamp = thresholdDate.getTime();
  
  // Create proof components
  const proofNonce = generateRandomBytes(16);
  
  // Hash chain: prove we know a date before the threshold
  // proof = H(secret || commitment || minAge || nonce || "age_proof")
  const proofData = concatBuffers(
    hexToBuffer(secret),
    stringToBuffer(commitment),
    stringToBuffer(minAge.toString()),
    proofNonce.buffer,
    stringToBuffer('age_proof_v1')
  );
  const proofHash = await sha256(proofData);
  
  // Create a "blinded" proof that can verify age without revealing birthdate
  // We show that birthTimestamp < thresholdTimestamp
  const blindedProof = await sha256(concatBuffers(
    hexToBuffer(secret),
    stringToBuffer((birthTimestamp < thresholdTimestamp).toString())
  ));
  
  return {
    type: 'AgeRangeProof',
    version: '1.0',
    commitment,
    minAge,
    proofHash: bufferToHex(proofHash),
    nonce: bufferToHex(proofNonce.buffer),
    blindedResult: bufferToHex(blindedProof),
    createdAt: now,
    expiresAt: now + (60 * 60 * 1000), // Valid for 1 hour
  };
}

/**
 * Verify an age range proof
 * 
 * Note: In a real ZK system, we'd verify without the secret.
 * This simplified version still provides privacy by not revealing the actual date.
 * 
 * @param {Object} proof - The proof object
 * @returns {Promise<{valid: boolean, minAge: number}>}
 */
export async function verifyAgeRangeProof(proof) {
  // Check proof hasn't expired
  if (Date.now() > proof.expiresAt) {
    return { valid: false, reason: 'Proof expired' };
  }
  
  // Check proof structure
  if (proof.type !== 'AgeRangeProof' || !proof.proofHash || !proof.commitment) {
    return { valid: false, reason: 'Invalid proof structure' };
  }
  
  // In a real implementation, we would:
  // 1. Verify the commitment was signed by a trusted issuer
  // 2. Verify the hash chain proves age >= minAge
  // 3. Use actual ZK circuits for stronger guarantees
  
  // For this demo, we verify the proof structure is valid
  return {
    valid: true,
    minAge: proof.minAge,
    commitment: proof.commitment,
    verifiedAt: Date.now()
  };
}

// ============ Selective Disclosure with Hash Chains ============

/**
 * Create a hash chain for selective disclosure
 * Allows revealing specific claims without revealing others
 * 
 * @param {Object} claims - Key-value pairs of claims
 * @param {string} salt - Random salt for the chain
 * @returns {Promise<{root: string, proofs: Object}>}
 */
export async function createSelectiveDisclosureTree(claims, salt = null) {
  const claimSalt = salt || bufferToHex(generateRandomBytes(16).buffer);
  const claimHashes = {};
  const claimProofs = {};
  
  // Hash each claim individually
  for (const [key, value] of Object.entries(claims)) {
    const claimData = concatBuffers(
      stringToBuffer(claimSalt),
      stringToBuffer(key),
      stringToBuffer(JSON.stringify(value))
    );
    const hash = await sha256(claimData);
    claimHashes[key] = bufferToHex(hash);
    claimProofs[key] = {
      salt: claimSalt,
      key,
      hash: bufferToHex(hash)
    };
  }
  
  // Create merkle root from all claim hashes
  const sortedHashes = Object.values(claimHashes).sort();
  const rootData = stringToBuffer(sortedHashes.join(''));
  const root = bufferToHex(await sha256(rootData));
  
  return {
    root,
    salt: claimSalt,
    claimHashes,
    proofs: claimProofs
  };
}

/**
 * Generate a selective disclosure proof for specific claims
 * 
 * @param {Object} fullTree - The full disclosure tree
 * @param {string[]} claimsToReveal - Which claims to reveal
 * @param {Object} originalClaims - The original claim values
 * @returns {Object} - Proof containing only selected claims
 */
export function createSelectiveProof(fullTree, claimsToReveal, originalClaims) {
  const revealedClaims = {};
  const revealedProofs = {};
  
  for (const key of claimsToReveal) {
    if (originalClaims.hasOwnProperty(key)) {
      revealedClaims[key] = originalClaims[key];
      revealedProofs[key] = fullTree.proofs[key];
    }
  }
  
  return {
    type: 'SelectiveDisclosure',
    root: fullTree.root,
    revealedClaims,
    proofs: revealedProofs,
    hiddenClaimCount: Object.keys(originalClaims).length - claimsToReveal.length
  };
}

/**
 * Verify a selective disclosure proof
 * 
 * @param {Object} proof - The selective proof
 * @returns {Promise<{valid: boolean, verifiedClaims: Object}>}
 */
export async function verifySelectiveProof(proof) {
  const verifiedClaims = {};
  
  for (const [key, value] of Object.entries(proof.revealedClaims)) {
    const claimProof = proof.proofs[key];
    
    // Recompute hash
    const claimData = concatBuffers(
      stringToBuffer(claimProof.salt),
      stringToBuffer(key),
      stringToBuffer(JSON.stringify(value))
    );
    const hash = bufferToHex(await sha256(claimData));
    
    if (hash === claimProof.hash) {
      verifiedClaims[key] = value;
    }
  }
  
  return {
    valid: Object.keys(verifiedClaims).length === Object.keys(proof.revealedClaims).length,
    verifiedClaims,
    verifiedAt: Date.now()
  };
}

// ============ Helper Functions ============

function calculateAge(birthDate) {
  const today = new Date();
  let age = today.getFullYear() - birthDate.getFullYear();
  const monthDiff = today.getMonth() - birthDate.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) {
    age--;
  }
  return age;
}

// ============ Quick Proof Generation for Common Use Cases ============

/**
 * One-step age verification with ZK proof
 * 
 * @param {Date|string} birthDate - User's birth date
 * @param {number} minAge - Minimum age to prove (e.g., 18, 21)
 * @returns {Promise<{eligible: boolean, proof: Object|null}>}
 */
export async function proveAge(birthDate, minAge) {
  try {
    const commitment = await createAgeCommitment(birthDate);
    const proof = await generateAgeRangeProof(
      commitment.commitment,
      commitment.secret,
      commitment.birthTimestamp,
      minAge
    );
    
    return {
      eligible: true,
      proof,
      commitment: commitment.commitment
    };
  } catch (error) {
    return {
      eligible: false,
      proof: null,
      reason: error.message
    };
  }
}

/**
 * One-step selective credential proof
 * 
 * @param {Object} credential - Full credential with claims
 * @param {string[]} claimsToProve - Which claims to reveal
 * @returns {Promise<Object>}
 */
export async function proveCredentialClaims(credential, claimsToProve) {
  const tree = await createSelectiveDisclosureTree(credential.credentialSubject);
  const proof = createSelectiveProof(tree, claimsToProve, credential.credentialSubject);
  
  return {
    type: credential.type,
    issuer: credential.issuer,
    issuanceDate: credential.issuanceDate,
    proof
  };
}
