# 🐙 TentacleID - Decentralized Identity Wallet

**One Identity. Many Reaches.**

TentacleID is a browser extension implementing W3C Decentralized Identifiers (DID) with Selective Disclosure for privacy-preserving authentication.

![TentacleID Demo](demo-preview.png)

## ✨ Features

- **🔐 Passwordless Authentication** - Login with cryptographic proofs, no passwords to remember or leak
- **🎯 Selective Disclosure** - Prove you're 18+ without revealing your birthdate
- **⏱️ Time-Limited Permissions** - Grant access for 5 minutes, 1 hour, or 24 hours
- **🔒 Local-First Security** - Private keys never leave your device
- **🌐 W3C Standards** - Built on DID and Verifiable Credentials specifications

## 🚀 Quick Start

### 1. Load the Extension in Chrome

1. Open Chrome and navigate to `chrome://extensions/`
2. Enable **Developer mode** (toggle in top right)
3. Click **Load unpacked**
4. Select the `extension` folder from this project

### 2. Run the Demo Website

```bash
# Navigate to project directory
cd TentacleID

# Start a local server (using any method)
npx http-server -p 3000 -c-1

# Or with Python
python -m http.server 3000
```

Then open `http://localhost:3000/demo/` in Chrome with the extension loaded.

### 3. Create Your Identity

1. Click the TentacleID extension icon (🐙) in Chrome
2. Click "Create Identity"
3. Set a passphrase (this encrypts your keys locally)
4. Your DID is generated!

## 📁 Project Structure

```
TentacleID/
├── src/core/               # Core cryptographic libraries
│   ├── crypto.js           # Web Crypto API operations
│   ├── did.js              # DID document management
│   ├── storage.js          # Encrypted IndexedDB
│   └── credentials.js      # Verifiable Credentials
│
├── extension/              # Chrome Extension
│   ├── manifest.json       # Extension config
│   ├── background.js       # Service worker
│   ├── content.js          # Page bridge
│   ├── injected.js         # window.tentacleID API
│   ├── popup/              # Extension popup UI
│   │   ├── popup.html
│   │   ├── popup.css
│   │   └── popup.js
│   └── icons/              # Extension icons
│
└── demo/                   # Demo Website
    ├── index.html          # Landing page
    ├── styles.css          # Premium dark theme
    └── app.js              # Demo logic
```

## 🔧 Website Integration

Websites can integrate TentacleID using the injected `window.tentacleID` API:

```javascript
// Check if extension is installed
const { installed } = await tentacleID.isInstalled();

// Request authentication
const result = await tentacleID.authenticate({
  requestedClaims: ['email', 'isOver18']
});
console.log(result.did);   // did:key:z6Mk...
console.log(result.proof); // Cryptographic proof

// Age verification (selective disclosure)
const age = await tentacleID.verifyAge(18, 'Age check');
// Returns: { verified: true, did: "..." }
// Birthdate never revealed!

// Create a login button
tentacleID.createLoginButton('#container', {
  text: 'Login with TentacleID',
  onSuccess: (result) => console.log('Logged in!', result),
  onError: (err) => console.error(err)
});
```

## 🔐 Security Model

- **Private Keys**: Generated using Web Crypto API (ECDSA P-256), stored encrypted in IndexedDB
- **Encryption**: AES-256-GCM with PBKDF2 key derivation (100,000 iterations)
- **DID Method**: `did:key` (self-sovereign, no external dependencies)
- **Selective Disclosure**: Hash-based reveals - prove claims without exposing raw data

## 🛠️ Technologies

| Technology | Purpose |
|------------|---------|
| W3C DIDs | Decentralized Identifiers standard |
| W3C VCs | Verifiable Credentials Data Model |
| Web Crypto API | Cryptographic operations |
| IndexedDB | Encrypted local storage |
| Chrome Manifest V3 | Modern extension architecture |

## 📋 Demo Scenarios

### Age Verification
Prove you're over 18 without revealing your birthdate. Perfect for:
- Age-gated content
- Alcohol/tobacco verification
- Gaming platforms

### Temporary Email Access
Share your email for exactly 5 minutes:
- Newsletter signups
- One-time verifications
- Marketing opt-ins

### Passwordless Login
Complete authentication using only your DID:
- No password to remember
- No database of credentials to hack
- Cryptographically secure

## 🗺️ Roadmap

- [ ] QR code scanning for credential import
- [ ] Ethereum blockchain DID anchoring
- [ ] Mobile companion app
- [ ] Enterprise SSO integration
- [ ] Zero-knowledge proofs (ZKP)

## 📄 License

MIT License - Build the future of identity! 🐙

---

**Built for the future of the decentralized web.**
