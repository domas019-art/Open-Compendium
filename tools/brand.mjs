// Puts the icon and the version into Open Compendium.exe (Electron's exe renamed).
// node tools/brand.mjs "Open Compendium.exe" tools/icon.ico 0.80.0     (needs: npm install resedit)
import * as fs from 'fs';
const ResEdit = await import(process.env.RESEDIT || 'resedit');
const [exePath, icoPath, ver] = process.argv.slice(2);
const exe = ResEdit.NtExecutable.from(fs.readFileSync(exePath));
const res = ResEdit.NtExecutableResource.from(exe);
const ico = ResEdit.Data.IconFile.from(fs.readFileSync(icoPath));
const groups = ResEdit.Resource.IconGroupEntry.fromEntries(res.entries);
const gid = groups.length ? groups[0].id : 1, lang = groups.length ? groups[0].lang : 1033;
ResEdit.Resource.IconGroupEntry.replaceIconsForResource(res.entries, gid, lang, ico.icons.map(i => i.data));
const vi = ResEdit.Resource.VersionInfo.fromEntries(res.entries)[0];
const L = { lang: 1033, codepage: 1200 };
const [a, b, c] = ver.split('.').map(Number);
vi.removeStringValue(L, 'SquirrelAwareVersion');
vi.setStringValues(L, { CompanyName: 'Open Compendium', FileDescription: 'Open Compendium', ProductName: 'Open Compendium',
  InternalName: 'Open Compendium', OriginalFilename: 'Open Compendium.exe',
  LegalCopyright: 'Open Compendium, MIT licence. Built on Electron (MIT licence).', FileVersion: ver, ProductVersion: ver });
vi.setFileVersion(a, b, c, 0, 1033); vi.setProductVersion(a, b, c, 0, 1033);
vi.outputToResourceEntries(res.entries);
res.outputResource(exe);
fs.writeFileSync(exePath, Buffer.from(exe.generate()));
console.log('branded', exePath, ver);
