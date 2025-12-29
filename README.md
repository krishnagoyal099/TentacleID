<div align="center">
  <img src="extension/icons/icon128.png" alt="TentacleID Logo" width="128" height="128">
  
  # TentacleID
  
  **One Identity. Many Reaches.** 🐙
  
  <p>
    <b>Own Your Digital Self.</b><br>
    Proof of Age • Passwordless Login • Zero-Knowledge Privacy
  </p>

  [![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://opensource.org/licenses/MIT)
  [![Manifest V3](https://img.shields.io/badge/Chrome-Manifest%20V3-4285F4.svg)](https://developer.chrome.com/docs/extensions/mv3/)
  [![Web Crypto API](https://img.shields.io/badge/Security-Web%20Crypto%20API-green.svg)](https://w3c.github.io/webcrypto/)
</div>

---

TentacleID is a local-first **Decentralized Identity Wallet** that lives in your browser. It leverages **W3C Decentralized Identifiers (DIDs)** and **Zero-Knowledge Proofs (ZK)** to let you prove *who you are* without revealing *everything about you*.

Bridging the gap between privacy and convenience, TentacleID offers a seamless authentication experience that leaves no data trail.

![TentacleID Demo](demo-preview.png)

## ✨ Features

- **🔐 Passwordless Authentication**  
  Log in securely using cryptographic proofs. Say goodbye to phishing and password leaks.

- **🎯 Selective Disclosure & ZK Proofs**  
  Prove you are over 18 without revealing your birthdate. Share only what is necessary, when it is necessary.

- **🛡️ Local-First Security**  
  Your private keys are generated and stored exclusively on your device (using `did:key`). No central server holds your data.

- **⏱️ Time-Limited Permissions**  
  Grant temporary access to your data (e.g., email) for 5 minutes, 1 hour, or 24 hours. The permission auto-revokes.

- **🔑 Biometric Unlock**  
  Unlock your wallet instantly using Fingerprint or Face ID via WebAuthn/Passkeys.

- **🌐 Standard Compliant**  
  Built on modern W3C standards: **DIDs**, **Verifiable Credentials (VCs)**, and **WebAuthn**.

## 🛠️ Built With

*   **Platform**: Chrome Extension (Manifest V3)
*   **Languages**: JavaScript (ES6+), HTML5, CSS3
*   **Cryptography**: Web Crypto API (Native Browser Standard)
*   **Standards**: W3C Decentralized Identifiers (DID), Verifiable Credentials (VC)
*   **Storage**: Encrypted IndexedDB
*   **Hosting**: Vercel (Marketing & Demo Site)

## 🚀 Installation

### Option 1: Install via ZIP (Recommended)
1.  Download the latest release from the [Releases Page](https://github.com/krishnagoyal099/TentacleID/releases).
2.  Extract the `tentacleid.zip` file.
3.  Open Chrome and navigate to `chrome://extensions/`.
4.  Enable **Developer mode** (top right toggle).
5.  Click **Load unpacked** and select the extracted folder.

### Option 2: Build from Source
1.  Clone the repository:
    ```bash
    git clone https://github.com/krishnagoyal099/TentacleID.git
    ```
2.  Navigate to `chrome://extensions/` in Chrome.
3.  Enable **Developer mode**.
4.  Click **Load unpacked** and select the `extension` folder inside the cloned repo.

## 🎮 Try the Demo

Once installed, you can run the included demo websites to see TentacleID in action.

```bash
# Navigate to project directory
cd TentacleID

# Start a local server
npx -y http-server -p 3000 -c-1
```

Visit the demos at:
*   **Main Demo**: [`http://localhost:3000/demo/`](http://localhost:3000/demo/) - General authentication showcase.
*   **The Velvet Lounge**: [`http://localhost:3000/demo-bar/`](http://localhost:3000/demo-bar/) - Age verification scenario (Prove 21+ without revealing DOB).

## 📖 Usage Guide

1.  **Create Identity**: Click the extension icon (🐙), set a passphrase, and generate your secure DID.
2.  **Connect**: Visit a supported site (like the demos above).
3.  **Approve**: When prompted, choose which data to share.
    *   *Example*: "Share Age (Proof only)" vs "Share Birthdate".
4.  **Manage**: View active connections and revoke access instantly from the dashboard.

## 👨‍💻 Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

1.  Fork the project
2.  Create your feature branch (`git checkout -b feature/AmazingFeature`)
3.  Commit your changes (`git commit -m 'Add some AmazingFeature'`)
4.  Push to the branch (`git push origin feature/AmazingFeature`)
5.  Open a Pull Request

## 📄 License

Distributed under the MIT License. See `LICENSE` for more information.

---

<div align="center">
  <b>Built for the future of the decentralized web.</b>
</div>
