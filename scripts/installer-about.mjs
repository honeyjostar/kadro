// Страница «О тебе» для установщиков (полного и веб-установщика), как у Telegram: язык Kadro, уровень монтажа,
// что будешь монтировать, откуда узнал. Всё можно пропустить. Ответы пишутся в %USERPROFILE%\.kadro\settings.json
// (только если Kadro на этом компьютере ещё не запускали) — Kadro при первом запуске сам включит простой режим
// новичку, подберёт формат и не будет спрашивать то же самое второй раз. Никуда не отправляется.

/** Ответы → то же, что понимает Kadro (src/shared/survey.ts, src/shared/uiMode.ts). */
const LEVELS = [
  ['new', 'Впервые', 'First time'],
  ['some', 'Уже монтировал', 'Edited before'],
  ['pro', 'Профи', 'Pro'],
];
const EDITS = [
  ['shorts', 'Шортсы, TikTok, Reels', 'Shorts, TikTok, Reels'],
  ['youtube', 'Видео для YouTube', 'YouTube videos'],
  ['games', 'Игры и стримы', 'Games and streams'],
  ['family', 'Семья и путешествия', 'Family and travel'],
  ['work', 'Работа и бизнес', 'Work and business'],
  ['study', 'Учёба', 'School'],
  ['other', 'Другое', 'Other'],
];
const SOURCES = [
  ['', '— не скажу —', '— rather not say —'],
  ['tiktok', 'TikTok', 'TikTok'], ['youtube', 'YouTube', 'YouTube'], ['telegram', 'Telegram', 'Telegram'],
  ['vk', 'ВКонтакте', 'VK'], ['friends', 'Друзья', 'Friends'], ['search', 'Поиск', 'Search'], ['github', 'GitHub', 'GitHub'], ['other', 'Другое', 'Other'],
];

/**
 * NSIS-код страницы (вставляется после MUI_LANGUAGE). withLang — со строкой «Язык Kadro» (у веб-установщика язык —
 * на первой странице, там $KLang уже выбран). Нужны: nsDialogs.nsh, LogicLib.nsh, MUI2.nsh. Даёт функции
 * AboutShow / AboutLeave (Page custom AboutShow AboutLeave) и WriteKadroSettings (вызвать после установки).
 */
export function aboutNsh({ withLang, installBtn = false }) {
  const L = (name, ru, en) => `LangString ${name} \${LANG_RUSSIAN} "${ru}"\nLangString ${name} \${LANG_ENGLISH} "${en}"`;
  const out = [];
  out.push(L('AboutTitle', 'Немного о тебе', 'A bit about you'));
  out.push(L('AboutSub', 'Всё можно пропустить', 'You can skip all of this'));
  out.push(L('AboutLang', 'Язык Kadro:', 'Kadro language:'));
  out.push(L('AboutLevel', 'Ты монтируешь:', 'Your editing experience:'));
  out.push(L('AboutEdit', 'Что будешь монтировать:', 'What you will edit:'));
  out.push(L('AboutSource', 'Откуда узнал о Kadro:', 'Where you heard about Kadro:'));
  out.push(L('AboutNote', 'Ответы остаются на твоём компьютере: новичку Kadro покажет простой режим, а формат роликов подберёт сам.', 'Your answers stay on this computer: beginners get Simple mode, and Kadro picks the video format for you.'));
  LEVELS.forEach(([id, ru, en]) => out.push(L(`Lvl_${id}`, ru, en)));
  EDITS.forEach(([id, ru, en]) => out.push(L(`Edit_${id}`, ru, en)));
  SOURCES.forEach(([id, ru, en], i) => out.push(L(`Src_${i}`, ru, en)));
  out.push('');
  out.push('Var KLang', 'Var AboutDone', 'Var KLevel', 'Var KEdit', 'Var KSource', 'Var hSource');
  if (withLang) out.push('Var hLangRu', 'Var hLangEn');
  LEVELS.forEach(([id]) => out.push(`Var hLvl_${id}`));
  EDITS.forEach(([id]) => out.push(`Var hEdit_${id}`));
  out.push(`
!macro KadroAboutInit
  StrCpy $AboutDone "0"
  StrCpy $KLevel ""
  StrCpy $KEdit ""
  StrCpy $KSource ""
  \${If} $KLang == ""
    StrCpy $KLang "en"
    \${If} $LANGUAGE == \${LANG_RUSSIAN}
      StrCpy $KLang "ru"
    \${EndIf}
  \${EndIf}
!macroend

Function AboutShow
  ; Kadro здесь уже запускали — спрашивать нечего
  \${If} \${FileExists} "$PROFILE\\.kadro\\settings.json"
    Abort
  \${EndIf}
  !insertmacro MUI_HEADER_TEXT "$(AboutTitle)" "$(AboutSub)"
  nsDialogs::Create 1018
  Pop $0
  StrCpy $1 0`);
  if (withLang) {
    out.push(`  \${NSD_CreateLabel} 0 2u 90u 10u "$(AboutLang)"
  Pop $0
  \${NSD_CreateFirstRadioButton} 92u 0 80u 12u "Русский"
  Pop $hLangRu
  \${NSD_CreateRadioButton} 176u 0 80u 12u "English"
  Pop $hLangEn
  \${If} $KLang == "ru"
    \${NSD_Check} $hLangRu
  \${Else}
    \${NSD_Check} $hLangEn
  \${EndIf}
  StrCpy $1 18`);
  }
  out.push(`  IntOp $2 $1 + 0
  \${NSD_CreateLabel} 0 $2u 100% 10u "$(AboutLevel)"
  Pop $0
  IntOp $2 $1 + 11`);
  LEVELS.forEach(([id], i) => {
    const mk = i === 0 ? 'NSD_CreateFirstRadioButton' : 'NSD_CreateRadioButton';
    out.push(`  \${${mk}} ${i * 98}u $2u 96u 12u "$(Lvl_${id})"\n  Pop $hLvl_${id}`);
  });
  out.push(`  IntOp $2 $1 + 28
  \${NSD_CreateLabel} 0 $2u 100% 10u "$(AboutEdit)"
  Pop $0`);
  EDITS.forEach(([id], i) => {
    const col = i % 3, row = Math.floor(i / 3);
    out.push(`  IntOp $2 $1 + ${39 + row * 13}\n  \${NSD_CreateCheckbox} ${col * 98}u $2u 96u 12u "$(Edit_${id})"\n  Pop $hEdit_${id}`);
  });
  const srcY = 39 + Math.ceil(EDITS.length / 3) * 13 + 4;
  out.push(`  IntOp $2 $1 + ${srcY + 2}
  \${NSD_CreateLabel} 0 $2u 110u 10u "$(AboutSource)"
  Pop $0
  IntOp $2 $1 + ${srcY}
  \${NSD_CreateDropList} 112u $2u 120u 80u ""
  Pop $hSource`);
  SOURCES.forEach((_, i) => out.push(`  \${NSD_CB_AddString} $hSource "$(Src_${i})"`));
  out.push(`  SendMessage $hSource \${CB_SETCURSEL} 0 0
  IntOp $2 $1 + ${srcY + 18}
  \${NSD_CreateLabel} 0 $2u 100% 20u "$(AboutNote)"
  Pop $0${installBtn ? `
  GetDlgItem $0 $HWNDPARENT 1
  SendMessage $0 \${WM_SETTEXT} 0 "STR:$(InstallBtn)"` : ''}
  nsDialogs::Show
FunctionEnd

Function AboutLeave
  StrCpy $AboutDone "1"`);
  if (withLang) {
    out.push(`  \${NSD_GetState} $hLangRu $0
  \${If} $0 == \${BST_CHECKED}
    StrCpy $KLang "ru"
  \${Else}
    StrCpy $KLang "en"
  \${EndIf}`);
  }
  out.push('  StrCpy $KLevel ""');
  LEVELS.forEach(([id]) => out.push(`  \${NSD_GetState} $hLvl_${id} $0\n  \${If} $0 == \${BST_CHECKED}\n    StrCpy $KLevel "${id}"\n  \${EndIf}`));
  out.push('  StrCpy $KEdit ""');
  EDITS.forEach(([id]) => out.push(`  \${NSD_GetState} $hEdit_${id} $0\n  \${If} $0 == \${BST_CHECKED}\n    \${If} $KEdit != ""\n      StrCpy $KEdit '$KEdit, '\n    \${EndIf}\n    StrCpy $KEdit '$KEdit"${id}"'\n  \${EndIf}`));
  out.push(`  SendMessage $hSource \${CB_GETCURSEL} 0 0 $0
  StrCpy $KSource ""`);
  SOURCES.forEach(([id], i) => { if (id) out.push(`  \${If} $0 == ${i}\n    StrCpy $KSource "${id}"\n  \${EndIf}`); });
  out.push(`FunctionEnd

; язык и ответы — для первого запуска Kadro (если Kadro тут ещё не запускали)
Function WriteKadroSettings
  \${If} \${FileExists} "$PROFILE\\.kadro\\settings.json"
    Return
  \${EndIf}
  CreateDirectory "$PROFILE\\.kadro"
  FileOpen $9 "$PROFILE\\.kadro\\settings.json" w
  FileWrite $9 '{"lang": "$KLang", "welcome": "pending"'
  \${If} $AboutDone == "1"
    FileWrite $9 ', "about": {"edit": [$KEdit]'
    \${If} $KLevel != ""
      FileWrite $9 ', "level": "$KLevel"'
    \${EndIf}
    \${If} $KSource != ""
      FileWrite $9 ', "source": "$KSource"'
    \${EndIf}
    FileWrite $9 ', "from": "installer"}'
  \${EndIf}
  FileWrite $9 '}'
  FileClose $9
FunctionEnd
`);
  return out.join('\n');
}
