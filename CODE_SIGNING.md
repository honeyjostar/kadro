# Code signing policy / Политика подписи кода

Free code signing provided by [SignPath.io](https://about.signpath.io/), certificate by [SignPath Foundation](https://signpath.org/).

Бесплатная подпись кода — [SignPath.io](https://about.signpath.io/), сертификат — [SignPath Foundation](https://signpath.org/).

## What is signed / Что подписывается

Only the Windows installer `Kadro-Setup-X.Y.Z.exe` and `Kadro.exe` built by the GitHub Actions workflow
[`.github/workflows/release.yml`](.github/workflows/release.yml) from this repository's source code.
Nothing built on a personal computer is signed.

Подписываются только установщик и `Kadro.exe`, собранные GitHub Actions из исходного кода этого репозитория.
Сборки с личного компьютера не подписываются.

## Team roles / Роли

- Committers and reviewers / Авторы и проверка кода: [yaposspall (@honeyjostar)](https://github.com/honeyjostar)
- Approvers / Подтверждение подписи релиза: [yaposspall (@honeyjostar)](https://github.com/honeyjostar)

Every release signing request is approved manually by the approver.

## Privacy / Конфиденциальность

Kadro does not transfer any information to other networked systems unless specifically requested by the user.
The only network requests are: checking GitHub Releases for a new version, and downloading optional AI models
from GitHub when the user first uses a feature that needs them. Videos and projects never leave the user's computer.

Kadro не передаёт данные в сеть без запроса пользователя. Единственные запросы — проверка новой версии на GitHub
и скачивание моделей ИИ с GitHub при первом использовании функции. Видео и проекты не покидают компьютер.
