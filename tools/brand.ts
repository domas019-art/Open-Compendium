import * as ResEdit from './src/main/index.ts';
import * as fs from 'fs';
const exePath=process.argv[2], icoPath=process.argv[3], ver=process.argv[4];
const exe=ResEdit.NtExecutable.from(fs.readFileSync(exePath));
const res=ResEdit.NtExecutableResource.from(exe);
const ico=ResEdit.Data.IconFile.from(fs.readFileSync(icoPath));
const groups=ResEdit.Resource.IconGroupEntry.fromEntries(res.entries);
const gid=groups.length?groups[0].id:1, lang=groups.length?groups[0].lang:1033;
ResEdit.Resource.IconGroupEntry.replaceIconsForResource(res.entries, gid, lang, ico.icons.map(i=>i.data));
const vi=ResEdit.Resource.VersionInfo.fromEntries(res.entries)[0];
const L={lang:1033,codepage:1200};
const [a,b,c]=ver.split('.').map(Number);
vi.removeStringValue(L,'SquirrelAwareVersion');
vi.setStringValues(L,{CompanyName:'Open Compendium',FileDescription:'Open Compendium',ProductName:'Open Compendium',
  InternalName:'Open Compendium',OriginalFilename:'Open Compendium.exe',LegalCopyright:'Personal project. Built on Electron (MIT licence).',
  FileVersion:ver,ProductVersion:ver});
vi.setFileVersion(a,b,c,0,1033); vi.setProductVersion(a,b,c,0,1033);
vi.outputToResourceEntries(res.entries);
res.outputResource(exe);
fs.writeFileSync(exePath, Buffer.from(exe.generate()));
console.log('done, groups', groups.map(g=>g.id+'/'+g.lang).join(','));
