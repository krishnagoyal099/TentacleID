// TentacleID – White Page Experience

document.addEventListener('DOMContentLoaded', () => {
  createParticles();
  initScreenshotTilt();
});

function createParticles() {
  const container = document.querySelector('.particles');
  if (!container) return;
  
  const count = 25;
  
  for (let i = 0; i < count; i++) {
    const particle = document.createElement('div');
    particle.className = 'particle';
    
    const size = Math.random() * 4 + 2;
    const left = Math.random() * 100;
    const delay = Math.random() * 12;
    const duration = Math.random() * 8 + 10;
    const drift = (Math.random() - 0.5) * 60;
    
    // Cyan/Purple particles
    const colors = ['#22d3ee', '#a855f7', '#ec4899'];
    const color = colors[Math.floor(Math.random() * colors.length)];
    
    particle.style.cssText = `
      width: ${size}px;
      height: ${size}px;
      left: ${left}%;
      bottom: 0;
      background: ${color};
      box-shadow: 0 0 ${size * 2}px ${color};
      animation-delay: ${delay}s;
      animation-duration: ${duration}s;
      --drift: ${drift}px;
    `;
    
    container.appendChild(particle);
  }
}

function initScreenshotTilt() {
  const screenshot = document.querySelector('.screenshot-wrapper');
  const container = document.querySelector('.screenshot-container');
  
  if (!screenshot || !container) return;
  
  container.addEventListener('mousemove', (e) => {
    const rect = container.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    
    // Calculate tilt
    const centerX = rect.width / 2;
    const centerY = rect.height / 2;
    
    // Max 8deg rotation
    const rotateY = ((x - centerX) / centerX) * 8; 
    const rotateX = ((y - centerY) / centerY) * -8;
    
    screenshot.style.transform = `rotateY(${rotateY}deg) rotateX(${rotateX}deg) scale(1.02)`;
    screenshot.style.transition = 'transform 0.1s ease-out';
  });
  
  container.addEventListener('mouseleave', () => {
    screenshot.style.transform = 'rotateY(-10deg) rotateX(5deg)';
    screenshot.style.transition = 'transform 0.5s ease-out';
  });
}

// Modal Functions
function showInstallGuide() {
  const modal = document.getElementById('installModal');
  if (modal) {
    modal.classList.add('active');
  }
}

function closeInstallGuide() {
  const modal = document.getElementById('installModal');
  if (modal) {
    modal.classList.remove('active');
  }
}

// Close modal when clicking outside
window.onclick = function(event) {
  const modal = document.getElementById('installModal');
  if (event.target == modal) {
    closeInstallGuide();
  }
}

// Console branding
console.log(
  '%c🐙 TentacleID',
  'background: linear-gradient(135deg, #22d3ee, #a855f7); color: white; padding: 10px 20px; border-radius: 8px; font-size: 16px; font-weight: bold;'
);
