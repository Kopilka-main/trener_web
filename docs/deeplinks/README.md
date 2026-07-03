# Deep Links (App Links / Universal Links) для привязки клиента по QR

QR у клиента кодирует ссылку `https://app.fitbond.ru/link/<accountId>`. Чтобы **родная камера** открывала тренерское приложение (а не браузер), домен `app.fitbond.ru` должен «подтвердить» связь с приложением. Для этого на домене выкладываются два файла.

## 1. Android — `assetlinks.json`

Файл: [`assetlinks.json`](./assetlinks.json)

Выложить по адресу (ровно этот путь, `Content-Type: application/json`, без редиректов, доступен без авторизации):

```
https://app.fitbond.ru/.well-known/assetlinks.json
```

Заменить `REPLACE_WITH_YOUR_APP_SIGNING_SHA256_FINGERPRINT` на SHA-256 отпечаток **того сертификата, которым подписан устанавливаемый APK/AAB**:

- **Google Play App Signing** (если публикуешь через Play): Play Console → приложение → _Test and release_ → _App integrity_ → _App signing key certificate_ → **SHA-256 certificate fingerprint**. Это фингерпринт для магазина.
- **Свой release-keystore** (сборка APK локально/CI):
  ```bash
  keytool -list -v -keystore <release.keystore> -alias <alias> -storepass <pass> | grep SHA256
  ```
- **Debug-сборка** (для проверки на dev-устройстве):
  ```bash
  keytool -list -v -keystore ~/.android/debug.keystore -alias androiddebugkey -storepass android -keypass android | grep SHA256
  ```

Можно указать НЕСКОЛЬКО отпечатков в массиве `sha256_cert_fingerprints` (например debug + release + Play) — все будут валидны.

`package_name` уже проставлен: `ru.fitbond.trener_trainer` (см. `android/app/build.gradle.kts`).

## 2. iOS — `apple-app-site-association`

Файл: [`apple-app-site-association`](./apple-app-site-association)

Выложить по адресу (**без расширения**, `Content-Type: application/json`, без редиректов, без авторизации):

```
https://app.fitbond.ru/.well-known/apple-app-site-association
```

Заменить `REPLACE_TEAMID` на свой **Apple Team ID** (Apple Developer → Membership → Team ID). `appID` = `<TeamID>.<bundleId>`; bundle id тренерского приложения возьми из Xcode (Runner → Signing) — обычно совпадает с `ru.fitbond.trener_trainer`, поправь, если другой.

В самом приложении iOS уже нужен associated-domain `applinks:app.fitbond.ru` (entitlements Runner) — добавляется на стороне мобильного приложения.

## 3. Проверка

- Android: `https://developers.google.com/digital-asset-links/tools/generator` или
  ```
  https://digitalassetlinks.googleapis.com/v1/statements:list?source.web.site=https://app.fitbond.ru&relation=delegate_permission/common.handle_all_urls
  ```
  После установки приложение проверяет `assetlinks.json` автоматически (флаг `autoVerify` в intent-filter). Если файл появился ПОСЛЕ установки — переустанови приложение или дай системе перепроверить.
- iOS: установить AASA-валидатором Apple или просто открыть ссылку на устройстве.

## Примечание

Файлы можно раздавать как статику вашего веб-сервера/CDN на `app.fitbond.ru`. Если проще — попроси, и я добавлю в API отдельные роуты `GET /.well-known/assetlinks.json` и `GET /.well-known/apple-app-site-association` (по образцу страницы `/privacy` в `apps/api/src/modules/legal`), тогда файлы будут отдаваться прямо приложением сразу после деплоя, без правки веб-сервера.
