window.SoundEngine.createAudioContext = (qualityKey) => {
  const AudioContextCtor = window.AudioContext || window.webkitAudioContext;
  const profile = window.SoundEngine.QUALITY_PROFILES[qualityKey] || window.SoundEngine.QUALITY_PROFILES.STANDARD;
  try {
      return profile.audioContextOptions ? new AudioContextCtor(profile.audioContextOptions) : new AudioContextCtor();
  } catch (e) {
      console.warn("AudioContext creation failed with options:", profile.audioContextOptions, "falling back to default.");
      if (window.showOptoError) window.showOptoError(`Failed to initialize ${qualityKey} quality. Falling back to standard sample rate.`);
      return new AudioContextCtor();
  }
};
