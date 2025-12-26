/**
 * TentacleID Content Script
 * Bridges communication between web pages and the extension
 */

(function() {
  'use strict';

  // Inject the page-level API
  const script = document.createElement('script');
  script.src = chrome.runtime.getURL('injected.js');
  script.onload = function() {
    this.remove();
  };
  (document.head || document.documentElement).appendChild(script);

  // Listen for messages from the injected script
  window.addEventListener('message', async (event) => {
    if (event.source !== window) return;
    if (!event.data || event.data.source !== 'tentacleid-page') return;

    const { type, payload, messageId } = event.data;

    try {
      let response;

      switch (type) {
        case 'AUTHENTICATE':
          response = await chrome.runtime.sendMessage({
            type: 'AUTH_REQUEST',
            domain: window.location.hostname,
            challenge: payload.challenge,
            requestedClaims: payload.requestedClaims
          });
          break;

        case 'REQUEST_CREDENTIAL':
          response = await chrome.runtime.sendMessage({
            type: 'CREDENTIAL_REQUEST',
            domain: window.location.hostname,
            credentialType: payload.credentialType,
            requestedClaims: payload.requestedClaims,
            purpose: payload.purpose
          });
          break;

        case 'CHECK_INSTALLED':
          response = { installed: true, version: '1.0.0' };
          break;

        case 'GET_DID':
          response = await chrome.runtime.sendMessage({
            type: 'GET_SESSION'
          });
          if (response.unlocked && response.identity) {
            response = { did: response.identity.did };
          } else {
            response = { error: 'Wallet is locked' };
          }
          break;

        default:
          response = { error: 'Unknown request type' };
      }

      // Send response back to page
      window.postMessage({
        source: 'tentacleid-extension',
        messageId,
        response
      }, '*');

    } catch (error) {
      window.postMessage({
        source: 'tentacleid-extension',
        messageId,
        response: { error: error.message }
      }, '*');
    }
  });

  // Notify page that TentacleID is available
  window.postMessage({
    source: 'tentacleid-extension',
    type: 'READY'
  }, '*');

  console.log('🐙 TentacleID content script loaded');
})();
