# Building Open Compendium for Windows

1. Download Electron **v44.9.3** `electron-v44.9.3-win32-x64.zip` from the Electron releases on GitHub and check
   it against that release's `SHASUMS256.txt`.
2. Unzip it into a folder called `Open Compendium`.
3. Delete `resources/default_app.asar`, and every file in `locales/` except `en-US.pak` and `lt.pak`.
4. Rename `electron.exe` to `Open Compendium.exe`.
5. Put the icon and version into the exe with `tools/brand.ts` (uses resedit-js and pe-library-js from GitHub,
   run with `tsx brand.ts "Open Compendium.exe" icon.ico 0.69.0`).
6. Copy `app/` (main.js, preload.js, package.json, icon.png, web/) into `resources/app/`.
7. Copy `dist-files/README.txt` next to the exe.

Users add their own `Libraries` folder; `Data`, `Characters` and `portraits` are made on the first start.

## Update package

Zip only `resources/app` (inside an `Open Compendium` folder) and tell users to unzip it over their copy with the
program closed. Characters, libraries and settings live outside that folder and are never touched.
