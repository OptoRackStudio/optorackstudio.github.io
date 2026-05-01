window.SoundEngine.createAudioContext = (qualityKey) => {
  const AudioContextCtor = window.AudioContext || window.webkitAudioContext;
  const profile = window.SoundEngine.QUALITY_PROFILES[qualityKey] || window.SoundEngine.QUALITY_PROFILES.STANDARD;
  
  try {
    return profile.audioContextOptions ? new AudioContextCtor(profile.audioContextOptions) : new AudioContextCtor();
  } catch (e) {
    console.error(`[Audio] Failed to create context with profile ${qualityKey}:`, e);
    // Fallback to standard
    const ctx = new AudioContextCtor();
    alert(`Audio Quality Profile "${qualityKey}" is not supported by your hardware. Falling back to Standard (${ctx.sampleRate}Hz).`);
    return ctx;
  }
};

