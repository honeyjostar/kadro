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
// «Открыть с помощью → Kadro» для видео, фото и звука (список — как в src/main/media.ts)
const OPEN_WITH = ['mp4', 'mov', 'm4v', 'mkv', 'webm', 'avi', 'wmv', 'flv', 'mts', 'm2ts', 'ts', 'mpg', 'mpeg', '3gp', 'vob', 'mxf',
  'png', 'jpg', 'jpeg', 'webp', 'gif', 'bmp', 'heic', 'tif', 'tiff', 'mp3', 'wav', 'm4a', 'aac', 'ogg', 'opus', 'flac', 'wma'];
const regOpenWith = OPEN_WITH.map((e) => [
  `  WriteRegStr HKCU "Software\\Classes\\.${e}\\OpenWithProgids" "Kadro.Media" ""`,
  `  WriteRegStr HKCU "Software\\Classes\\Applications\\Kadro.exe\\SupportedTypes" ".${e}" ""`,
].join('\n')).join('\n');
const unregOpenWith = OPEN_WITH.map((e) => `  DeleteRegValue HKCU "Software\\Classes\\.${e}\\OpenWithProgids" "Kadro.Media"`).join('\n');

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

// перевод субтитров русский ⇄ английский — сразу в программе (остальные языки качаются при первом переводе)
if (!process.argv.includes('--no-mt')) {
  step('Модели перевода (русский ⇄ английский)');
  const base = 'https://github.com/honeyjostar/kadro/releases/download/translate-models';
  const manifest = await (await fetch(`${base}/manifest.json`)).json();
  for (const pair of ['ru-en', 'en-ru']) {
    const dir = path.join(RES, 'models', 'mt', pair);
    fs.mkdirSync(dir, { recursive: true });
    for (const f of ['encoder.onnx', 'decoder.onnx', 'decoder_with_past.onnx', 'tokenizer.json', 'config.json']) {
      const e = manifest.find((x) => x.file === `${pair}.${f}`);
      if (!e) throw new Error(`нет ${pair}.${f} в translate-models`);
      const r = await fetch(`${base}/${e.file}`);
      if (!r.ok) throw new Error(`${e.file}: HTTP ${r.status}`);
      const buf = Buffer.from(await r.arrayBuffer());
      const sha = (await import('node:crypto')).createHash('sha256').update(buf).digest('hex');
      if (sha !== e.sha256) throw new Error(`${e.file}: SHA-256 не совпал`);
      fs.writeFileSync(path.join(dir, f), buf);
      console.log(`  ${pair}/${f} ${(buf.length / 1e6).toFixed(1)} МБ`);
    }
  }
}

step('Лицензии');
cp(path.join(ROOT, 'docs/licenses'), path.join(APP_DIR, 'licenses')); // авторы и лицензии переходов gl-transitions
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
  '- gl-transitions — 123 перехода-шейдера (MIT; InvertedPageCurl — BSD-3-Clause, Hewlett-Packard; StereoViewer — BSD-2-Clause, Theodore K Schundler); авторы и тексты лицензий — licenses/gl-transitions.md',
  '- Модели распознавания речи скачиваются при первом использовании: NVIDIA Parakeet TDT v3 (CC-BY-4.0), GigaAM v2 (MIT)',
  '- Модели перевода OPUS-MT ru-en и en-ru (Helsinki-NLP, Tiedemann & Thottingal 2020; CC-BY-4.0), ONNX — Xenova; resources/models/mt',
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
// оформление установщика: боковая картинка и шапка (scripts/make-installer-art.mjs)
for (const f of ['wizard.bmp', 'header.bmp']) fs.copyFileSync(path.join(ROOT, 'resources/installer', f), path.join(OUT, f));
fs.writeFileSync(nsi, `Unicode true
ManifestDPIAware true
SetCompressor /SOLID lzma
SetCompressorDictSize 64
!include "MUI2.nsh"
!include "FileFunc.nsh"
!include "LogicLib.nsh"
!define APP "Kadro"
!define VER "${pkg.version}"
!define UNINST "Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\Kadro"
Name "\${APP}"
OutFile "${setup}"
InstallDir "$LOCALAPPDATA\\Programs\\Kadro"
InstallDirRegKey HKCU "Software\\Kadro" "InstallDir"
RequestExecutionLevel user
BrandingText "$(Branding)"
VIProductVersion "\${VER}.0"
VIAddVersionKey "ProductName" "Kadro"
VIAddVersionKey "FileDescription" "Kadro Setup"
VIAddVersionKey "FileVersion" "\${VER}"
VIAddVersionKey "ProductVersion" "\${VER}"
VIAddVersionKey "LegalCopyright" "GPL-3.0-or-later"
!define MUI_ICON "icon.ico"
!define MUI_UNICON "icon.ico"
!define MUI_ABORTWARNING
; оформление: тёмная панель с таймлайном Kadro слева, знак Kadro в шапке
!define MUI_WELCOMEFINISHPAGE_BITMAP "wizard.bmp"
!define MUI_UNWELCOMEFINISHPAGE_BITMAP "wizard.bmp"
!define MUI_HEADERIMAGE
!define MUI_HEADERIMAGE_RIGHT
!define MUI_HEADERIMAGE_BITMAP "header.bmp"
!define MUI_HEADERIMAGE_UNBITMAP "header.bmp"
!define MUI_WELCOMEPAGE_TITLE "$(WelcomeTitle)"
!define MUI_WELCOMEPAGE_TEXT "$(WelcomeText)"
!define MUI_DIRECTORYPAGE_TEXT_TOP "$(DirText)"
!define MUI_FINISHPAGE_TITLE "$(FinishTitle)"
!define MUI_FINISHPAGE_TEXT "$(FinishText)"
!define MUI_FINISHPAGE_RUN "$INSTDIR\\Kadro.exe"
!define MUI_FINISHPAGE_RUN_TEXT "$(RunText)"
!define MUI_FINISHPAGE_LINK "$(GuideText)"
!define MUI_FINISHPAGE_LINK_LOCATION "$(GuideUrl)"
!define MUI_FINISHPAGE_LINK_COLOR "D81B60"
; обновление из самого Kadro (ключ /UPDATE): без приветствия и выбора папки — только полоска установки,
; потом сразу открывается новый Kadro
!define MUI_PAGE_CUSTOMFUNCTION_PRE SkipOnUpdate
!insertmacro MUI_PAGE_WELCOME
!define MUI_PAGE_CUSTOMFUNCTION_PRE SkipOnUpdate
!define MUI_PAGE_CUSTOMFUNCTION_LEAVE DirLeave
!insertmacro MUI_PAGE_DIRECTORY
!insertmacro MUI_PAGE_INSTFILES
!define MUI_PAGE_CUSTOMFUNCTION_PRE FinishOnUpdate
!insertmacro MUI_PAGE_FINISH
!insertmacro MUI_UNPAGE_CONFIRM
!insertmacro MUI_UNPAGE_INSTFILES
; первый — язык по умолчанию; русский Windows (и украинский, белорусский, казахский) — по-русски
!insertmacro MUI_LANGUAGE "English"
!insertmacro MUI_LANGUAGE "Russian"
LangString Branding \${LANG_ENGLISH} "Kadro \${VER} — free video editor"
LangString Branding \${LANG_RUSSIAN} "Kadro \${VER} — бесплатный видеоредактор"
LangString WelcomeTitle \${LANG_ENGLISH} "Kadro \${VER} Setup"
LangString WelcomeTitle \${LANG_RUSSIAN} "Установка Kadro \${VER}"
LangString WelcomeText \${LANG_ENGLISH} "A free video editor for Windows: editing, Auto Video to the music, captions and AI tools — no watermark, everything runs on your computer.$\\r$\\n$\\r$\\nSetup takes about a minute and needs no administrator rights. If Kadro is already installed, it will be updated — projects and settings are kept.$\\r$\\n$\\r$\\nClick Next."
LangString WelcomeText \${LANG_RUSSIAN} "Бесплатный видеоредактор для Windows: монтаж, авто-ролик под музыку, субтитры и ИИ-инструменты — без водяного знака, всё работает на твоём компьютере.$\\r$\\n$\\r$\\nУстановка займёт около минуты, права администратора не нужны. Если Kadro уже стоит, он обновится — проекты и настройки сохранятся.$\\r$\\n$\\r$\\nНажми «Далее»."
LangString DirText \${LANG_ENGLISH} "Kadro will be installed in this folder. Usually there's no need to change it — click Install."
LangString DirText \${LANG_RUSSIAN} "Kadro будет установлен в эту папку. Обычно её менять не нужно — нажми «Установить»."
LangString FinishTitle \${LANG_ENGLISH} "Kadro is installed"
LangString FinishTitle \${LANG_RUSSIAN} "Kadro установлен"
LangString FinishText \${LANG_ENGLISH} "The shortcut is on the desktop and in the Start menu.$\\r$\\n$\\r$\\nOpen videos from Explorer with “Open with”, and .kadro projects with a double-click."
LangString FinishText \${LANG_RUSSIAN} "Ярлык — на рабочем столе и в меню «Пуск».$\\r$\\n$\\r$\\nВидео открываются из Проводника через «Открыть с помощью», проекты .kadro — двойным щелчком."
LangString RunText \${LANG_ENGLISH} "Run Kadro"
LangString RunText \${LANG_RUSSIAN} "Запустить Kadro"
LangString GuideText \${LANG_ENGLISH} "Guide: how to use Kadro"
LangString GuideText \${LANG_RUSSIAN} "Руководство: как пользоваться Kadro"
LangString GuideUrl \${LANG_ENGLISH} "https://github.com/honeyjostar/kadro/blob/master/README.en.md"
LangString GuideUrl \${LANG_RUSSIAN} "https://github.com/honeyjostar/kadro/blob/master/docs/GUIDE.md"
LangString ProjType \${LANG_ENGLISH} "Kadro project"
LangString ProjType \${LANG_RUSSIAN} "Проект Kadro"
LangString MediaType \${LANG_ENGLISH} "Media file"
LangString MediaType \${LANG_RUSSIAN} "Медиафайл"

Var UPDATE
Function .onInit
  ; украинский, белорусский, казахский Windows — установщик по-русски (английский — для остальных не-русских)
  System::Call 'kernel32::GetUserDefaultUILanguage() i .r9'
  \${If} $9 == 1058
  \${OrIf} $9 == 1059
  \${OrIf} $9 == 1087
    StrCpy $LANGUAGE \${LANG_RUSSIAN}
  \${EndIf}
  StrCpy $UPDATE "0"
  \${GetParameters} $0
  ClearErrors
  \${GetOptions} $0 "/UPDATE" $1
  \${IfNot} \${Errors}
    StrCpy $UPDATE "1"
  \${EndIf}
FunctionEnd

Function SkipOnUpdate
  \${If} $UPDATE == "1"
    Abort
  \${EndIf}
FunctionEnd

Function FinishOnUpdate
  \${If} $UPDATE == "1"
    Exec '"$INSTDIR\\Kadro.exe"'
    Abort
  \${EndIf}
FunctionEnd

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
  ; проекты .kadro открываются двойным щелчком, видео — «Открыть с помощью → Kadro»
  WriteRegStr HKCU "Software\\Classes\\.kadro" "" "Kadro.Project"
  WriteRegStr HKCU "Software\\Classes\\Kadro.Project" "" "$(ProjType)"
  WriteRegStr HKCU "Software\\Classes\\Kadro.Project\\DefaultIcon" "" "$INSTDIR\\Kadro.exe,0"
  WriteRegStr HKCU "Software\\Classes\\Kadro.Project\\shell\\open\\command" "" '"$INSTDIR\\Kadro.exe" "%1"'
  WriteRegStr HKCU "Software\\Classes\\Kadro.Media" "" "$(MediaType)"
  WriteRegStr HKCU "Software\\Classes\\Kadro.Media\\DefaultIcon" "" "$INSTDIR\\Kadro.exe,0"
  WriteRegStr HKCU "Software\\Classes\\Kadro.Media\\shell\\open\\command" "" '"$INSTDIR\\Kadro.exe" "%1"'
  WriteRegStr HKCU "Software\\Classes\\Applications\\Kadro.exe\\shell\\open\\command" "" '"$INSTDIR\\Kadro.exe" "%1"'
${regOpenWith}
  System::Call 'shell32::SHChangeNotify(i 0x08000000, i 0, p 0, p 0)'
SectionEnd

Section "Uninstall"
  nsExec::Exec 'taskkill /IM Kadro.exe /F'
  Delete "$SMPROGRAMS\\Kadro.lnk"
  Delete "$DESKTOP\\Kadro.lnk"
  RMDir /r "$INSTDIR"
  DeleteRegKey HKCU "\${UNINST}"
  DeleteRegKey HKCU "Software\\Kadro"
  DeleteRegKey HKCU "Software\\Classes\\.kadro"
  DeleteRegKey HKCU "Software\\Classes\\Kadro.Project"
  DeleteRegKey HKCU "Software\\Classes\\Kadro.Media"
  DeleteRegKey HKCU "Software\\Classes\\Applications\\Kadro.exe"
${unregOpenWith}
  System::Call 'shell32::SHChangeNotify(i 0x08000000, i 0, p 0, p 0)'
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
