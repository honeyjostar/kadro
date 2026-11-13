// Маленький веб-установщик (как у Telegram, только тёмный и с маскотом): своё окно на .NET Framework 4, который
// есть в каждой Windows 10/11 (installer/web/Setup.cs). Язык Kadro → «О тебе» с иконками → скачивает последний
// Kadro-Setup с GitHub (сверяет SHA-256 по SHA256SUMS.txt того же релиза) → ставит его тихо (/S) → открывает Kadro.
// Всегда берёт последний релиз, поэтому старая копия веб-установщика тоже ставит свежий Kadro.
//   node scripts/pack-web-setup.mjs          → release/Kadro-Web-Setup.exe
//   node scripts/pack-web-setup.mjs --test   → release/web-setup/Kadro-Web-Setup-test.exe (с крючками для тестов)
// Нужны mcs (пакет mono-mcs, плюс libmono-system-windows-forms4.0-cil) и windres (binutils-mingw-w64-x86-64).
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { lucideFigures } from './lucide-flatten.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'release');
const WORK = path.join(OUT, 'web-setup');
const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
const REPO = 'honeyjostar/kadro';
const test = process.argv.includes('--test');
fs.mkdirSync(WORK, { recursive: true });

// значки lucide, которые рисует окно
const ICONS = ['sprout', 'scissors', 'clapperboard', 'smartphone', 'monitor-play', 'gamepad-2', 'plane', 'briefcase', 'graduation-cap', 'ellipsis',
  'music-2', 'circle-play', 'send', 'message-circle', 'users', 'search', 'code-xml', 'check', 'minus', 'x', 'lightbulb', 'external-link'];
const src = fs.readFileSync(path.join(ROOT, 'installer', 'web', 'Setup.cs'), 'utf8');
for (const m of src.matchAll(/new Opt\("[^"]+", "([^"]+)"/g)) if (!ICONS.includes(m[1])) throw new Error(`значок ${m[1]} не в списке ICONS`);
const icons = ICONS.map((name) => {
  const figs = lucideFigures(ROOT, name).map((f) => `new float[] { ${[f.closed ? 1 : 0, ...f.pts].map((v) => `${v}f`).join(', ')} }`);
  return `            { "${name}", new float[][] { ${figs.join(', ')} } },`;
}).join('\n');
const [maj, min, patch] = pkg.version.split('.').map(Number);
fs.writeFileSync(path.join(WORK, 'Gen.cs'), `// создано scripts/pack-web-setup.mjs — не править руками
using System.Collections.Generic;
using System.Reflection;
[assembly: AssemblyTitle("Kadro Web Setup")]
[assembly: AssemblyProduct("Kadro")]
[assembly: AssemblyVersion("${maj}.${min}.${patch}.0")]
namespace Kadro.WebSetup
{
    static class Gen
    {
        public const string Version = "${pkg.version}";
        public const string Repo = "${REPO}";
    }
    static class Icons
    {
        // lucide (ISC): фигуры в квадрате 24×24 — [замкнута, x0, y0, x1, y1, …]
        public static readonly Dictionary<string, float[][]> Figures = new Dictionary<string, float[][]>
        {
${icons}
        };
    }
}
`);

// ресурсы Windows: значок, манифест (без прав администратора, чёткий на экранах с масштабом) и сведения о версии
fs.copyFileSync(path.join(ROOT, 'build', 'icon.ico'), path.join(WORK, 'icon.ico'));
fs.writeFileSync(path.join(WORK, 'app.manifest'), `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<assembly xmlns="urn:schemas-microsoft-com:asm.v1" manifestVersion="1.0">
  <assemblyIdentity version="${maj}.${min}.${patch}.0" name="Kadro.WebSetup" type="win32"/>
  <trustInfo xmlns="urn:schemas-microsoft-com:asm.v3">
    <security><requestedPrivileges><requestedExecutionLevel level="asInvoker" uiAccess="false"/></requestedPrivileges></security>
  </trustInfo>
  <compatibility xmlns="urn:schemas-microsoft-com:compatibility.v1">
    <application><supportedOS Id="{8e0f7a12-bfb3-4fe8-b9a5-48fd50a15a9a}"/></application>
  </compatibility>
  <application xmlns="urn:schemas-microsoft-com:asm.v3">
    <windowsSettings><dpiAware xmlns="http://schemas.microsoft.com/SMI/2005/WindowsSettings">true</dpiAware></windowsSettings>
  </application>
</assembly>
`);
const v4 = `${maj},${min},${patch},0`;
fs.writeFileSync(path.join(WORK, 'setup.rc'), `1 ICON "icon.ico"
1 24 "app.manifest"
1 VERSIONINFO
FILEVERSION ${v4}
PRODUCTVERSION ${v4}
FILEOS 0x40004
FILETYPE 0x1
BEGIN
  BLOCK "StringFileInfo"
  BEGIN
    BLOCK "040904b0"
    BEGIN
      VALUE "CompanyName", "Kadro"
      VALUE "FileDescription", "Kadro Web Setup"
      VALUE "FileVersion", "${pkg.version}"
      VALUE "InternalName", "Kadro-Web-Setup"
      VALUE "LegalCopyright", "GPL-3.0-or-later"
      VALUE "OriginalFilename", "Kadro-Web-Setup.exe"
      VALUE "ProductName", "Kadro"
      VALUE "ProductVersion", "${pkg.version}"
    END
  END
  BLOCK "VarFileInfo"
  BEGIN
    VALUE "Translation", 0x409, 1200
  END
END
`);
const windres = ['x86_64-w64-mingw32-windres', 'windres'].find((w) => {
  try { execFileSync(w, ['--version'], { stdio: 'ignore' }); return true; } catch { return false; }
});
if (!windres) throw new Error('нет windres (apt install binutils-mingw-w64-x86-64)');
// в .rc нет #include и #define — препроцессор C не нужен (а gcc от mingw ставить ради него незачем)
fs.writeFileSync(path.join(WORK, 'pp.sh'), '#!/bin/sh\nfor a; do f="$a"; done\ncat "$f"\n', { mode: 0o755 });
execFileSync(windres, ['--preprocessor=./pp.sh', 'setup.rc', '-O', 'res', '-o', 'setup.res'], { cwd: WORK, stdio: 'inherit' });

// шрифты Kadro и позы маскота — внутрь exe
const res = [];
for (const f of fs.readdirSync(path.join(ROOT, 'resources', 'installer', 'fonts'))) if (f.endsWith('.ttf')) res.push(`-resource:${path.join(ROOT, 'resources', 'installer', 'fonts', f)},font.${f}`);
for (const pose of ['hello', 'pointleft', 'laptop', 'fingerup', 'present', 'clipboard', 'thumbsup', 'think', 'shrug', 'cheer']) res.push(`-resource:${path.join(ROOT, 'resources', 'mascot', `${pose}.png`)},mascot.${pose}.png`);

const out = test ? path.join(WORK, 'Kadro-Web-Setup-test.exe') : path.join(OUT, 'Kadro-Web-Setup.exe');
execFileSync('mcs', [
  '-target:winexe', '-optimize+', '-nologo', '-codepage:utf8', '-platform:anycpu',
  ...(test ? ['-define:TESTHOOKS'] : []),
  `-out:${out}`, '-win32res:setup.res',
  '-r:System.dll', '-r:System.Drawing.dll', '-r:System.Windows.Forms.dll',
  ...res,
  path.join(ROOT, 'installer', 'web', 'Setup.cs'), 'Gen.cs',
], { cwd: WORK, stdio: 'inherit' });
console.log(`Готово: ${out} (${(fs.statSync(out).size / 1024).toFixed(0)} КБ)`);
