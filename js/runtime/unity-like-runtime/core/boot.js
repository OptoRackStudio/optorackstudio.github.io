window.UnityLikeRuntime = window.UnityLikeRuntime || {};
window.UnityLikeRuntime.boot = window.UnityLikeRuntime.boot || (() => {
  window.UnityLikeRuntime.services.resolutionService.restorePersistedOrDefault();
  window.UnityLikeRuntime.state.booted = true;
});
