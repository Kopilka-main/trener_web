import Flutter
import UIKit
import FirebaseMessaging

@main
@objc class AppDelegate: FlutterAppDelegate, FlutterImplicitEngineDelegate {
  // Статус регистрации в APNs — прокидывается в Dart-диагностику через
  // MethodChannel "push_native", чтобы видеть причину отказа Apple на устройстве.
  static var apnsStatus: String = "регистрация ещё не завершилась"

  override func application(
    _ application: UIApplication,
    didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]?
  ) -> Bool {
    let result = super.application(application, didFinishLaunchingWithOptions: launchOptions)
    // Явно запускаем регистрацию в APNs: под новым UIScene-циклом Flutter
    // firebase_messaging может не вызвать это сам, и APNs-токен не выдаётся.
    application.registerForRemoteNotifications()
    return result
  }

  // APNs-токен получен — передаём в Firebase явно (swizzling под UIScene ненадёжен).
  override func application(
    _ application: UIApplication,
    didRegisterForRemoteNotificationsWithDeviceToken deviceToken: Data
  ) {
    Messaging.messaging().apnsToken = deviceToken
    AppDelegate.apnsStatus = "OK (\(deviceToken.count) байт)"
    super.application(application, didRegisterForRemoteNotificationsWithDeviceToken: deviceToken)
  }

  // Apple отказала в регистрации — сохраняем причину (например, нет
  // aps-environment entitlement в рантайме = проблема профиля подписи).
  override func application(
    _ application: UIApplication,
    didFailToRegisterForRemoteNotificationsWithError error: Error
  ) {
    AppDelegate.apnsStatus = "FAIL: \(error.localizedDescription)"
    super.application(application, didFailToRegisterForRemoteNotificationsWithError: error)
  }

  func didInitializeImplicitFlutterEngine(_ engineBridge: FlutterImplicitEngineBridge) {
    GeneratedPluginRegistrant.register(with: engineBridge.pluginRegistry)
    if let messenger = engineBridge.pluginRegistry
      .registrar(forPlugin: "PushNativeDiag")?.messenger() {
      let channel = FlutterMethodChannel(name: "push_native", binaryMessenger: messenger)
      channel.setMethodCallHandler { call, reply in
        if call.method == "apnsStatus" {
          reply(AppDelegate.apnsStatus)
        } else {
          reply(FlutterMethodNotImplemented)
        }
      }
    }
  }
}
