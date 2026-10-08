/**
 * App Shell & Navigation Controller
 */

document.addEventListener('DOMContentLoaded', () => {
  // Navigation Tabs
  const navTabs = document.querySelectorAll('.nav-tab');
  const tabPanes = document.querySelectorAll('.tab-pane');

  navTabs.forEach(tab => {
    tab.addEventListener('click', () => {
      const targetId = tab.getAttribute('data-tab');
      
      navTabs.forEach(t => t.classList.remove('active'));
      tabPanes.forEach(p => p.classList.remove('active'));

      tab.classList.add('active');
      const targetPane = document.getElementById(targetId);
      if (targetPane) {
        targetPane.classList.add('active');
      }
    });
  });

  // Check system status
  checkSystemStatus();
});

/**
 * Show notification banner
 */
function showBanner(message, type = 'info', duration = 5000) {
  const container = document.getElementById('bannerContainer');
  if (!container) return;

  const banner = document.createElement('div');
  banner.className = `alert-banner ${type}`;
  banner.innerHTML = `
    <span>${message}</span>
    <button style="background:none;border:none;color:inherit;font-size:1.1rem;cursor:pointer;" onclick="this.parentElement.remove()">✕</button>
  `;

  container.appendChild(banner);

  if (duration > 0) {
    setTimeout(() => {
      if (banner.parentElement) banner.remove();
    }, duration);
  }
}

/**
 * Check backend health & Firebase status
 */
async function checkSystemStatus() {
  const badgeText = document.getElementById('systemStatusText');
  const badgeDot = document.querySelector('.status-dot');

  try {
    const res = await fetch('/api/status');
    const data = await res.json();

    if (data.firebaseConfigured) {
      if (badgeText) badgeText.innerText = 'Firebase: Online';
      if (badgeDot) badgeDot.className = 'status-dot online';
    } else {
      if (badgeText) badgeText.innerText = 'Firebase: Pending Config';
      if (badgeDot) badgeDot.className = 'status-dot';
      console.warn('Firebase configuration notice:', data.message);
    }
  } catch (err) {
    if (badgeText) badgeText.innerText = 'Server Offline';
    if (badgeDot) badgeDot.style.background = '#ef4444';
  }
}

window.showBanner = showBanner;
