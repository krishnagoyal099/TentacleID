/**
 * 3D Octopus Animation - Follows cursor like MetaMask's fox
 * Uses CSS 3D transforms for a realistic perspective effect
 */

class Octopus3D {
  constructor(container) {
    this.container = container;
    this.octopus = null;
    this.tentacles = [];
    this.rotX = 0;
    this.rotY = 0;
    this.targetRotX = 0;
    this.targetRotY = 0;
    this.init();
  }

  init() {
    this.createOctopus();
    this.addEventListeners();
    this.animate();
  }

  createOctopus() {
    // Create the 3D scene
    this.container.innerHTML = `
      <div class="octopus-3d-scene">
        <div class="octopus-3d">
          <div class="octopus-3d-body">
            <img src="tentacle-icon.png" alt="TentacleID" class="octopus-3d-icon">
          </div>
          <div class="octopus-3d-shadow"></div>
          <div class="octopus-3d-reflection"></div>
        </div>
      </div>
    `;
    
    this.octopus = this.container.querySelector('.octopus-3d');
    this.scene = this.container.querySelector('.octopus-3d-scene');
  }

  addEventListeners() {
    // Track mouse movement over the entire popup
    document.addEventListener('mousemove', (e) => this.handleMouseMove(e));
    document.addEventListener('mouseleave', () => this.resetPosition());
  }

  handleMouseMove(e) {
    const rect = this.container.getBoundingClientRect();
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;
    
    // Calculate rotation based on mouse position relative to center
    // Max rotation of 25 degrees
    const maxRotation = 25;
    
    const deltaX = (e.clientX - centerX) / (rect.width / 2);
    const deltaY = (e.clientY - centerY) / (rect.height / 2);
    
    // Clamp values between -1 and 1
    const clampedX = Math.max(-1, Math.min(1, deltaX));
    const clampedY = Math.max(-1, Math.min(1, deltaY));
    
    // Set target rotations (invert Y for natural feel)
    this.targetRotY = clampedX * maxRotation;
    this.targetRotX = -clampedY * maxRotation * 0.7; // Less vertical movement
  }

  resetPosition() {
    this.targetRotX = 0;
    this.targetRotY = 0;
  }

  animate() {
    // Smooth easing towards target rotation
    const ease = 0.08;
    
    this.rotX += (this.targetRotX - this.rotX) * ease;
    this.rotY += (this.targetRotY - this.rotY) * ease;
    
    if (this.octopus) {
      // Apply 3D transform
      this.octopus.style.transform = `
        rotateX(${this.rotX}deg) 
        rotateY(${this.rotY}deg)
      `;
      
      // Update shadow based on rotation
      const shadowX = this.rotY * 0.3;
      const shadowY = 10 + this.rotX * 0.2;
      const shadow = this.container.querySelector('.octopus-3d-shadow');
      if (shadow) {
        shadow.style.transform = `
          translateX(${shadowX}px) 
          translateY(${shadowY}px) 
          scale(${1 - Math.abs(this.rotX) * 0.005})
        `;
      }
    }
    
    requestAnimationFrame(() => this.animate());
  }
}

// Auto-initialize when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
  const container = document.getElementById('octopus3dContainer');
  if (container) {
    window.octopus3D = new Octopus3D(container);
  }
});

// Export for use elsewhere
if (typeof module !== 'undefined') {
  module.exports = Octopus3D;
}
