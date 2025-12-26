/**
 * The Velvet Lounge - Age Verification Demo
 * Demonstrates selective disclosure for 21+ verification
 */

document.addEventListener('DOMContentLoaded', init);

async function init() {
  await checkExtension();
  setupEventListeners();
}

async function checkExtension() {
  const statusEl = document.getElementById('extensionStatus');
  const verifyBtn = document.getElementById('verifyBtn');
  
  // Wait for extension to inject
  await new Promise(resolve => setTimeout(resolve, 500));
  
  if (typeof window.tentacleID === 'undefined') {
    statusEl.textContent = '⚠️ TentacleID extension required';
    statusEl.classList.add('error');
    verifyBtn.disabled = true;
    return;
  }
  
  try {
    const { installed, version } = await window.tentacleID.isInstalled();
    
    if (installed) {
      statusEl.textContent = `✓ TentacleID v${version} ready`;
      statusEl.classList.add('success');
      verifyBtn.disabled = false;
    } else {
      statusEl.textContent = '⚠️ TentacleID not responding';
      statusEl.classList.add('error');
      verifyBtn.disabled = true;
    }
  } catch (error) {
    statusEl.textContent = '⚠️ Extension check failed';
    statusEl.classList.add('error');
    verifyBtn.disabled = true;
  }
}

function setupEventListeners() {
  document.getElementById('verifyBtn').addEventListener('click', handleVerification);
  document.getElementById('retryBtn').addEventListener('click', handleRetry);
}

async function handleVerification() {
  const verifyBtn = document.getElementById('verifyBtn');
  
  verifyBtn.disabled = true;
  verifyBtn.innerHTML = '<span class="btn-icon">⏳</span><span>Verifying...</span>';
  
  try {
    // Request age verification - prove 21+ without revealing birthdate
    const result = await window.tentacleID.verifyAge(21, 'Bar entrance - 21+ verification');
    
    if (result.verified) {
      showAccessGranted(result.did);
    } else {
      showAccessDenied();
    }
  } catch (error) {
    // User cancelled or error
    verifyBtn.disabled = false;
    verifyBtn.innerHTML = '<span class="btn-icon">🐙</span><span>Verify with TentacleID</span>';
    
    if (error.message.includes('denied')) {
      showAccessDenied();
    } else {
      console.log('Verification cancelled:', error.message);
    }
  }
}

function showAccessGranted(did) {
  document.getElementById('ageGate').classList.add('hidden');
  document.getElementById('accessDenied').classList.add('hidden');
  document.getElementById('accessGranted').classList.remove('hidden');
  
  // Shorten DID for display
  const shortDid = did.length > 30 
    ? `${did.substring(0, 20)}...${did.substring(did.length - 8)}`
    : did;
  document.getElementById('userDid').textContent = shortDid;
}

function showAccessDenied() {
  document.getElementById('ageGate').classList.add('hidden');
  document.getElementById('accessGranted').classList.add('hidden');
  document.getElementById('accessDenied').classList.remove('hidden');
}

function handleRetry() {
  document.getElementById('accessDenied').classList.add('hidden');
  document.getElementById('accessGranted').classList.add('hidden');
  document.getElementById('ageGate').classList.remove('hidden');
  
  // Reset button
  const verifyBtn = document.getElementById('verifyBtn');
  verifyBtn.disabled = false;
  verifyBtn.innerHTML = '<span class="btn-icon">🐙</span><span>Verify with TentacleID</span>';
}

// Listen for TentacleID ready event
window.addEventListener('tentacleid:ready', () => {
  const statusEl = document.getElementById('extensionStatus');
  statusEl.textContent = '✓ TentacleID ready';
  statusEl.classList.add('success');
  document.getElementById('verifyBtn').disabled = false;
});
