// Маленький веб-установщик (как у Telegram): выбор языка Kadro → скачивает последний Kadro-Setup с GitHub
// (сверяет SHA-256 по SHA256SUMS.txt того же релиза) → ставит его ключом /UPDATE (только полоска) → Kadro открывается.
// Всегда берёт последний релиз, поэтому старая копия веб-установщика тоже ставит свежий Kadro.
//   node scripts/pack-web-setup.mjs            → release/Kadro-Web-Setup.exe (нужен makensis)
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { aboutNsh } from './installer-about.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'release');
const WORK = path.join(OUT, 'web-setup');
const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
const REPO = 'honeyjostar/kadro';
fs.mkdirSync(WORK, { recursive: true });
for (const [from, to] of [['build/icon.ico', 'icon.ico'], ['resources/installer/header.bmp', 'header.bmp'], ['resources/installer/web-logo.bmp', 'logo.bmp']]) {
  fs.copyFileSync(path.join(ROOT, from), path.join(WORK, to));
}

// скачивание — PowerShell (есть в любой Windows 10/11): TLS 1.2, ход — в файлы, которые читает окно установщика
fs.writeFileSync(path.join(WORK, 'dl.ps1'), `param([string]$Notes, [string]$Dest)
$ErrorActionPreference = 'Stop'
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
$base = 'https://github.com/${REPO}/releases/latest/download'
function Note($f, $t) { try { Set-Content -LiteralPath (Join-Path $Notes $f) -Value $t -Encoding ASCII } catch {} }
try {
  $wc = New-Object Net.WebClient
  $wc.Headers.Add('User-Agent', 'Kadro-Web-Setup')
  $sums = $wc.DownloadString("$base/SHA256SUMS.txt")
  $line = ($sums -split "\`n") | Where-Object { $_ -match 'Kadro-Setup-[0-9.]+\\.exe' } | Select-Object -First 1
  if (-not $line) { throw 'no installer in SHA256SUMS.txt' }
  $parts = $line.Trim() -split '\\s+'
  $hash = $parts[0].ToLower()
  $name = $parts[-1].TrimStart('*')
  $req = [Net.HttpWebRequest]::Create("$base/$name")
  $req.UserAgent = 'Kadro-Web-Setup'
  $res = $req.GetResponse()
  Note 'size.txt' $res.ContentLength
  $in = $res.GetResponseStream()
  $file = Join-Path $Dest $name
  $fs = [IO.File]::Create($file)
  $buf = New-Object byte[] 262144
  $got = 0
  $last = [DateTime]::Now
  while (($n = $in.Read($buf, 0, $buf.Length)) -gt 0) {
    $fs.Write($buf, 0, $n)
    $got += $n
    if (([DateTime]::Now - $last).TotalMilliseconds -gt 250) {
      Note 'got.txt' $got
      $last = [DateTime]::Now
      if (Test-Path -LiteralPath (Join-Path $Notes 'cancel.txt')) { throw 'cancelled' }
    }
  }
  $fs.Close(); $in.Close(); $res.Close()
  Note 'got.txt' $got
  $h = (Get-FileHash -LiteralPath $file -Algorithm SHA256).Hash.ToLower()
  if ($h -ne $hash) { Remove-Item -LiteralPath $file -Force; throw 'checksum mismatch' }
  Note 'file.txt' $file
  Note 'done.txt' 'ok'
} catch {
  Note 'done.txt' ('error: ' + $_.Exception.Message)
}
`);

const out = path.join(OUT, 'Kadro-Web-Setup.exe');
// Kadro — только для 64-битной Windows, установщик тоже 64-битный
fs.writeFileSync(path.join(WORK, 'web.nsi'), `Target amd64-unicode
ManifestDPIAware true
SetCompressor /SOLID lzma
!include "MUI2.nsh"
!include "nsDialogs.nsh"
!include "LogicLib.nsh"
!include "WinMessages.nsh"
Name "Kadro"
Caption "Kadro"
OutFile "${out}"
RequestExecutionLevel user
BrandingText "$(Branding)"
VIProductVersion "${pkg.version}.0"
VIAddVersionKey "ProductName" "Kadro"
VIAddVersionKey "FileDescription" "Kadro Web Setup"
VIAddVersionKey "FileVersion" "${pkg.version}"
VIAddVersionKey "ProductVersion" "${pkg.version}"
VIAddVersionKey "LegalCopyright" "GPL-3.0-or-later"
!define MUI_ICON "icon.ico"
!define MUI_HEADERIMAGE
!define MUI_HEADERIMAGE_RIGHT
!define MUI_HEADERIMAGE_BITMAP "header.bmp"
!define MUI_CUSTOMFUNCTION_ABORT OnAbort
Page custom HelloShow HelloLeave
Page custom AboutShow AboutLeave
Page custom LoadShow LoadLeave
!insertmacro MUI_LANGUAGE "English"
!insertmacro MUI_LANGUAGE "Russian"
LangString Branding \${LANG_ENGLISH} "Kadro — free video editor"
LangString Branding \${LANG_RUSSIAN} "Kadro — бесплатный видеоредактор"
LangString HelloTitle \${LANG_ENGLISH} "Install Kadro"
LangString HelloTitle \${LANG_RUSSIAN} "Установка Kadro"
LangString HelloSub \${LANG_ENGLISH} "The latest version is downloaded from GitHub"
LangString HelloSub \${LANG_RUSSIAN} "Свежая версия скачается с GitHub"
LangString Tagline \${LANG_ENGLISH} "Free video editor for Windows: no watermark, no subscription, AI runs on your computer."
LangString Tagline \${LANG_RUSSIAN} "Бесплатный видеоредактор для Windows: без водяного знака и подписки, ИИ работает на твоём компьютере."
LangString LangBox \${LANG_ENGLISH} "Kadro interface language"
LangString LangBox \${LANG_RUSSIAN} "Язык Kadro"
LangString Note \${LANG_ENGLISH} "About 350 MB will be downloaded. No administrator rights needed. If Kadro is already installed, it will be updated — projects and settings stay."
LangString Note \${LANG_RUSSIAN} "Скачается около 350 МБ. Права администратора не нужны. Если Kadro уже стоит, он обновится — проекты и настройки останутся."
LangString InstallBtn \${LANG_ENGLISH} "Install"
LangString InstallBtn \${LANG_RUSSIAN} "Установить"
LangString LoadTitle \${LANG_ENGLISH} "Downloading Kadro"
LangString LoadTitle \${LANG_RUSSIAN} "Скачиваю Kadro"
LangString LoadSub \${LANG_ENGLISH} "Kadro opens by itself when it's ready"
LangString LoadSub \${LANG_RUSSIAN} "Когда всё будет готово, Kadro откроется сам"
LangString Connecting \${LANG_ENGLISH} "Connecting to GitHub…"
LangString Connecting \${LANG_RUSSIAN} "Подключаюсь к GitHub…"
LangString Downloading \${LANG_ENGLISH} "Downloaded"
LangString Downloading \${LANG_RUSSIAN} "Скачано"
LangString MB \${LANG_ENGLISH} "MB"
LangString MB \${LANG_RUSSIAN} "МБ"
LangString Installing \${LANG_ENGLISH} "Checked. Installing…"
LangString Installing \${LANG_RUSSIAN} "Проверено. Устанавливаю…"
LangString Failed \${LANG_ENGLISH} "Couldn't download Kadro. Check the internet connection and try again, or download the full installer from the Kadro page on GitHub."
LangString Failed \${LANG_RUSSIAN} "Не получилось скачать Kadro. Проверь интернет и попробуй ещё раз или скачай полный установщик со страницы Kadro на GitHub."
LangString Manual \${LANG_ENGLISH} "Open the download page"
LangString Manual \${LANG_RUSSIAN} "Открыть страницу загрузки"

${aboutNsh({ withLang: false, installBtn: true })}

Var RuRadio
Var EnRadio
Var Logo
Var Bar
Var Status
Var Started
Var Ticks

Function .onInit
  InitPluginsDir
  File "/oname=$PLUGINSDIR\\dl.ps1" "dl.ps1"
  File "/oname=$PLUGINSDIR\\logo.bmp" "logo.bmp"
  StrCpy $KLang "en"
  StrCpy $Started "0"
  StrCpy $Ticks "0"
  ; русский, украинский, белорусский, казахский Windows — по-русски
  System::Call 'kernel32::GetUserDefaultUILanguage() i .r9'
  \${If} $9 == 1049
  \${OrIf} $9 == 1058
  \${OrIf} $9 == 1059
  \${OrIf} $9 == 1087
    StrCpy $LANGUAGE \${LANG_RUSSIAN}
    StrCpy $KLang "ru"
  \${EndIf}
  !insertmacro KadroAboutInit
FunctionEnd

Function HelloShow
  !insertmacro MUI_HEADER_TEXT "$(HelloTitle)" "$(HelloSub)"
  nsDialogs::Create 1018
  Pop $0
  \${NSD_CreateBitmap} 0 0 56u 56u ""
  Pop $0
  \${NSD_SetImage} $0 "$PLUGINSDIR\\logo.bmp" $Logo
  \${NSD_CreateLabel} 66u 2u 230u 14u "Kadro"
  Pop $0
  CreateFont $1 "Segoe UI" 16 700
  SendMessage $0 \${WM_SETFONT} $1 1
  \${NSD_CreateLabel} 66u 20u 230u 30u "$(Tagline)"
  Pop $0
  \${NSD_CreateGroupBox} 0 62u 100% 40u "$(LangBox)"
  Pop $0
  \${NSD_CreateRadioButton} 10u 75u 110u 12u "Русский"
  Pop $RuRadio
  \${NSD_CreateRadioButton} 130u 75u 110u 12u "English"
  Pop $EnRadio
  \${If} $KLang == "ru"
    \${NSD_Check} $RuRadio
  \${Else}
    \${NSD_Check} $EnRadio
  \${EndIf}
  \${NSD_CreateLabel} 0 110u 100% 30u "$(Note)"
  Pop $0
  ; Kadro тут уже запускали — страницы «О тебе» не будет, отсюда сразу установка
  \${If} \${FileExists} "$PROFILE\\.kadro\\settings.json"
    GetDlgItem $0 $HWNDPARENT 1
    SendMessage $0 \${WM_SETTEXT} 0 "STR:$(InstallBtn)"
  \${EndIf}
  nsDialogs::Show
  \${NSD_FreeImage} $Logo
FunctionEnd

Function HelloLeave
  \${NSD_GetState} $RuRadio $0
  \${If} $0 == \${BST_CHECKED}
    StrCpy $KLang "ru"
  \${Else}
    StrCpy $KLang "en"
  \${EndIf}
FunctionEnd

Function LoadShow
  !insertmacro MUI_HEADER_TEXT "$(LoadTitle)" "$(LoadSub)"
  nsDialogs::Create 1018
  Pop $0
  \${NSD_CreateLabel} 0 8u 100% 24u "$(Connecting)"
  Pop $Status
  \${NSD_CreateProgressBar} 0 36u 100% 12u ""
  Pop $Bar
  SendMessage $Bar \${PBM_SETRANGE32} 0 1000
  GetDlgItem $0 $HWNDPARENT 1
  EnableWindow $0 0
  GetDlgItem $0 $HWNDPARENT 3
  ShowWindow $0 \${SW_HIDE}
  \${If} $Started == "0"
    StrCpy $Started "1"
    ExecShell "open" "powershell.exe" '-NoProfile -ExecutionPolicy Bypass -File "$PLUGINSDIR\\dl.ps1" -Notes "$PLUGINSDIR" -Dest "$TEMP"' SW_HIDE
  \${EndIf}
  \${NSD_CreateTimer} OnTick 300
  nsDialogs::Show
FunctionEnd

Function LoadLeave
FunctionEnd

Function OnTick
  IfFileExists "$PLUGINSDIR\\done.txt" finished
  ; PowerShell не запустился (запрещён политикой и т. п.) — через минуту без ответа сдаёмся
  IntOp $Ticks $Ticks + 1
  \${If} $Ticks > 200
  \${AndIfNot} \${FileExists} "$PLUGINSDIR\\size.txt"
    FileOpen $0 "$PLUGINSDIR\\done.txt" w
    FileWrite $0 "error: PowerShell did not start"
    FileClose $0
    Goto finished
  \${EndIf}
  ClearErrors
  FileOpen $0 "$PLUGINSDIR\\size.txt" r
  IfErrors tickEnd
  FileRead $0 $1
  FileClose $0
  ClearErrors
  FileOpen $0 "$PLUGINSDIR\\got.txt" r
  IfErrors tickEnd
  FileRead $0 $2
  FileClose $0
  IntOp $1 $1 + 0
  IntOp $2 $2 + 0
  IntOp $3 $1 / 1000
  \${If} $3 > 0
    IntOp $4 $2 / $3
    SendMessage $Bar \${PBM_SETPOS} $4 0
    IntOp $5 $2 / 1048576
    IntOp $6 $1 / 1048576
    \${NSD_SetText} $Status "$(Downloading) $5 / $6 $(MB)"
  \${EndIf}
  tickEnd:
  Return
  finished:
  \${NSD_KillTimer} OnTick
  FileOpen $0 "$PLUGINSDIR\\done.txt" r
  FileRead $0 $1
  FileClose $0
  StrCpy $2 $1 2
  \${If} $2 == "ok"
    SendMessage $Bar \${PBM_SETPOS} 1000 0
    \${NSD_SetText} $Status "$(Installing)"
    ; язык и ответы «О тебе» — для первого запуска Kadro
    Call WriteKadroSettings
    FileOpen $0 "$PLUGINSDIR\\file.txt" r
    FileRead $0 $4
    FileClose $0
    ; убрать перевод строки в конце
    trimLoop:
      StrCpy $5 $4 1 -1
      StrCmp $5 "$\\n" trimIt
      StrCmp $5 "$\\r" trimIt trimDone
    trimIt:
      StrCpy $4 $4 -1
      Goto trimLoop
    trimDone:
    ; полный установщик в режиме обновления: только полоска, потом сам открывает Kadro
    Exec '"$4" /UPDATE'
    Quit
  \${Else}
    \${NSD_SetText} $Status "$(Failed)"
    MessageBox MB_YESNO|MB_ICONEXCLAMATION "$(Failed)$\\r$\\n$\\r$\\n$1$\\r$\\n$(Manual)?" IDNO +2
      ExecShell "open" "https://github.com/${REPO}/releases/latest"
    Quit
  \${EndIf}
FunctionEnd

Function OnAbort
  ; скачивание остановится само
  FileOpen $0 "$PLUGINSDIR\\cancel.txt" w
  FileClose $0
  Sleep 400
FunctionEnd

Section "-Kadro"
SectionEnd
`);
execFileSync('makensis', ['-V2', path.join(WORK, 'web.nsi')], { cwd: WORK, stdio: 'inherit' });
console.log(`Готово: ${out} (${(fs.statSync(out).size / 1024).toFixed(0)} КБ)`);
