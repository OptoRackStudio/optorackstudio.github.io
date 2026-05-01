window.UnityLikeRuntime = window.UnityLikeRuntime || {};
window.UnityLikeRuntime.services = window.UnityLikeRuntime.services || {};

window.UnityLikeRuntime.services.resolutionService = {
  getProfiles: () => window.OptoRackResolution.profiles,
  getProfileKeys: () => Object.keys(window.OptoRackResolution.profiles),
  getDefaultProfileKey: () => 'PERFORMANCE',
  getActiveProfileKey: () => window.OptoRackResolution.currentKey,
  setProfile: (profileKey, persist = true) => window.OptoRackResolution.setProfile(profileKey, persist),
  restorePersistedOrDefault: () => {
    let persisted = null;
    try { persisted = localStorage.getItem('optorack_resolution_profile'); } catch (e) {}
    return window.OptoRackResolution.setProfile(persisted || 'PERFORMANCE', false);
  },
  getRenderSize: () => ({ w: window.DW, h: window.DH })
};
