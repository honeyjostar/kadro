#!/usr/bin/env bash
# Подписанный SignPath файл — на место неподписанного (release.yml). Подпись не пришла (заявку не подтвердили
# вовремя, отклонили, сбой) — остаётся неподписанный файл, выпуск идёт как раньше, в сборке предупреждение.
# use-signed.sh <подписанный> <куда>
set -u
SIGNED=$1
DEST=$2
NAME=$(basename "$DEST")
if [ ! -f "$SIGNED" ]; then
  echo "::warning title=Без подписи::$NAME не подписан (SignPath не вернул файл) — выходит без подписи"
  exit 0
fi
# подпись в файле есть (цепочку до корневого сертификата здесь не проверить — хватит того, что она читается)
if ! osslsigncode verify -in "$SIGNED" > verify.txt 2>&1 && ! grep -q "Signature Index" verify.txt; then
  cat verify.txt
  echo "::warning title=Без подписи::у $NAME от SignPath не читается подпись — выходит без подписи"
  rm -f verify.txt
  exit 0
fi
grep -E "Subject:|Issuer:|Signing time|Message digest" verify.txt | head -8 || true
rm -f verify.txt
cp -f "$SIGNED" "$DEST"
echo "$NAME подписан"
