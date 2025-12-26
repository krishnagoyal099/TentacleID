/**
 * TentacleID Background Service Worker
 * Handles cross-tab communication and permission management
 */

// Session state
let session = {
  unlocked: false,
  identity: null,
  pendingRequests: new Map()
};

// ============ Message Handling ============

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  handleMessage(message, sender).then(sendResponse);
  return true; // Will respond asynchronously
});

async function handleMessage(message, sender) {
  console.log('Background received:', message.type, message);
  
  switch (message.type) {
    case 'GET_SESSION':
      return {
        unlocked: session.unlocked,
        identity: session.identity ? {
          did: session.identity.did,
          displayName: session.identity.displayName
        } : null
      };

    case 'SESSION_UNLOCKED':
      session.unlocked = true;
      session.identity = message.identity;
      console.log('Session unlocked:', session.identity?.did);
      return { success: true };

    case 'SESSION_LOCKED':
      session.unlocked = false;
      session.identity = null;
      session.pendingRequests.clear();
      return { success: true };

    case 'GET_PENDING_REQUEST':
      const requests = Array.from(session.pendingRequests.values());
      console.log('Pending requests:', requests.length);
      return { request: requests[0] || null };

    case 'PERMISSION_RESPONSE':
      return handlePermissionResponse(message);

    case 'AUTH_REQUEST':
      return handleAuthRequest(message, sender);

    case 'CREDENTIAL_REQUEST':
      return handleCredentialRequest(message, sender);

    default:
      return { error: 'Unknown message type' };
  }
}

// ============ Authentication Requests ============

async function handleAuthRequest(message, sender) {
  const requestId = `auth_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  
  const request = {
    id: requestId,
    type: 'auth',
    domain: message.domain,
    challenge: message.challenge,
    requestedClaims: message.requestedClaims || [],
    tabId: sender.tab?.id,
    timestamp: Date.now()
  };

  session.pendingRequests.set(requestId, request);
  console.log('Created pending request:', requestId);

  // Try to open popup
  try {
    await chrome.action.openPopup();
  } catch (e) {
    console.log('Could not open popup automatically');
  }
  
  // Wait for response with timeout
  return new Promise((resolve) => {
    const timeout = setTimeout(() => {
      session.pendingRequests.delete(requestId);
      resolve({ error: 'Request timeout', approved: false });
    }, 120000); // 2 minute timeout

    // Store resolver for later
    request.resolve = (response) => {
      clearTimeout(timeout);
      session.pendingRequests.delete(requestId);
      resolve(response);
    };
  });
}

async function handleCredentialRequest(message, sender) {
  const requestId = `cred_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  
  const request = {
    id: requestId,
    type: 'credential',
    domain: message.domain,
    credentialType: message.credentialType,
    requestedClaims: message.requestedClaims || [],
    purpose: message.purpose,
    tabId: sender.tab?.id,
    timestamp: Date.now()
  };

  session.pendingRequests.set(requestId, request);
  console.log('Created credential request:', requestId);

  // Try to open popup
  try {
    await chrome.action.openPopup();
  } catch (e) {
    console.log('Could not open popup automatically');
  }

  return new Promise((resolve) => {
    const timeout = setTimeout(() => {
      session.pendingRequests.delete(requestId);
      resolve({ error: 'Request timeout', approved: false });
    }, 120000);

    request.resolve = (response) => {
      clearTimeout(timeout);
      session.pendingRequests.delete(requestId);
      resolve(response);
    };
  });
}

async function handlePermissionResponse(message) {
  console.log('Permission response received:', message);
  
  const request = session.pendingRequests.get(message.requestId);
  
  if (!request) {
    console.error('Request not found:', message.requestId);
    return { error: 'Request not found' };
  }
  
  if (!request.resolve) {
    console.error('No resolver for request:', message.requestId);
    return { error: 'Request resolver not found' };
  }

  if (!message.approved) {
    request.resolve({ approved: false });
    return { success: true };
  }

  // For simple approval without cryptographic proof (demo mode)
  try {
    request.resolve({
      approved: true,
      did: session.identity?.did || 'did:key:demo',
      claims: message.claims || [],
      grant: {
        domain: request.domain,
        claims: message.claims,
        duration: message.duration,
        grantedAt: Date.now(),
        expiresAt: Date.now() + (message.duration * 60 * 1000)
      }
    });

    // Store permission
    await storePermission({
      domain: request.domain,
      claims: message.claims,
      expiresAt: Date.now() + (message.duration * 60 * 1000),
      grantedAt: Date.now()
    });

    console.log('Permission granted successfully');
    return { success: true };
  } catch (error) {
    console.error('Error processing permission:', error);
    request.resolve({ error: error.message, approved: false });
    return { error: error.message };
  }
}

// ============ Storage Helpers ============

async function storePermission(permission) {
  try {
    const { permissions = [] } = await chrome.storage.local.get('permissions');
    
    // Clean up expired permissions
    const now = Date.now();
    const active = permissions.filter(p => p.expiresAt > now);
    
    active.push(permission);
    
    await chrome.storage.local.set({ permissions: active });
  } catch (e) {
    console.error('Error storing permission:', e);
  }
}

async function getActivePermissions(domain) {
  const { permissions = [] } = await chrome.storage.local.get('permissions');
  const now = Date.now();
  
  return permissions.filter(p => 
    p.domain === domain && p.expiresAt > now
  );
}

// ============ Tab Communication ============

// Listen for tab updates to inject content script if needed
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status === 'complete' && tab.url?.startsWith('http')) {
    // Content script is auto-injected via manifest
  }
});

// ============ Extension Icon Badge ============

function updateBadge() {
  const count = session.pendingRequests.size;
  
  if (count > 0) {
    chrome.action.setBadgeText({ text: count.toString() });
    chrome.action.setBadgeBackgroundColor({ color: '#7c3aed' });
  } else {
    chrome.action.setBadgeText({ text: '' });
  }
}

// Update badge when requests change
setInterval(updateBadge, 1000);

// ============ Cleanup ============

// Clean up expired permissions periodically
setInterval(async () => {
  try {
    const { permissions = [] } = await chrome.storage.local.get('permissions');
    const now = Date.now();
    const active = permissions.filter(p => p.expiresAt > now);
    
    if (active.length !== permissions.length) {
      await chrome.storage.local.set({ permissions: active });
    }
  } catch (e) {
    console.error('Cleanup error:', e);
  }
}, 60000); // Every minute

console.log('🐙 TentacleID Background Service Worker initialized');
