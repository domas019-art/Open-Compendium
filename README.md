# Open Compendium

An offline compendium, character builder and character sheet for the 4th edition D&D, as a portable Windows program.

**It contains no game content.** It reads your own library files (the web compendium files and the Character Builder's
`combined.dnd40.merged.xml` made by CBLoader) from the `Libraries` folder next to the programs.

## Folders

| Folder | What is in it |
|---|---|
| `app/` | The program itself: `main.js` (the window, files, no internet), `preload.js`, and `web/` (the screens) |
| `dist-files/` | Files that go next to the program in a release (the user README) |
| `tools/` | The icon, and `brand.ts` (puts the icon and version into the .exe) |

## Making a release

See [tools/BUILD.md](tools/BUILD.md). A full release is the Electron engine with `app/` copied into
`resources/app`. An update release is just the `app/` folder, zipped as `resources/app`.

## Version

The version is in `app/package.json` and `APP_VERSION` in `app/web/compendium.js` (shown at the foot of the Start page).

## Legal

Open Compendium contains no game content: it reads library files you already own. It is an unofficial fan project, not affiliated with or endorsed by Wizards of the Coast. Dungeons & Dragons and D&D are trademarks of Wizards of the Coast LLC. The program's own code is under the MIT licence (see LICENSE); the Electron engine it runs on is under its own MIT licence.
