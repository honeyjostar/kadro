// Сборка Kadro под Windows x64 на Linux: папка программы + установщик NSIS.
// Нужны: dist/ (npm run build), zip Electron для win32-x64, zip FFmpeg (BtbN, win64-gpl-shared), makensis.
//   node scripts/pack-win.mjs --electron <electron-win32-x64.zip> --ffmpeg <ffmpeg-win64-gpl-shared.zip> [--portable]
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as ResEdit from 'resedit';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const arg = (n) => { const i = process.argv.indexOf(`--${n}`); return i > 0 ? process.argv[i + 1] : undefined; };
const ELECTRON_ZIP = arg('electron');
const FFMPEG_ZIP = arg('ffmpeg');
if (!ELECTRON_ZIP || !FFMPEG_ZIP) { console.error('нужны --electron и --ffmpeg'); process.exit(1); }

const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
const OUT = path.join(ROOT, 'release');
const APP_DIR = path.join(OUT, 'win-unpacked');
const RES = path.join(APP_DIR, 'resources');
const run = (cmd, args, opts = {}) => execFileSync(cmd, args, { stdio: 'inherit', ...opts });
const cp = (a, b) => fs.cpSync(a, b, { recursive: true, dereference: true });
const step = (s) => console.log(`\n▸ ${s}`);

fs.rmSync(APP_DIR, { recursive: true, force: true });
fs.mkdirSync(APP_DIR, { recursive: true });

step('Electron');
run('unzip', ['-q', ELECTRON_ZIP, '-d', APP_DIR]);
fs.renameSync(path.join(APP_DIR, 'electron.exe'), path.join(APP_DIR, 'Kadro.exe'));
fs.rmSync(path.join(RES, 'default_app.asar'), { force: true });

step('Код приложения');
const app = path.join(RES, 'app');
fs.mkdirSync(app, { recursive: true });
fs.writeFileSync(path.join(app, 'package.json'), JSON.stringify({
  name: pkg.name, productName: pkg.productName, version: pkg.version, description: pkg.description,
  license: pkg.license, author: pkg.author, main: pkg.main,
}, null, 2));
for (const d of ['main', 'preload', 'worker', 'renderer']) cp(path.join(ROOT, 'dist', d), path.join(app, 'dist', d));
for (const f of fs.readdirSync(path.join(app, 'dist'), { recursive: true })) if (String(f).endsWith('.map')) fs.rmSync(path.join(app, 'dist', String(f)));

step('Нативные модули для Windows');
const nm = path.join(app, 'node_modules');
cp(path.join(ROOT, 'node_modules/sherpa-onnx-node'), path.join(nm, 'sherpa-onnx-node'));
const sherpaVer = JSON.parse(fs.readFileSync(path.join(ROOT, 'node_modules/sherpa-onnx-node/package.json'), 'utf8')).version;
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'kadro-pack-'));
run('npm', ['pack', `sherpa-onnx-win-x64@${sherpaVer}`, '--silent'], { cwd: tmp });
const tgz = fs.readdirSync(tmp).find((f) => f.endsWith('.tgz'));
run('tar', ['xzf', tgz], { cwd: tmp });
cp(path.join(tmp, 'package'), path.join(nm, 'sherpa-onnx-win-x64'));
const ort = path.join(ROOT, 'node_modules/onnxruntime-node');
const ortOut = path.join(nm, 'onnxruntime-node');
for (const f of ['package.json', 'LICENSE', 'README.md', 'dist']) if (fs.existsSync(path.join(ort, f))) cp(path.join(ort, f), path.join(ortOut, f));
cp(path.join(ort, 'bin/napi-v6/win32/x64'), path.join(ortOut, 'bin/napi-v6/win32/x64'));
cp(path.join(ROOT, 'node_modules/onnxruntime-common'), path.join(nm, 'onnxruntime-common'));
fs.rmSync(tmp, { recursive: true, force: true });

step('FFmpeg');
const ffTmp = fs.mkdtempSync(path.join(os.tmpdir(), 'kadro-ff-'));
run('unzip', ['-q', FFMPEG_ZIP, '-d', ffTmp]);
const ffRoot = path.join(ffTmp, fs.readdirSync(ffTmp)[0]);
fs.mkdirSync(path.join(RES, 'bin'), { recursive: true });
for (const f of fs.readdirSync(path.join(ffRoot, 'bin'))) {
  if (f === 'ffplay.exe') continue;
  fs.copyFileSync(path.join(ffRoot, 'bin', f), path.join(RES, 'bin', f));
}
fs.copyFileSync(path.join(ffRoot, 'LICENSE.txt'), path.join(RES, 'bin', 'FFMPEG-LICENSE.txt'));
fs.rmSync(ffTmp, { recursive: true, force: true });

step('Модели');
cp(path.join(ROOT, 'resources/models'), path.join(RES, 'models'));
cp(path.join(ROOT, 'resources/demo'), path.join(RES, 'demo'));
if (fs.existsSync(path.join(ROOT, 'resources/templates'))) cp(path.join(ROOT, 'resources/templates'), path.join(RES, 'templates'));
fs.copyFileSync(path.join(ROOT, 'resources/icon.png'), path.join(RES, 'icon.png'));
cp(path.join(ROOT, 'resources/icons'), path.join(RES, 'icons')); // значки разных цветов (Настройки → Значок)

step('Лицензии');
fs.writeFileSync(path.join(APP_DIR, 'NOTICE.txt'), [
  `Kadro ${pkg.version} — свободный видеоредактор. Лицензия: GNU GPL v3 или новее.`,
  '',
  'В составе программы:',
  '- Electron (MIT) — LICENSE, LICENSES.chromium.html',
  '- FFmpeg (GPL) — resources/bin/FFMPEG-LICENSE.txt, сборка BtbN/FFmpeg-Builds',
  '- ONNX Runtime (MIT), DirectML (MIT)',
  '- sherpa-onnx (Apache-2.0)',
  '- Silero VAD (MIT)',
  '- RobustVideoMatting (GPL-3.0)',
  '- RNNoise / arnndn-models (BSD-3-Clause)',
  '- Модели распознавания речи скачиваются при первом использовании: NVIDIA Parakeet TDT v3 (CC-BY-4.0), GigaAM v2 (MIT)',
  '- Шрифты Fontsource: Onest, Unbounded, Montserrat, Rubik, Russo One, Oswald, Comfortaa, Lobster, Caveat, PT Serif, Press Start 2P (SIL OFL 1.1)',
  '',
].join('\r\n'));
if (fs.existsSync(path.join(ROOT, 'LICENSE'))) fs.copyFileSync(path.join(ROOT, 'LICENSE'), path.join(APP_DIR, 'KADRO-LICENSE.txt'));

step('Значок и сведения о программе в Kadro.exe');
{
  const exePath = path.join(APP_DIR, 'Kadro.exe');
  const exe = ResEdit.NtExecutable.from(fs.readFileSync(exePath), { ignoreCert: true });
  const res = ResEdit.NtExecutableResource.from(exe);
  const ico = ResEdit.Data.IconFile.from(fs.readFileSync(path.join(ROOT, 'build/icon.ico')));
  const groups = ResEdit.Resource.IconGroupEntry.fromEntries(res.entries);
  const id = groups.length ? groups[0].id : 1;
  const lang = groups.length ? groups[0].lang : 1033;
  ResEdit.Resource.IconGroupEntry.replaceIconsForResource(res.entries, id, lang, ico.icons.map((i) => i.data));
  const vi = ResEdit.Resource.VersionInfo.fromEntries(res.entries)[0];
  const [a, b, c] = pkg.version.split('.').map(Number);
  vi.setFileVersion(a, b, c, 0, 1033);
  vi.setProductVersion(a, b, c, 0, 1033);
  const langs = vi.getAllLanguagesForStringValues();
  for (const l of langs) {
    vi.setStringValues(l, {
      CompanyName: 'yaposspall', FileDescription: 'Kadro', ProductName: 'Kadro', InternalName: 'Kadro',
      OriginalFilename: 'Kadro.exe', LegalCopyright: 'GPL-3.0-or-later', FileVersion: pkg.version, ProductVersion: pkg.version,
    });
  }
  vi.outputToResourceEntries(res.entries);
  res.outputResource(exe);
  fs.writeFileSync(exePath, Buffer.from(exe.generate()));
}

step('Установщик NSIS');
const sizeKb = Math.round(Number(execFileSync('du', ['-sk', APP_DIR], { encoding: 'utf8' }).split('\t')[0]));
const nsi = path.join(OUT, 'kadro.nsi');
const setup = path.join(OUT, `Kadro-Setup-${pkg.version}.exe`);
fs.copyFileSync(path.join(ROOT, 'build/icon.ico'), path.join(OUT, 'icon.ico'));
fs.writeFileSync(nsi, `Unicode true
ManifestDPIAware true
SetCompressor /SOLID lzma
SetCompressorDictSize 64
!include "MUI2.nsh"
!include "FileFunc.nsh"
!define APP "Kadro"
!define VER "${pkg.version}"
!define UNINST "Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\Kadro"
Name "\${APP}"
OutFile "${setup}"
InstallDir "$LOCALAPPDATA\\Programs\\Kadro"
InstallDirRegKey HKCU "Software\\Kadro" "InstallDir"
RequestExecutionLevel user
BrandingText "Kadro \${VER}"
VIProductVersion "\${VER}.0"
VIAddVersionKey "ProductName" "Kadro"
VIAddVersionKey "FileDescription" "Установка Kadro"
VIAddVersionKey "FileVersion" "\${VER}"
VIAddVersionKey "ProductVersion" "\${VER}"
VIAddVersionKey "LegalCopyright" "GPL-3.0-or-later"
!define MUI_ICON "icon.ico"
!define MUI_UNICON "icon.ico"
!define MUI_ABORTWARNING
!define MUI_FINISHPAGE_RUN "$INSTDIR\\Kadro.exe"
!define MUI_FINISHPAGE_RUN_TEXT "Запустить Kadro"
!insertmacro MUI_PAGE_WELCOME
!define MUI_PAGE_CUSTOMFUNCTION_LEAVE DirLeave
!insertmacro MUI_PAGE_DIRECTORY
!insertmacro MUI_PAGE_INSTFILES
!insertmacro MUI_PAGE_FINISH
!insertmacro MUI_UNPAGE_CONFIRM
!insertmacro MUI_UNPAGE_INSTFILES
!insertmacro MUI_LANGUAGE "Russian"

; программа всегда ставится в отдельную папку Kadro — удаление не заденет чужие файлы
Function DirLeave
  \${GetFileName} "$INSTDIR" $0
  StrCmp $0 "Kadro" +2
    StrCpy $INSTDIR "$INSTDIR\\Kadro"
FunctionEnd

Section "Kadro" SecMain
  SectionIn RO
  ; закрыть запущенный Kadro, иначе файлы заняты
  nsExec::Exec 'taskkill /IM Kadro.exe /F'
  SetOutPath "$INSTDIR"
  RMDir /r "$INSTDIR\\resources\\app"
  File /r "${APP_DIR}/*"
  WriteUninstaller "$INSTDIR\\Uninstall Kadro.exe"
  CreateShortCut "$SMPROGRAMS\\Kadro.lnk" "$INSTDIR\\Kadro.exe"
  CreateShortCut "$DESKTOP\\Kadro.lnk" "$INSTDIR\\Kadro.exe"
  WriteRegStr HKCU "Software\\Kadro" "InstallDir" "$INSTDIR"
  WriteRegStr HKCU "\${UNINST}" "DisplayName" "Kadro"
  WriteRegStr HKCU "\${UNINST}" "DisplayVersion" "\${VER}"
  WriteRegStr HKCU "\${UNINST}" "Publisher" "yaposspall"
  WriteRegStr HKCU "\${UNINST}" "DisplayIcon" "$INSTDIR\\Kadro.exe"
  WriteRegStr HKCU "\${UNINST}" "InstallLocation" "$INSTDIR"
  WriteRegStr HKCU "\${UNINST}" "UninstallString" '"$INSTDIR\\Uninstall Kadro.exe"'
  WriteRegDWORD HKCU "\${UNINST}" "NoModify" 1
  WriteRegDWORD HKCU "\${UNINST}" "NoRepair" 1
  WriteRegDWORD HKCU "\${UNINST}" "EstimatedSize" ${sizeKb}
SectionEnd

Section "Uninstall"
  nsExec::Exec 'taskkill /IM Kadro.exe /F'
  Delete "$SMPROGRAMS\\Kadro.lnk"
  Delete "$DESKTOP\\Kadro.lnk"
  RMDir /r "$INSTDIR"
  DeleteRegKey HKCU "\${UNINST}"
  DeleteRegKey HKCU "Software\\Kadro"
  ; проекты, черновик и скачанные модели (%USERPROFILE%\\.kadro) не трогаем
SectionEnd
`);
run('makensis', ['-V2', nsi], { cwd: OUT });
console.log(`\nГотово: ${setup} (${(fs.statSync(setup).size / 1e6).toFixed(1)} МБ)`);

// --portable: та же программа zip-архивом — распаковать в любую папку и запускать Kadro.exe без установки
if (process.argv.includes('--portable')) {
  step('Переносная версия (zip)');
  const name = `Kadro-${pkg.version}-portable`;
  const stage = path.join(OUT, name);
  const zipPath = path.join(OUT, `${name}.zip`);
  fs.rmSync(stage, { recursive: true, force: true });
  fs.rmSync(zipPath, { force: true });
  fs.renameSync(APP_DIR, stage);
  try {
    run('zip', ['-qr9', zipPath, name], { cwd: OUT });
  } finally {
    fs.renameSync(stage, APP_DIR);
  }
  console.log(`Готово: ${zipPath} (${(fs.statSync(zipPath).size / 1e6).toFixed(1)} МБ)`);
}
