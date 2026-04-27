export const createAudioObserver = async (router) => {
  const observer = await router.createAudioLevelObserver({
    maxEntries: 1,       // only top speaker
    threshold: -80,      // sensitivity
    interval: 800,       // ms
  });

  return observer;
};