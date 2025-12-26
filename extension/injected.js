/**
 * TentacleID Injected Script (Page-Level API)
 * Provides window.tentacleID API for websites to interact with
 */

(function() {
  'use strict';

  let messageCounter = 0;
  const pendingRequests = new Map();
  let isReady = false;
  
  // Listen for READY signal from content script
  window.addEventListener('message', (event) => {
    if (event.data?.source === 'tentacleid-extension' && event.data?.type === 'READY') {
      isReady = true;
      console.log('🐙 TentacleID extension ready');
    }
  });

  // Listen for responses from content script
  window.addEventListener('message', (event) => {
    if (event.source !== window) return;
    if (event.data?.source !== 'tentacleid-extension') return;
    if (!event.data.messageId) return;

    const pending = pendingRequests.get(event.data.messageId);
    if (pending) {
      pendingRequests.delete(event.data.messageId);
      if (event.data.response?.error) {
        pending.reject(new Error(event.data.response.error));
      } else {
        pending.resolve(event.data.response);
      }
    }
  });

  function sendMessage(type, payload, timeout = 5000) {
    return new Promise((resolve, reject) => {
      const messageId = `msg_${++messageCounter}_${Date.now()}`;
      
      pendingRequests.set(messageId, { resolve, reject });
      
      window.postMessage({
        source: 'tentacleid-page',
        type,
        payload,
        messageId
      }, '*');

      // Timeout
      setTimeout(() => {
        if (pendingRequests.has(messageId)) {
          pendingRequests.delete(messageId);
          reject(new Error('Request timeout'));
        }
      }, timeout);
    });
  }

  // ============ Public API ============

  const TentacleID = {
    /**
     * Check if TentacleID extension is installed
     * @returns {Promise<{installed: boolean, version?: string}>}
     */
    async isInstalled() {
      // Give a brief moment for content script to load
      await new Promise(resolve => setTimeout(resolve, 100));
      
      try {
        // Try to communicate with content script with short timeout
        const response = await sendMessage('CHECK_INSTALLED', {}, 2000);
        return response;
      } catch (error) {
        // If timeout or error, extension is not responding
        return { installed: false };
      }
    },

    /**

     * Request authentication from the user
     * @param {Object} options
     * @param {string} options.challenge - Random challenge nonce
     * @param {string[]} options.requestedClaims - Claims to request (e.g., ['email', 'isOver18'])
     * @returns {Promise<{did: string, proof: Object, grant: Object}>}
     */
    async authenticate(options = {}) {
      if (!options.challenge) {
        options.challenge = generateChallenge();
      }

      // Use long timeout for user interaction (2 minutes)
      const response = await sendMessage('AUTHENTICATE', {
        challenge: options.challenge,
        requestedClaims: options.requestedClaims || []
      }, 120000);

      if (!response.approved) {
        throw new Error('Authentication denied by user');
      }

      return {
        did: response.did,
        proof: response.proof,
        grant: response.grant
      };
    },

    /**
     * Request specific credentials/claims from the user
     * @param {Object} options
     * @param {string} options.credentialType - Type of credential requested
     * @param {string[]} options.requestedClaims - Specific claims needed
     * @param {string} options.purpose - Why the claims are needed
     * @returns {Promise<{did: string, claims: Object, grant: Object}>}
     */
    async requestCredential(options = {}) {
      // Use long timeout for user interaction (2 minutes)
      const response = await sendMessage('REQUEST_CREDENTIAL', {
        credentialType: options.credentialType || 'VerifiableCredential',
        requestedClaims: options.requestedClaims || [],
        purpose: options.purpose || 'Verification'
      }, 120000);

      if (!response.approved) {
        throw new Error('Credential request denied by user');
      }

      return {
        did: response.did,
        claims: response.claims,
        grant: response.grant
      };
    },


    /**
     * Get the user's DID (if wallet is unlocked)
     * @returns {Promise<string>}
     */
    async getDID() {
      await readyPromise;
      const response = await sendMessage('GET_DID', {});
      return response.did;
    },

    /**
     * Verify if user is over a certain age
     * @param {number} age - Minimum age required
     * @param {string} purpose - Reason for verification
     * @returns {Promise<{verified: boolean, did: string}>}
     */
    async verifyAge(age, purpose = 'Age verification') {
      const claim = age === 18 ? 'isOver18' : age === 21 ? 'isOver21' : `isOver${age}`;
      
      const result = await this.requestCredential({
        credentialType: 'AgeCredential',
        requestedClaims: [claim],
        purpose
      });

      return {
        verified: result.claims.includes(claim),
        did: result.did
      };
    },

    /**
     * Request email verification
     * @param {string} purpose - Reason for needing email
     * @returns {Promise<{email?: string, hasVerifiedEmail: boolean, did: string}>}
     */
    async verifyEmail(purpose = 'Email verification') {
      const result = await this.requestCredential({
        credentialType: 'EmailCredential',
        requestedClaims: ['email', 'hasVerifiedEmail'],
        purpose
      });

      return {
        email: result.claims.includes('email') ? result.grant?.email : undefined,
        hasVerifiedEmail: result.claims.includes('hasVerifiedEmail'),
        did: result.did
      };
    },

    /**
     * Create a TentacleID login button
     * @param {HTMLElement|string} container - Container element or selector
     * @param {Object} options - Button options
     * @returns {HTMLButtonElement}
     */
    createLoginButton(container, options = {}) {
      const containerEl = typeof container === 'string' 
        ? document.querySelector(container) 
        : container;

      if (!containerEl) {
        throw new Error('Container not found');
      }

      const button = document.createElement('button');
      button.className = 'tentacleid-login-btn';
      button.innerHTML = `
        <span class="tentacleid-icon">🐙</span>
        <span class="tentacleid-text">${options.text || 'Login with TentacleID'}</span>
      `;

      // Apply default styles
      const style = document.createElement('style');
      style.textContent = `
        .tentacleid-login-btn {
          display: inline-flex;
          align-items: center;
          gap: 10px;
          padding: 12px 24px;
          background: linear-gradient(135deg, #7c3aed 0%, #06b6d4 100%);
          border: none;
          border-radius: 12px;
          color: white;
          font-size: 16px;
          font-weight: 600;
          cursor: pointer;
          transition: all 0.2s ease;
          box-shadow: 0 4px 15px rgba(124, 58, 237, 0.3);
        }
        .tentacleid-login-btn:hover {
          transform: translateY(-2px);
          box-shadow: 0 6px 20px rgba(124, 58, 237, 0.4);
        }
        .tentacleid-login-btn:active {
          transform: translateY(0);
        }
        .tentacleid-login-btn:disabled {
          opacity: 0.6;
          cursor: not-allowed;
        }
        .tentacleid-icon {
          font-size: 20px;
        }
        .tentacleid-login-btn.loading .tentacleid-text {
          opacity: 0.7;
        }
      `;
      
      if (!document.querySelector('#tentacleid-styles')) {
        style.id = 'tentacleid-styles';
        document.head.appendChild(style);
      }

      button.addEventListener('click', async () => {
        button.disabled = true;
        button.classList.add('loading');
        button.querySelector('.tentacleid-text').textContent = 'Connecting...';

        try {
          const result = await TentacleID.authenticate({
            requestedClaims: options.requestedClaims || []
          });

          if (options.onSuccess) {
            options.onSuccess(result);
          }

          button.querySelector('.tentacleid-text').textContent = 'Connected ✓';
          
        } catch (error) {
          if (options.onError) {
            options.onError(error);
          }
          button.querySelector('.tentacleid-text').textContent = options.text || 'Login with TentacleID';
        } finally {
          button.disabled = false;
          button.classList.remove('loading');
        }
      });

      containerEl.appendChild(button);
      return button;
    }
  };

  // Helper function
  function generateChallenge() {
    const array = new Uint8Array(32);
    crypto.getRandomValues(array);
    return Array.from(array, b => b.toString(16).padStart(2, '0')).join('');
  }

  // Expose to global scope
  window.tentacleID = TentacleID;
  window.TentacleID = TentacleID;

  // Dispatch ready event
  window.dispatchEvent(new CustomEvent('tentacleid:ready', { detail: TentacleID }));

  console.log('🐙 TentacleID API available at window.tentacleID');
})();
