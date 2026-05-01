window.UnityLikeRuntime = window.UnityLikeRuntime || {};
window.UnityLikeRuntime.services = window.UnityLikeRuntime.services || {};

window.UnityLikeRuntime.services.resolutionService = {
  getProfiles: () => window.UnityLikeRuntime.config.resolutionProfiles,
  getProfileKeys: () => Object.keys(window.UnityLikeRuntime.config.resolutionProfiles),
  getDefaultProfileKey: () => window.UnityLikeRuntime.config.defaultResolutionProfile,
  getActiveProfileKey: () => window.UnityLikeRuntime.state.activeResolutionProfile || window.UnityLikeRuntime.config.defaultResolutionProfile,
  setProfile: (profileKey, persist = true) => {
    const profiles = window.UnityLikeRuntime.config.resolutionProfiles;
    const safeKey = profiles[profileKey] ? profileKey : window.UnityLikeRuntime.config.defaultResolutionProfile;
    const profile = profiles[safeKey];

    window.UnityLikeRuntime.state.activeResolutionProfile = safeKey;
    window.UnityLikeRuntime.state.renderSize = { w: profile.w, h: profile.h };

    if (persist) {
      try { localStorage.setItem('optorack_runtime_resolution_profile', safeKey); } catch (e) {}
    }

    return safeKey;
  },
  restorePersistedOrDefault: () => {
    let persisted = null;
    try { persisted = localStorage.getItem('optorack_runtime_resolution_profile'); } catch (e) {}
    return window.UnityLikeRuntime.services.resolutionService.setProfile(persisted || window.UnityLikeRuntime.config.defaultResolutionProfile, false);
  },
  getRenderSize: () => window.UnityLikeRuntime.state.renderSize
};
