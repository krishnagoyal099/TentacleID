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
  document.getElementById('showQRBtn').addEventListener('click', showQRCode);
  document.getElementById('revokeAccessBtn').addEventListener('click', showRevokeAccess);
  
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
  
  // Passkey buttons
  document.getElementById('passkeyUnlockBtn')?.addEventListener('click', handlePasskeyUnlock);
  document.getElementById('setupPasskeyBtn')?.addEventListener('click', handlePasskeySetup);
  
  // API Guide button
  document.getElementById('apiGuideBtn')?.addEventListener('click', showAPIGuide);
  
  // Check for passkey availability on load
  checkPasskeyAvailability();
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
    
    // Count all active permissions from storage
    try {
      const { permissions = [] } = await chrome.storage.local.get('permissions');
      const now = Date.now();
      const activePermissions = permissions.filter(p => p.expiresAt > now);
      document.getElementById('permissionCount').textContent = activePermissions.length;
    } catch (e) {
      document.getElementById('permissionCount').textContent = '0';
    }
    
    // Update credentials list
    updateCredentialsList(credentials);
    
    // Update activity list
    updateActivityList();
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

// ============ Activity Tracking ============

async function updateActivityList() {
  const listEl = document.getElementById('activityList');
  const emptyEl = document.getElementById('noActivity');
  
  try {
    // Get permissions (activity) from chrome.storage
    const { permissions = [] } = await chrome.storage.local.get('permissions');
    const now = Date.now();
    
    // Sort by most recent first
    const sortedPermissions = [...permissions].sort((a, b) => b.grantedAt - a.grantedAt);
    
    if (sortedPermissions.length === 0) {
      listEl.style.display = 'none';
      emptyEl.style.display = 'flex';
      return;
    }
    
    listEl.style.display = 'block';
    emptyEl.style.display = 'none';
    
    listEl.innerHTML = sortedPermissions.map(perm => {
      const isActive = perm.expiresAt > now;
      const timeAgo = formatTimeAgo(perm.grantedAt);
      const expiresIn = isActive ? formatExpiresIn(perm.expiresAt - now) : 'Expired';
      
      return `
        <div class="activity-item ${isActive ? 'active' : 'expired'}">
          <div class="activity-icon">${isActive ? '🔓' : '⏱️'}</div>
          <div class="activity-info">
            <div class="activity-domain">${perm.domain}</div>
            <div class="activity-meta">
              <span>${timeAgo}</span>
              <span class="activity-status ${isActive ? 'active' : 'expired'}">${expiresIn}</span>
            </div>
          </div>
        </div>
      `;
    }).join('');
  } catch (error) {
    console.error('Failed to load activity:', error);
    listEl.style.display = 'none';
    emptyEl.style.display = 'flex';
  }
}

function formatTimeAgo(timestamp) {
  const seconds = Math.floor((Date.now() - timestamp) / 1000);
  
  if (seconds < 60) return 'Just now';
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  return `${Math.floor(seconds / 86400)}d ago`;
}

function formatExpiresIn(ms) {
  const minutes = Math.floor(ms / 60000);
  if (minutes < 60) return `${minutes}m left`;
  return `${Math.floor(minutes / 60)}h left`;
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

async function showQRCode() {
  if (!currentIdentity) {
    showToast('No identity to show', 'error');
    return;
  }
  
  // Create a simple text-based QR representation (for demo - real QR would use a library)
  const did = currentIdentity.did;
  const shortDid = did.substring(0, 40) + '...';
  
  // Create modal with QR placeholder and copyable DID
  const modal = document.createElement('div');
  modal.className = 'modal active';
  modal.id = 'qrModal';
  modal.innerHTML = `
    <div class="modal-backdrop"></div>
    <div class="modal-content" style="text-align: center;">
      <div class="modal-header">
        <div class="modal-icon" style="background: var(--gradient-primary);">
          <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="1.5">
            <rect width="5" height="5" x="3" y="3" rx="1"/>
            <rect width="5" height="5" x="16" y="3" rx="1"/>
            <rect width="5" height="5" x="3" y="16" rx="1"/>
            <path d="M21 16h-3a2 2 0 0 0-2 2v3"/>
            <path d="M21 21v.01"/>
          </svg>
        </div>
        <h3>Your Identity QR</h3>
        <p style="color: var(--text-secondary); font-size: 12px;">Share this with sites to connect</p>
      </div>
      <div class="modal-body" style="padding: 20px;">
        <div style="background: white; padding: 20px; border-radius: 12px; margin: 0 auto; width: fit-content;">
          <div style="width: 120px; height: 120px; background: linear-gradient(45deg, #000 25%, transparent 25%), linear-gradient(-45deg, #000 25%, transparent 25%), linear-gradient(45deg, transparent 75%, #000 75%), linear-gradient(-45deg, transparent 75%, #000 75%); background-size: 20px 20px; background-position: 0 0, 0 10px, 10px -10px, -10px 0px; border-radius: 8px; display: flex; align-items: center; justify-content: center;">
            <span style="font-size: 32px;">🐙</span>
          </div>
        </div>
        <div style="margin-top: 16px; padding: 12px; background: rgba(0,0,0,0.3); border-radius: 8px; word-break: break-all; font-size: 11px; color: var(--text-secondary);">
          ${did}
        </div>
      </div>
      <div class="modal-actions">
        <button class="btn btn-secondary">Close</button>
        <button class="btn btn-primary">Copy DID</button>
      </div>
    </div>
  `;
  
  document.body.appendChild(modal);
  
  // Event listeners
  modal.querySelector('.modal-backdrop').addEventListener('click', () => modal.remove());
  modal.querySelector('.btn-secondary').addEventListener('click', () => modal.remove());
  
  const copyBtn = modal.querySelector('.btn-primary');
  copyBtn.addEventListener('click', () => {
    navigator.clipboard.writeText(did);
    copyBtn.textContent = 'Copied!';
    setTimeout(() => copyBtn.textContent = 'Copy DID', 1500);
  });
}

async function showRevokeAccess() {
  try {
    const { permissions = [] } = await chrome.storage.local.get('permissions');
    const now = Date.now();
    const activePermissions = permissions.filter(p => p.expiresAt > now);
    
    if (activePermissions.length === 0) {
      showToast('No active permissions to revoke', 'info');
      return;
    }
    
    // Create revoke modal
    const modal = document.createElement('div');
    modal.className = 'modal active';
    modal.id = 'revokeModal';
    modal.innerHTML = `
      <div class="modal-backdrop"></div>
      <div class="modal-content">
        <div class="modal-header">
          <div class="modal-icon danger">
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
              <path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z"/>
              <path d="m14.5 9.5-5 5"/>
              <path d="m9.5 9.5 5 5"/>
            </svg>
          </div>
          <h3>Revoke Access</h3>
          <p style="color: var(--text-secondary); font-size: 12px;">Remove site permissions</p>
        </div>
        <div class="modal-body" style="max-height: 200px; overflow-y: auto;">
          ${activePermissions.map((p, i) => `
            <div class="revoke-item" style="display: flex; justify-content: space-between; align-items: center; padding: 12px; margin: 8px 0; background: rgba(255,255,255,0.03); border-radius: 8px;">
              <div>
                <div style="font-weight: 600;">${p.domain}</div>
                <div style="font-size: 11px; color: var(--text-muted);">${formatExpiresIn(p.expiresAt - now)}</div>
              </div>
              <button class="btn btn-secondary" style="padding: 6px 12px; font-size: 12px;" data-index="${i}">Revoke</button>
            </div>
          `).join('')}
        </div>
        <div class="modal-actions">
          <button class="btn btn-secondary" id="closeRevokeModal">Close</button>
          <button class="btn btn-primary" id="revokeAllBtn">Revoke All</button>
        </div>
      </div>
    `;
    
    document.body.appendChild(modal);
    modal.querySelector('.modal-backdrop').addEventListener('click', () => modal.remove());
    modal.querySelector('#closeRevokeModal').addEventListener('click', () => modal.remove());
    
    // Handle individual revoke
    modal.querySelectorAll('.revoke-item button').forEach(btn => {
      btn.addEventListener('click', async () => {
        const idx = parseInt(btn.dataset.index);
        const newPermissions = permissions.filter((_, i) => i !== idx);
        await chrome.storage.local.set({ permissions: newPermissions });
        showToast('Permission revoked', 'success');
        modal.remove();
        updateDashboard();
      });
    });
    
    // Handle revoke all
    modal.querySelector('#revokeAllBtn').addEventListener('click', async () => {
      await chrome.storage.local.set({ permissions: [] });
      showToast('All permissions revoked', 'success');
      modal.remove();
      updateDashboard();
    });
    
  } catch (error) {
    showToast('Error loading permissions', 'error');
  }
}

function showAPIGuide() {
  const modal = document.createElement('div');
  modal.className = 'modal active';
  modal.id = 'apiGuideModal';
  modal.innerHTML = `
    <div class="modal-backdrop"></div>
    <div class="modal-content" style="max-width: 400px;">
      <div class="modal-header">
        <div class="modal-icon" style="background: linear-gradient(135deg, #10b981 0%, #06b6d4 100%);">
          <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2">
            <polyline points="16,18 22,12 16,6"/>
            <polyline points="8,6 2,12 8,18"/>
          </svg>
        </div>
        <h3>TentacleID API</h3>
        <p style="color: var(--text-secondary); font-size: 12px;">Integrate identity verification in your site</p>
      </div>
      <div class="modal-body" style="max-height: 280px; overflow-y: auto; text-align: left;">
        <div style="background: rgba(0,0,0,0.4); padding: 12px; border-radius: 8px; margin-bottom: 12px;">
          <div style="font-size: 11px; color: #10b981; margin-bottom: 4px;">// Check if installed</div>
          <code style="font-size: 11px; color: #e2e8f0;">const status = await tentacleID.isInstalled();</code>
        </div>
        
        <div style="background: rgba(0,0,0,0.4); padding: 12px; border-radius: 8px; margin-bottom: 12px;">
          <div style="font-size: 11px; color: #10b981; margin-bottom: 4px;">// Authenticate user</div>
          <code style="font-size: 11px; color: #e2e8f0;">const { did, grant } = await tentacleID.authenticate();</code>
        </div>
        
        <div style="background: rgba(0,0,0,0.4); padding: 12px; border-radius: 8px; margin-bottom: 12px;">
          <div style="font-size: 11px; color: #10b981; margin-bottom: 4px;">// Verify age (18+)</div>
          <code style="font-size: 11px; color: #e2e8f0;">const { verified } = await tentacleID.verifyAge(18);</code>
        </div>
        
        <div style="background: rgba(0,0,0,0.4); padding: 12px; border-radius: 8px; margin-bottom: 12px;">
          <div style="font-size: 11px; color: #10b981; margin-bottom: 4px;">// Request email</div>
          <code style="font-size: 11px; color: #e2e8f0;">const { email } = await tentacleID.verifyEmail();</code>
        </div>
        
        <div style="background: rgba(0,0,0,0.4); padding: 12px; border-radius: 8px;">
          <div style="font-size: 11px; color: #10b981; margin-bottom: 4px;">// Get user's DID</div>
          <code style="font-size: 11px; color: #e2e8f0;">const did = await tentacleID.getDID();</code>
        </div>
      </div>
      <div class="modal-actions">
        <button class="btn btn-secondary">Close</button>
        <button class="btn btn-primary">Copy Example</button>
      </div>
    </div>
  `;
  
  document.body.appendChild(modal);
  
  // Event listeners
  modal.querySelector('.modal-backdrop').addEventListener('click', () => modal.remove());
  modal.querySelector('.btn-secondary').addEventListener('click', () => modal.remove());
  
  const copyBtn = modal.querySelector('.btn-primary');
  copyBtn.addEventListener('click', () => {
    navigator.clipboard.writeText('const { did } = await tentacleID.authenticate();');
    copyBtn.textContent = 'Copied!';
    setTimeout(() => copyBtn.textContent = 'Copy Example', 1500);
  });
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

// ============ Passkey Functions ============

async function checkPasskeyAvailability() {
  try {
    const { isPasskeySupported, hasRegisteredPasskeys } = await import('../src/core/passkeys.js');
    
    const support = await isPasskeySupported();
    const hasPasskeys = await hasRegisteredPasskeys();
    
    const passkeySection = document.getElementById('passkeySection');
    const passkeyBtn = document.getElementById('passkeyUnlockBtn');
    
    // Show passkey section if device supports it (even before setup)
    if (passkeySection && support.supported) {
      passkeySection.style.display = 'block';
      
      // Update button text based on whether passkeys are registered
      if (passkeyBtn) {
        const textSpan = passkeyBtn.querySelector('span:last-child');
        if (textSpan) {
          if (hasPasskeys) {
            textSpan.textContent = 'Unlock with Biometrics';
          } else {
            textSpan.textContent = 'Setup Biometrics First →';
            passkeyBtn.title = 'Setup passkey in wallet to enable biometric unlock';
          }
        }
      }
    }
  } catch (error) {
    console.log('Passkey check error:', error);
  }
}

async function handlePasskeyUnlock() {
  try {
    const { authenticateWithPasskey, hasRegisteredPasskeys } = await import('../src/core/passkeys.js');
    
    // Check if passkeys are registered first
    const hasPasskeys = await hasRegisteredPasskeys();
    if (!hasPasskeys) {
      showToast('Please unlock with password first, then setup passkey in the wallet', 'warning');
      return;
    }
    
    const result = await authenticateWithPasskey();
    
    if (result.success) {
      showToast('Unlocked with biometrics! 🔐', 'success');
      
      // For passkey users, we store a copy of identity in chrome.storage
      // This is retrieved after passkey auth succeeds
      const stored = await chrome.storage.local.get('passkeyIdentity');
      
      if (stored.passkeyIdentity) {
        currentIdentity = stored.passkeyIdentity;
        showScreen('dashboard');
        updateDashboard();
        
        // Notify background
        await chrome.runtime.sendMessage({
          type: 'SESSION_UNLOCKED',
          identity: { did: currentIdentity.did, displayName: currentIdentity.displayName }
        });
      } else {
        showToast('Please unlock with password first, then setup passkey again', 'warning');
      }
    } else {
      showToast(result.error || 'Passkey authentication failed', 'error');
    }
  } catch (error) {
    showToast('Passkey error: ' + error.message, 'error');
  }
}

async function handlePasskeySetup() {
  try {
    const { isPasskeySupported, setupPasskeyForDID } = await import('../src/core/passkeys.js');
    
    // Check support first
    const support = await isPasskeySupported();
    
    if (!support.supported) {
      showToast('Passkeys not supported on this device', 'warning');
      return;
    }
    
    if (!support.platformAuth) {
      showToast('No biometric authenticator found', 'warning');
      return;
    }
    
    if (!currentIdentity?.did) {
      showToast('Please unlock your wallet first', 'warning');
      return;
    }
    
    showToast('Setting up passkey...', 'info');
    
    const result = await setupPasskeyForDID(currentIdentity.did);
    
    if (result.success) {
      // Store identity for passkey unlock (so we don't need password)
      await chrome.storage.local.set({ 
        passkeyIdentity: {
          did: currentIdentity.did,
          displayName: currentIdentity.displayName,
          publicKey: currentIdentity.publicKey
        }
      });
      
      showToast('Passkey registered! 🎉 You can now unlock with biometrics.', 'success');
    } else {
      showToast(result.error || 'Passkey setup failed', 'error');
    }
  } catch (error) {
    showToast('Passkey setup error: ' + error.message, 'error');
  }
}

