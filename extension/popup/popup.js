/**
 * TentacleID Extension Popup - Main Controller
 */

import { createIdentity, shortenDID } from '../src/core/did.js';
import { 
  initializeStorage, 
  isUnlocked, 
  lockStorage, 
  hasIdentity,
  saveIdentity, 
  getIdentity,
  listCredentials,
  getPermissionsForDomain
} from '../src/core/storage.js';

// State
let currentIdentity = null;
let currentScreen = 'locked';

// DOM Elements - will be initialized after DOM ready
let elements = {};

// ============ Initialization ============

document.addEventListener('DOMContentLoaded', init);

async function init() {
  // Initialize DOM elements
  elements = {
    lockedState: document.getElementById('lockedState'),
    createState: document.getElementById('createState'),
    dashboardState: document.getElementById('dashboardState'),
    statusIndicator: document.getElementById('statusIndicator'),
    permissionModal: document.getElementById('permissionModal'),
    toastContainer: document.getElementById('toastContainer')
  };
  
  setupEventListeners();
  await checkExistingSession();
  await checkPendingRequests();
}


async function checkExistingSession() {
  // Check if there's an active session in background
  try {
    const response = await chrome.runtime.sendMessage({ type: 'GET_SESSION' });
    if (response?.unlocked && response?.identity) {
      currentIdentity = response.identity;
      showScreen('dashboard');
      updateDashboard();
    }
  } catch (error) {
    console.log('No active session');
  }
}

async function checkPendingRequests() {
  try {
    console.log('Checking for pending requests...');
    const response = await chrome.runtime.sendMessage({ type: 'GET_PENDING_REQUEST' });
    console.log('Pending request response:', response);
    if (response?.request) {
      console.log('Found pending request, showing modal:', response.request.id);
      showPermissionModal(response.request);
    } else {
      console.log('No pending requests found');
    }
  } catch (error) {
    console.error('Error checking pending requests:', error);
  }
}


// ============ Event Listeners ============

function setupEventListeners() {
  // Unlock form
  document.getElementById('unlockForm').addEventListener('submit', handleUnlock);
  document.getElementById('togglePassword').addEventListener('click', togglePasswordVisibility);
  
  // Create identity
  document.getElementById('showCreateBtn').addEventListener('click', () => showScreen('create'));
  document.getElementById('backToUnlock').addEventListener('click', () => showScreen('locked'));
  document.getElementById('createForm').addEventListener('submit', handleCreateIdentity);
  document.getElementById('newPassphrase').addEventListener('input', updateStrengthMeter);
  
  // Dashboard tabs
  document.querySelectorAll('.tab').forEach(tab => {
    tab.addEventListener('click', () => switchTab(tab.dataset.tab));
  });
  
  // Dashboard actions
  document.getElementById('copyDid').addEventListener('click', copyDID);
  document.getElementById('lockBtn').addEventListener('click', handleLock);
  document.getElementById('addCredentialBtn').addEventListener('click', openAddCredentialModal);
  document.getElementById('addFirstCredential')?.addEventListener('click', openAddCredentialModal);
  document.getElementById('scanQRBtn').addEventListener('click', () => showToast('Coming soon!', 'warning'));
  document.getElementById('shareIdentityBtn').addEventListener('click', shareIdentity);
  
  // Permission modal
  document.getElementById('approvePermission').addEventListener('click', handleApprovePermission);
  document.getElementById('denyPermission').addEventListener('click', handleDenyPermission);
  document.querySelector('#permissionModal .modal-backdrop')?.addEventListener('click', closePermissionModal);
  
  // Add Credential modal
  document.getElementById('cancelCredential').addEventListener('click', closeAddCredentialModal);
  document.getElementById('saveCredential').addEventListener('click', handleSaveCredential);
  document.querySelector('#addCredentialModal .modal-backdrop')?.addEventListener('click', closeAddCredentialModal);
  
  // Credential type buttons
  document.querySelectorAll('.credential-type-btn').forEach(btn => {
    btn.addEventListener('click', () => switchCredentialType(btn.dataset.type));
  });
}


// ============ Screen Management ============

function showScreen(screen) {
  currentScreen = screen;
  
  elements.lockedState.classList.remove('active');
  elements.createState.classList.remove('active');
  elements.dashboardState.classList.remove('active');
  
  switch (screen) {
    case 'locked':
      elements.lockedState.classList.add('active');
      elements.statusIndicator.classList.remove('unlocked');
      elements.statusIndicator.querySelector('.status-text').textContent = 'Locked';
      break;
    case 'create':
      elements.createState.classList.add('active');
      break;
    case 'dashboard':
      elements.dashboardState.classList.add('active');
      elements.statusIndicator.classList.add('unlocked');
      elements.statusIndicator.querySelector('.status-text').textContent = 'Active';
      break;
  }
}

function switchTab(tabName) {
  document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
  document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
  
  document.querySelector(`[data-tab="${tabName}"]`).classList.add('active');
  document.getElementById(`${tabName}Tab`).classList.add('active');
}

// ============ Authentication ============

async function handleUnlock(e) {
  e.preventDefault();
  
  const passphrase = document.getElementById('passphrase').value;
  const btn = e.target.querySelector('button[type="submit"]');
  
  btn.disabled = true;
  btn.innerHTML = '<span>Unlocking...</span>';
  
  try {
    await initializeStorage(passphrase);
    
    const hasExistingIdentity = await hasIdentity();
    if (!hasExistingIdentity) {
      showScreen('create');
      showToast('No identity found. Create one!', 'warning');
      return;
    }
    
    currentIdentity = await getIdentity();
    
    // Notify background script
    await chrome.runtime.sendMessage({
      type: 'SESSION_UNLOCKED',
      identity: currentIdentity
    });
    
    showScreen('dashboard');
    updateDashboard();
    showToast('Welcome back! 🐙', 'success');
    
  } catch (error) {
    showToast('Invalid passphrase', 'error');
  } finally {
    btn.disabled = false;
    btn.innerHTML = '<span>Unlock</span><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M5 12h14M12 5l7 7-7 7"/></svg>';
  }
}

async function handleCreateIdentity(e) {
  e.preventDefault();
  
  const displayName = document.getElementById('displayName').value || 'Anonymous';
  const passphrase = document.getElementById('newPassphrase').value;
  const confirmPassphrase = document.getElementById('confirmPassphrase').value;
  
  if (passphrase !== confirmPassphrase) {
    showToast('Passphrases do not match', 'error');
    return;
  }
  
  if (passphrase.length < 8) {
    showToast('Passphrase must be at least 8 characters', 'error');
    return;
  }
  
  const btn = e.target.querySelector('button[type="submit"]');
  btn.disabled = true;
  btn.innerHTML = '<span>Generating...</span><div class="sparkles">⚡</div>';
  
  try {
    await initializeStorage(passphrase);
    
    // Generate new identity
    const identity = await createIdentity();
    identity.displayName = displayName;
    identity.createdAt = new Date().toISOString();
    
    await saveIdentity(identity);
    currentIdentity = identity;
    
    // Notify background script
    await chrome.runtime.sendMessage({
      type: 'SESSION_UNLOCKED',
      identity: currentIdentity
    });
    
    showScreen('dashboard');
    updateDashboard();
    showToast('Identity created! 🎉', 'success');
    
  } catch (error) {
    showToast('Failed to create identity: ' + error.message, 'error');
  } finally {
    btn.disabled = false;
    btn.innerHTML = '<span>Generate Identity</span><div class="sparkles">✨</div>';
  }
}

function handleLock() {
  lockStorage();
  currentIdentity = null;
  
  chrome.runtime.sendMessage({ type: 'SESSION_LOCKED' });
  
  document.getElementById('passphrase').value = '';
  showScreen('locked');
  showToast('Wallet locked', 'success');
}

// ============ Dashboard ============

async function updateDashboard() {
  if (!currentIdentity) return;
  
  // Update identity card
  document.getElementById('displayNameText').textContent = currentIdentity.displayName || 'Anonymous';
  document.getElementById('didText').textContent = shortenDID(currentIdentity.did);
  
  // Generate avatar (using first character and DID for color)
  const avatarEl = document.getElementById('identityAvatar');
  const initial = (currentIdentity.displayName || 'A')[0].toUpperCase();
  avatarEl.textContent = initial;
  
  // Update stats
  try {
    const credentials = await listCredentials();
    document.getElementById('credentialCount').textContent = credentials.length;
    
    // Count active permissions (this would need domain context in real app)
    document.getElementById('permissionCount').textContent = '0';
    
    // Update credentials list
    updateCredentialsList(credentials);
  } catch (error) {
    console.error('Failed to load credentials:', error);
  }
}

function updateCredentialsList(credentials) {
  const listEl = document.getElementById('credentialsList');
  const emptyEl = document.getElementById('noCredentials');
  
  if (credentials.length === 0) {
    listEl.style.display = 'none';
    emptyEl.style.display = 'flex';
    return;
  }
  
  listEl.style.display = 'block';
  emptyEl.style.display = 'none';
  
  listEl.innerHTML = credentials.map(cred => `
    <div class="credential-item" data-id="${cred.id}">
      <div class="credential-icon">${getCredentialIcon(cred.type)}</div>
      <div class="credential-info">
        <div class="credential-type">${formatCredentialType(cred.type)}</div>
        <div class="credential-issuer">Issued by ${cred.issuer}</div>
      </div>
      <div class="credential-arrow">→</div>
    </div>
  `).join('');
}

function getCredentialIcon(type) {
  const icons = {
    'EmailCredential': '📧',
    'AgeCredential': '🎂',
    'IdentityCredential': '🪪',
    'MembershipCredential': '🎫',
    'default': '📜'
  };
  return icons[type] || icons.default;
}

function formatCredentialType(type) {
  return type.replace('Credential', ' Credential').replace(/([A-Z])/g, ' $1').trim();
}

// ============ Permission Handling ============

let pendingRequest = null;

function showPermissionModal(request) {
  console.log('showPermissionModal called with:', request);
  pendingRequest = request;
  
  document.getElementById('requestDomain').textContent = request.domain || 'Unknown';
  
  const claimsList = document.getElementById('requestedClaims');
  if (request.requestedClaims && request.requestedClaims.length > 0) {
    claimsList.innerHTML = request.requestedClaims.map(claim => `
      <div class="claim-item">
        <input type="checkbox" class="claim-checkbox" value="${claim}" checked>
        <span class="claim-label">${formatClaimName(claim)}</span>
      </div>
    `).join('');
  } else {
    claimsList.innerHTML = '<p style="color: var(--text-secondary); font-size: 13px;">Basic authentication only</p>';
  }
  

  elements.permissionModal.classList.add('active');
}

function closePermissionModal() {
  elements.permissionModal.classList.remove('active');
  pendingRequest = null;
}

async function handleApprovePermission() {
  console.log('handleApprovePermission called, pendingRequest:', pendingRequest);
  
  if (!pendingRequest) {
    console.error('No pending request to approve');
    showToast('No pending request found', 'error');
    return;
  }
  
  const selectedClaims = Array.from(
    document.querySelectorAll('#requestedClaims .claim-checkbox:checked')
  ).map(cb => cb.value);
  
  const duration = parseInt(document.getElementById('durationSelect').value);
  
  console.log('Sending PERMISSION_RESPONSE:', {
    type: 'PERMISSION_RESPONSE',
    approved: true,
    requestId: pendingRequest.id,
    claims: selectedClaims,
    duration
  });
  
  try {
    const response = await chrome.runtime.sendMessage({
      type: 'PERMISSION_RESPONSE',
      approved: true,
      requestId: pendingRequest.id,
      claims: selectedClaims,
      duration
    });
    
    console.log('PERMISSION_RESPONSE result:', response);
    
    closePermissionModal();
    showToast('Permission granted for ' + duration + ' minutes', 'success');
  } catch (error) {
    console.error('Error sending permission response:', error);
    showToast('Error: ' + error.message, 'error');
  }
}

async function handleDenyPermission() {
  if (!pendingRequest) {
    showToast('No pending request to deny', 'error');
    return;
  }
  
  try {
    await chrome.runtime.sendMessage({
      type: 'PERMISSION_RESPONSE',
      approved: false,
      requestId: pendingRequest.id
    });
    
    closePermissionModal();
    showToast('Permission denied', 'warning');
  } catch (error) {
    console.error('Error denying permission:', error);
    showToast('Error: ' + error.message, 'error');
  }
}


function formatClaimName(claim) {
  const names = {
    'email': 'Email Address',
    'name': 'Full Name',
    'birthDate': 'Date of Birth',
    'isOver18': 'Age Verification (18+)',
    'isOver21': 'Age Verification (21+)',
    'address': 'Physical Address',
    'phone': 'Phone Number'
  };
  return names[claim] || claim;
}

// ============ Utilities ============

function togglePasswordVisibility() {
  const input = document.getElementById('passphrase');
  input.type = input.type === 'password' ? 'text' : 'password';
}

function updateStrengthMeter() {
  const passphrase = document.getElementById('newPassphrase').value;
  const strengthBar = document.getElementById('strengthBar');
  const strengthText = document.getElementById('strengthText');
  
  const strength = calculateStrength(passphrase);
  
  strengthBar.className = 'strength-bar ' + strength.class;
  strengthText.textContent = strength.text;
}

function calculateStrength(password) {
  let score = 0;
  
  if (password.length >= 8) score++;
  if (password.length >= 12) score++;
  if (/[a-z]/.test(password) && /[A-Z]/.test(password)) score++;
  if (/\d/.test(password)) score++;
  if (/[^a-zA-Z0-9]/.test(password)) score++;
  
  if (score <= 1) return { class: 'weak', text: 'Weak passphrase' };
  if (score <= 2) return { class: 'fair', text: 'Fair passphrase' };
  if (score <= 3) return { class: 'good', text: 'Good passphrase' };
  return { class: 'strong', text: 'Strong passphrase 💪' };
}

async function copyDID() {
  if (!currentIdentity) return;
  
  try {
    await navigator.clipboard.writeText(currentIdentity.did);
    showToast('DID copied to clipboard', 'success');
  } catch (error) {
    showToast('Failed to copy', 'error');
  }
}

async function shareIdentity() {
  if (!currentIdentity) return;
  
  const shareData = {
    did: currentIdentity.did,
    displayName: currentIdentity.displayName
  };
  
  try {
    await navigator.clipboard.writeText(JSON.stringify(shareData, null, 2));
    showToast('Identity info copied!', 'success');
  } catch (error) {
    showToast('Failed to copy', 'error');
  }
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
    toast.style.animation = 'fadeIn 0.3s ease reverse';
    setTimeout(() => toast.remove(), 300);
  }, 3000);
}

// Listen for messages from background
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'SHOW_PERMISSION_REQUEST') {
    showPermissionModal(message.request);
  }
});

// ============ Add Credential Modal ============

let selectedCredentialType = 'EmailCredential';

function openAddCredentialModal() {
  document.getElementById('addCredentialModal').classList.add('active');
  switchCredentialType('EmailCredential');
}

function closeAddCredentialModal() {
  document.getElementById('addCredentialModal').classList.remove('active');
  // Clear form
  document.getElementById('credEmail').value = '';
  document.getElementById('credBirthDate').value = '';
  document.getElementById('credFullName').value = '';
  document.getElementById('credCountry').value = '';
}

function switchCredentialType(type) {
  selectedCredentialType = type;
  
  // Update buttons
  document.querySelectorAll('.credential-type-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.type === type);
  });
  
  // Show/hide fields
  document.getElementById('emailFields').classList.toggle('hidden', type !== 'EmailCredential');
  document.getElementById('ageFields').classList.toggle('hidden', type !== 'AgeCredential');
  document.getElementById('identityFields').classList.toggle('hidden', type !== 'IdentityCredential');
}

async function handleSaveCredential() {
  const { saveCredential } = await import('../src/core/storage.js');
  
  let credential;
  const now = new Date().toISOString();
  
  switch (selectedCredentialType) {
    case 'EmailCredential':
      const email = document.getElementById('credEmail').value;
      if (!email) {
        showToast('Please enter an email address', 'error');
        return;
      }
      credential = {
        type: 'EmailCredential',
        issuer: 'self',
        issuanceDate: now,
        credentialSubject: {
          email: email,
          hasVerifiedEmail: true
        }
      };
      break;
      
    case 'AgeCredential':
      const birthDate = document.getElementById('credBirthDate').value;
      if (!birthDate) {
        showToast('Please enter your date of birth', 'error');
        return;
      }
      const age = calculateAge(new Date(birthDate));
      credential = {
        type: 'AgeCredential',
        issuer: 'self',
        issuanceDate: now,
        credentialSubject: {
          birthDate: birthDate,
          age: age,
          isOver18: age >= 18,
          isOver21: age >= 21
        }
      };
      break;
      
    case 'IdentityCredential':
      const fullName = document.getElementById('credFullName').value;
      const country = document.getElementById('credCountry').value;
      if (!fullName) {
        showToast('Please enter your full name', 'error');
        return;
      }
      credential = {
        type: 'IdentityCredential',
        issuer: 'self',
        issuanceDate: now,
        credentialSubject: {
          name: fullName,
          country: country || 'Unknown'
        }
      };
      break;
  }
  
  try {
    await saveCredential(credential);
    closeAddCredentialModal();
    showToast('Credential added! 🎉', 'success');
    updateDashboard();
  } catch (error) {
    showToast('Failed to save credential: ' + error.message, 'error');
  }
}

function calculateAge(birthDate) {
  const today = new Date();
  let age = today.getFullYear() - birthDate.getFullYear();
  const monthDiff = today.getMonth() - birthDate.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) {
    age--;
  }
  return age;
}
