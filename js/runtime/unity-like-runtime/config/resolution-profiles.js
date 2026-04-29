window.UnityLikeRuntime = window.UnityLikeRuntime || {};
window.UnityLikeRuntime.config = window.UnityLikeRuntime.config || {};

window.UnityLikeRuntime.config.resolutionProfiles = {
  PERFORMANCE: { w: 160, h: 120, label: 'PERFORMANCE (160x120)' },
  BALANCED: { w: 240, h: 180, label: 'BALANCED (240x180)' },
  HIGH: { w: 320, h: 240, label: 'HIGH (320x240)' },
  ULTRA: { w: 480, h: 360, label: 'ULTRA (480x360)' },
  QHD: { w: 1280, h: 720, label: 'QHD (1280x720)' },
  FHD: { w: 1920, h: 1080, label: 'FHD (1920x1080)' },
  UHD_4K: { w: 3840, h: 2160, label: 'UHD 4K (3840x2160)' }
};

window.UnityLikeRuntime.config.defaultResolutionProfile = 'PERFORMANCE';
