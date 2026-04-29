window.SoundEngine.createAudioContext = (qualityKey) => {
  const AudioContextCtor = window.AudioContext || window.webkitAudioContext;
  const profile = window.SoundEngine.QUALITY_PROFILES[qualityKey] || window.SoundEngine.QUALITY_PROFILES.STANDARD;
  return profile.audioContextOptions ? new AudioContextCtor(profile.audioContextOptions) : new AudioContextCtor();
};
