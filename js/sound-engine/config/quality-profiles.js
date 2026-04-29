window.SoundEngine.QUALITY_PROFILES = {
  STANDARD: { label: 'STANDARD', audioContextOptions: undefined },
  LOW_LATENCY: { label: 'LOW LATENCY', audioContextOptions: { latencyHint: 'interactive' } },
  HIGH_QUALITY: { label: 'HIGH QUALITY', audioContextOptions: { latencyHint: 'interactive', sampleRate: 96000 } },
  PRO_STUDIO: { label: 'PRO STUDIO (192K)', audioContextOptions: { latencyHint: 'playback', sampleRate: 192000 } }
};
