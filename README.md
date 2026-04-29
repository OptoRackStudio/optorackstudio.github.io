# OptoRack Studio

## Run on localhost

1. Open terminal in this folder.
2. Run `npm run start`.
3. Open `http://localhost:8080`.

## Project structure

```text
js/
  runtime/
    unity-like-runtime/
      config/
        resolution-profiles.js
      core/
        runtime-state.js
        boot.js
      services/
        resolution-service.js
      index.js
  app/
    config/
      quick-tweaks.js
    main-app.js
  core/
    globals-and-helpers.js
  ui/
    error-and-perf.js
    base-components.js
    visualizers-and-webgl.js
  sound-engine/
    index.js
    config/
      quality-profiles.js
      options.js
    runtime/
      create-audio-context.js
  module-library/
    index.js
    fx/
      audio-effects/
      sequencers-and-modulation/
      utilities-and-routing/
```

## Quick edits (change 1-2 things fast)

Edit [quick-tweaks.js](/D:/OptoRack Studio/js/app/config/quick-tweaks.js) for:
- default BPM/root/scale/quality
- default OptoRack visual resolution profile
- BPM min/max range
- tip rotation interval
- key top-bar labels

Edit [tips.data.js](/D:/OptoRack Studio/js/app/config/tips/tips.data.js) to add/remove tips shown in the tip panel.

Edit [tutorial.data.js](/D:/OptoRack Studio/js/app/config/tutorial/tutorial.data.js) to manage:
- guide steps (`steps`)
- shortcuts/help list (`shortcuts`)

UI component for the guide panel:
- [beginner-guide-panel.js](/D:/OptoRack Studio/js/ui/panels/beginner-guide-panel.js)

Unity-like runtime resolution architecture:
- [resolution-profiles.js](/D:/OptoRack Studio/js/runtime/unity-like-runtime/config/resolution-profiles.js)
- [resolution-service.js](/D:/OptoRack Studio/js/runtime/unity-like-runtime/services/resolution-service.js)

Startup intro resolution picker is in:
- [main-app.js](/D:/OptoRack Studio/js/app/main-app.js)

Project save/load workflow:
1. Click `SET SAVE DIR` and choose a folder.
2. App creates/uses `OptoRack Saves` inside it.
3. Click `SAVE` to write `.json` project files there.
4. Click `LOAD` to open the project panel and load files from that directory.
