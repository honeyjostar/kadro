#!/bin/bash
# Проверка веб-установщика на Linux: mono рисует то же окно, сервер на 127.0.0.1 изображает релиз GitHub.
#   bash scripts/test-web-setup.sh [папка для снимков]
# Нужны: mono-mcs, libmono-system-windows-forms4.0-cil, binutils-mingw-w64-x86-64, xvfb, xdotool, imagemagick, python3.
# 1) новичок: Дальше → «О тебе» с клавиатуры (Впервые, Шортсы, Telegram) → Установить → скачивание → тихая установка (/S)
#    → «Готово»; settings.json — с ответами; 2) Kadro тут уже запускали + битый файл: сразу «Установить», ошибка,
#    установщик не запускается, настройки не тронуты.
set -euo pipefail
ROOT=$(cd "$(dirname "$0")/.." && pwd)
if [ -z "${INNER:-}" ]; then
  node "$ROOT/scripts/pack-web-setup.mjs" --test >/dev/null
  exec env INNER=1 xvfb-run -a -s "-screen 0 1280x800x24" bash "$0" "$@"
fi
EXE=$ROOT/release/web-setup/Kadro-Web-Setup-test.exe
T=$(mktemp -d)
OUT=${1:-$T/shots}
mkdir -p "$OUT" "$T/srv"
trap 'kill $(jobs -p) 2>/dev/null || true; rm -rf "$T/home" "$T/srv"' EXIT

# «полный установщик»: запоминает ключи, ставит пустой Kadro.exe, выходит с 0
cat > "$T/fake.cs" <<'EOF'
using System; using System.IO;
class F { static int Main(string[] a) {
  var home = Environment.GetEnvironmentVariable("HOME");
  File.WriteAllText(Path.Combine(home, "setup-args.txt"), string.Join(" ", a));
  System.Threading.Thread.Sleep(1500);
  var dir = Path.Combine(home, ".local/share/Programs/Kadro");
  Directory.CreateDirectory(dir); File.WriteAllText(Path.Combine(dir, "Kadro.exe"), "x");
  return 0; } }
EOF
mcs -nologo -out:"$T/srv/Kadro-Setup-9.9.9.exe" "$T/fake.cs"
head -c 2000000 /dev/urandom >> "$T/srv/Kadro-Setup-9.9.9.exe"
(cd "$T/srv" && sha256sum Kadro-Setup-9.9.9.exe > SHA256SUMS.txt && echo "0000  Kadro-Portable.zip" >> SHA256SUMS.txt)
cat > "$T/serve.py" <<'EOF'
import http.server, sys, time
class H(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *a, **k): super().__init__(*a, directory=sys.argv[1], **k)
    def copyfile(self, src, dst):
        while (b := src.read(65536)):
            dst.write(b); dst.flush(); time.sleep(0.03)
    def log_message(self, *a): pass
http.server.ThreadingHTTPServer(('127.0.0.1', int(sys.argv[2])), H).serve_forever()
EOF
python3 "$T/serve.py" "$T/srv" 8765 &
export KADRO_SETUP_BASE=http://127.0.0.1:8765 KADRO_SETUP_NO_LAUNCH=1 LANG=ru_RU.UTF-8 HOME=$T/home

fresh() {
  rm -rf "$HOME"; mkdir -p "$HOME/.fonts"
  # mono рисует шрифты из коллекции квадратиками — даём их системе
  cp "$ROOT"/resources/installer/fonts/*.ttf "$HOME/.fonts/"; fc-cache -f "$HOME/.fonts" >/dev/null 2>&1 || true
}
open_app() {
  mono "$EXE" >"$T/app.log" 2>&1 &
  APP=$!
  for _ in $(seq 40); do W=$(xdotool search --name '^Kadro$' 2>/dev/null | head -1 || true); [ -n "$W" ] && break; sleep 0.25; done
  [ -n "$W" ] || { echo "окно не открылось"; cat "$T/app.log"; exit 1; }
  sleep 1
  eval "$(xdotool getwindowgeometry --shell "$W")"
}
shot() { import -window root -crop "${WIDTH}x${HEIGHT}+$X+$Y" +repage "$OUT/$1.png"; }
keys() { for k in "$@"; do xdotool key --window "$W" "$k" 2>/dev/null; sleep 0.15; done; }
fail() { echo "ОШИБКА: $*"; exit 1; }

# 1) новичок
fresh
open_app
shot 1-hello
keys Return
sleep 0.6
# Tab-порядок: уровни (3), что монтируешь (7), откуда узнал (8), Установить
keys Tab space Tab Tab Tab space Tab Tab Tab Tab Tab Tab Tab Tab Tab space
shot 2-about
keys Tab Tab Tab Tab Tab Tab Return
sleep 1
shot 3-load
for _ in $(seq 60); do [ -f "$HOME/setup-args.txt" ] && break; sleep 0.25; done
sleep 2.5
shot 4-done
want='{"lang": "ru", "welcome": "pending", "about": {"edit": ["shorts"], "level": "new", "source": "telegram", "from": "installer"}}'
got=$(cat "$HOME/.kadro/settings.json" 2>/dev/null || true)
[ "$got" = "$want" ] || fail "settings.json: $got"
[ "$(cat "$HOME/setup-args.txt")" = "/S" ] || fail "ключи установщика: $(cat "$HOME/setup-args.txt")"
sleep 3
kill -0 $APP 2>/dev/null && fail "окно не закрылось само после запуска Kadro"
echo "ok: новичок — ответы записаны, установка тихая, окно закрылось"

# 2) Kadro уже запускали, файл битый
fresh
mkdir -p "$HOME/.kadro"; echo '{"lang": "en", "recent": []}' > "$HOME/.kadro/settings.json"
echo x >> "$T/srv/Kadro-Setup-9.9.9.exe"
open_app
shot 5-known
keys Return
sleep 4
shot 6-error
[ -f "$HOME/setup-args.txt" ] && fail "битый файл всё равно запущен"
[ "$(cat "$HOME/.kadro/settings.json")" = '{"lang": "en", "recent": []}' ] || fail "настройки тронуты"
ls /tmp/Kadro-Web-Setup/Kadro-Setup-9.9.9.exe 2>/dev/null && fail "битый файл не удалён"
kill $APP 2>/dev/null || true
echo "ok: битый файл — ошибка, установщик не запускался, настройки целы"
echo "снимки: $OUT"
