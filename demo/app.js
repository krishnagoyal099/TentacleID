/**
 * TentacleID Demo Website - Application Logic
 */

// State
let isConnected = false;
let userDid = null;
let emailTimer = null;

// DOM Elements
const elements = {
  navStatus: document.getElementById('navStatus'),
  extensionStatus: document.getElementById('extensionStatus'),
  loginContainer: document.getElementById('loginContainer'),
  dashboard: document.getElementById('dashboard'),
  userDid: document.getElementById('userDid'),
  userAvatar: document.getElementById('userAvatar'),
  verifyAgeBtn: document.getElementById('verifyAgeBtn'),
  verifyEmailBtn: document.getElementById('verifyEmailBtn'),
  fullLoginBtn: document.getElementById('fullLoginBtn'),
  ageResult: document.getElementById('ageResult'),
  emailResult: document.getElementById('emailResult'),
  loginResult: document.getElementById('loginResult'),
  loginDid: document.getElementById('loginDid'),
  emailTimer: document.getElementById('emailTimer'),
  toastContainer: document.getElementById('toastContainer'),
  codeModal: document.getElementById('codeModal')
};

// ============ Initialization ============

document.addEventListener('DOMContentLoaded', init);

async function init() {
  await checkExtension();
  setupEventListeners();
}

async function checkExtension() {
  // Wait a bit for extension to inject
  await new Promise(resolve => setTimeout(resolve, 500));

  if (typeof window.tentacleID === 'undefined') {
    elements.extensionStatus.textContent = '⚠️ TentacleID extension not found. Install it to try the demo!';
    elements.extensionStatus.classList.add('error');
    createFallbackButton();
    return;
  }

  try {
    const { installed, version } = await window.tentacleID.isInstalled();
    
    if (installed) {
      elements.extensionStatus.textContent = `✓ TentacleID v${version} detected`;
      elements.extensionStatus.classList.add('success');
      enableDemoButtons();
      createLoginButton();
    } else {
      elements.extensionStatus.textContent = '⚠️ TentacleID not responding';
      elements.extensionStatus.classList.add('error');
    }
  } catch (error) {
    elements.extensionStatus.textContent = '⚠️ Extension check failed';
    elements.extensionStatus.classList.add('error');
  }
}

function createLoginButton() {
  window.tentacleID.createLoginButton('#loginContainer', {
    text: 'Login with TentacleID',
    requestedClaims: [],
    onSuccess: handleLoginSuccess,
    onError: handleLoginError
  });
}

function createFallbackButton() {
  const btn = document.createElement('button');
  btn.className = 'btn btn-glow';
  btn.innerHTML = '<span class="btn-icon">🐙</span><span>Get TentacleID Extension</span>';
  btn.addEventListener('click', () => {
    showToast('Extension would be installed from Chrome Web Store', 'info');
  });
  elements.loginContainer.appendChild(btn);
}

function enableDemoButtons() {
  elements.verifyAgeBtn.disabled = false;
  elements.verifyEmailBtn.disabled = false;
  elements.fullLoginBtn.disabled = false;
}

// ============ Event Listeners ============

function setupEventListeners() {
  // Demo buttons
  elements.verifyAgeBtn?.addEventListener('click', handleAgeVerification);
  elements.verifyEmailBtn?.addEventListener('click', handleEmailVerification);
  elements.fullLoginBtn?.addEventListener('click', handleFullLogin);
  
  // Disconnect
  document.getElementById('disconnectBtn')?.addEventListener('click', handleDisconnect);
  
  // Code modal
  document.getElementById('showCodeBtn')?.addEventListener('click', () => {
    elements.codeModal.classList.add('active');
  });
  
  document.getElementById('closeCodeModal')?.addEventListener('click', () => {
    elements.codeModal.classList.remove('active');
  });
  
  document.querySelector('.modal-backdrop')?.addEventListener('click', () => {
    elements.codeModal.classList.remove('active');
  });
}

// ============ Authentication Handlers ============

function handleLoginSuccess(result) {
  isConnected = true;
  userDid = result.did;
  
  updateConnectionStatus(true, result.did);
  showToast('Successfully connected with TentacleID! 🐙', 'success');
}

function handleLoginError(error) {
  showToast('Connection failed: ' + error.message, 'error');
}

async function handleFullLogin() {
  if (!window.tentacleID) {
    showToast('TentacleID extension not found', 'error');
    return;
  }

  elements.fullLoginBtn.disabled = true;
  elements.fullLoginBtn.innerHTML = '<span class="btn-icon">⏳</span><span>Connecting...</span>';

  try {
    const result = await window.tentacleID.authenticate({
      requestedClaims: []
    });

    isConnected = true;
    userDid = result.did;
    
    elements.loginResult.classList.remove('hidden');
    elements.loginDid.textContent = shortenDID(result.did);
    elements.fullLoginBtn.innerHTML = '<span class="btn-icon">✓</span><span>Connected</span>';
    
    updateConnectionStatus(true, result.did);
    showToast('Successfully authenticated! 🎉', 'success');
    
  } catch (error) {
    elements.fullLoginBtn.innerHTML = '<span class="btn-icon">🐙</span><span>Login with TentacleID</span>';
    elements.fullLoginBtn.disabled = false;
    showToast('Authentication cancelled', 'warning');
  }
}

function handleDisconnect() {
  isConnected = false;
  userDid = null;
  
  updateConnectionStatus(false);
  resetDemoStates();
  showToast('Disconnected', 'info');
}

// ============ Verification Handlers ============

async function handleAgeVerification() {
  if (!window.tentacleID) {
    showToast('TentacleID extension not found', 'error');
    return;
  }

  elements.verifyAgeBtn.disabled = true;
  elements.verifyAgeBtn.innerHTML = '<span>Verifying...</span>';

  try {
    const result = await window.tentacleID.verifyAge(18, 'Age-restricted content access');
    
    elements.ageResult.classList.remove('hidden');
    elements.verifyAgeBtn.innerHTML = '<span>Verified ✓</span>';
    
    if (!isConnected) {
      updateConnectionStatus(true, result.did);
    }
    
    showToast('Age verified! Over 18 confirmed without revealing birthdate 🔒', 'success');
    
  } catch (error) {
    elements.verifyAgeBtn.innerHTML = '<span>Verify Age</span>';
    elements.verifyAgeBtn.disabled = false;
    showToast('Verification cancelled', 'warning');
  }
}

async function handleEmailVerification() {
  if (!window.tentacleID) {
    showToast('TentacleID extension not found', 'error');
    return;
  }

  elements.verifyEmailBtn.disabled = true;
  elements.verifyEmailBtn.innerHTML = '<span>Sharing...</span>';

  try {
    const result = await window.tentacleID.verifyEmail('Newsletter signup (temporary access)');
    
    elements.emailResult.classList.remove('hidden');
    document.getElementById('emailValue').textContent = result.hasVerifiedEmail ? 'Email verified ✓' : 'Email shared';
    
    // Start countdown timer (5 minutes)
    startEmailTimer(5 * 60);
    
    elements.verifyEmailBtn.innerHTML = '<span>Shared ✓</span>';
    
    if (!isConnected) {
      updateConnectionStatus(true, result.did);
    }
    
    showToast('Email access granted for 5 minutes! ⏱️', 'success');
    
  } catch (error) {
    elements.verifyEmailBtn.innerHTML = '<span>Share Email (5 min)</span>';
    elements.verifyEmailBtn.disabled = false;
    showToast('Sharing cancelled', 'warning');
  }
}

function startEmailTimer(seconds) {
  if (emailTimer) clearInterval(emailTimer);
  
  let remaining = seconds;
  
  const updateTimer = () => {
    const mins = Math.floor(remaining / 60);
    const secs = remaining % 60;
    elements.emailTimer.textContent = `Access expires in ${mins}:${secs.toString().padStart(2, '0')}`;
    
    if (remaining <= 0) {
      clearInterval(emailTimer);
      elements.emailResult.innerHTML = `
        <div class="result-icon" style="background: var(--warning);">⏱</div>
        <div class="result-text">
          <strong>Access Expired</strong>
          <span>Email permission has been revoked</span>
        </div>
      `;
      elements.verifyEmailBtn.innerHTML = '<span>Share Email (5 min)</span>';
      elements.verifyEmailBtn.disabled = false;
      showToast('Email access has expired and been revoked', 'info');
    }
    
    remaining--;
  };
  
  updateTimer();
  emailTimer = setInterval(updateTimer, 1000);
}

// ============ UI Updates ============

function updateConnectionStatus(connected, did = null) {
  isConnected = connected;
  userDid = did;
  
  if (connected && did) {
    elements.navStatus.classList.add('connected');
    elements.navStatus.innerHTML = `
      <span class="status-dot"></span>
      <span>${shortenDID(did)}</span>
    `;
    
    elements.dashboard.classList.remove('hidden');
    elements.userDid.textContent = shortenDID(did);
    elements.userAvatar.textContent = '🐙';
  } else {
    elements.navStatus.classList.remove('connected');
    elements.navStatus.innerHTML = `
      <span class="status-dot"></span>
      <span>Not Connected</span>
    `;
    
    elements.dashboard.classList.add('hidden');
  }
}

function resetDemoStates() {
  elements.ageResult?.classList.add('hidden');
  elements.emailResult?.classList.add('hidden');
  elements.loginResult?.classList.add('hidden');
  
  elements.verifyAgeBtn.innerHTML = '<span>Verify Age</span>';
  elements.verifyAgeBtn.disabled = !window.tentacleID;
  
  elements.verifyEmailBtn.innerHTML = '<span>Share Email (5 min)</span>';
  elements.verifyEmailBtn.disabled = !window.tentacleID;
  
  elements.fullLoginBtn.innerHTML = '<span class="btn-icon">🐙</span><span>Login with TentacleID</span>';
  elements.fullLoginBtn.disabled = !window.tentacleID;
  
  if (emailTimer) {
    clearInterval(emailTimer);
    emailTimer = null;
  }
}

// ============ Utilities ============

function shortenDID(did) {
  if (!did || did.length < 30) return did;
  const parts = did.split(':');
  if (parts.length < 3) return did;
  const key = parts[2];
  return `did:key:${key.substring(0, 8)}...${key.substring(key.length - 6)}`;
}

function showToast(message, type = 'info') {
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.innerHTML = `
    ${type === 'success' ? '✓' : type === 'error' ? '✗' : type === 'warning' ? '⚠' : 'ℹ'}
    <span>${message}</span>
  `;
  
  elements.toastContainer.appendChild(toast);
  
  setTimeout(() => {
    toast.style.animation = 'slideInRight 0.3s ease reverse';
    setTimeout(() => toast.remove(), 300);
  }, 4000);
}

// Listen for TentacleID ready event
window.addEventListener('tentacleid:ready', (event) => {
  console.log('🐙 TentacleID ready:', event.detail);
  elements.extensionStatus.textContent = '✓ TentacleID ready';
  elements.extensionStatus.classList.add('success');
  enableDemoButtons();
});
