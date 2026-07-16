import ExpoModulesCore
import Foundation
import UIKit
import YooKassaPayments

public final class GafusYooKassaPaymentsModule: Module, TokenizationModuleOutput {
  private weak var tokenizationModule: TokenizationModuleInput?
  private weak var tokenizationViewController: UIViewController?
  private var tokenizePromise: Promise?
  private var confirmationPromise: Promise?

  public func definition() -> ModuleDefinition {
    Name("GafusYooKassaPayments")

    AsyncFunction("tokenize") {
      (
        amount: Double,
        currency: String,
        title: String,
        subtitle: String,
        clientApplicationKey: String,
        shopId: String,
        promise: Promise
      ) in
      guard self.tokenizePromise == nil, self.confirmationPromise == nil else {
        promise.reject("E_YOOKASSA_BUSY", "Другой платёж ЮKassa уже выполняется")
        return
      }
      guard let presenter = self.appContext?.utilities?.currentViewController() else {
        promise.reject("E_NO_VIEW_CONTROLLER", "Экран приложения сейчас недоступен")
        return
      }
      guard let sdkCurrency = Currency(rawValue: currency) else {
        promise.reject("E_UNSUPPORTED_CURRENCY", "ЮKassa не поддерживает валюту \(currency)")
        return
      }

      let inputData = TokenizationModuleInputData(
        clientApplicationKey: clientApplicationKey,
        shopName: title,
        shopId: shopId,
        purchaseDescription: subtitle,
        amount: Amount(value: Decimal(amount), currency: sdkCurrency),
        tokenizationSettings: TokenizationSettings(paymentMethodTypes: .sbp),
        savePaymentMethod: .on,
        applicationScheme: "gafus://",
        lang: "ru"
      )
      let viewController = TokenizationAssembly.makeModule(
        inputData: .tokenization(inputData),
        moduleOutput: self
      )
      self.tokenizePromise = promise
      self.tokenizationModule = viewController
      self.tokenizationViewController = viewController
      presenter.present(viewController, animated: true)
    }
    .runOnQueue(.main)

    AsyncFunction("confirm") {
      (
        confirmationUrl: String,
        _clientApplicationKey: String,
        _shopId: String,
        promise: Promise
      ) in
      guard self.confirmationPromise == nil else {
        promise.reject("E_YOOKASSA_BUSY", "Подтверждение ЮKassa уже выполняется")
        return
      }
      guard let module = self.tokenizationModule else {
        promise.reject("E_TOKENIZATION_CONTEXT_LOST", "Экран ЮKassa был закрыт до подтверждения")
        return
      }
      self.confirmationPromise = promise
      module.startConfirmationProcess(
        confirmationUrl: confirmationUrl,
        paymentMethodType: .sbp
      )
    }
    .runOnQueue(.main)

    AsyncFunction("close") {
      self.dismissSdk()
    }
    .runOnQueue(.main)

    OnDestroy {
      self.tokenizePromise?.reject("E_MODULE_DESTROYED", "Модуль оплаты был закрыт")
      self.confirmationPromise?.reject("E_MODULE_DESTROYED", "Модуль оплаты был закрыт")
      self.tokenizePromise = nil
      self.confirmationPromise = nil
      self.tokenizationModule = nil
      self.tokenizationViewController = nil
    }
  }

  public func tokenizationModule(
    _ module: TokenizationModuleInput,
    didTokenize token: Tokens,
    paymentMethodType: PaymentMethodType
  ) {
    guard let promise = tokenizePromise else { return }
    tokenizePromise = nil
    guard paymentMethodType == .sbp else {
      promise.reject("E_UNEXPECTED_PAYMENT_METHOD", "Разрешена только оплата через СБП")
      dismissSdk()
      return
    }
    promise.resolve([
      "status": "success",
      "paymentToken": token.paymentToken,
      "paymentMethodType": "SBP",
    ])
  }

  public func didFinishConfirmation(paymentMethodType: PaymentMethodType) {
    confirmationPromise?.resolve(["status": "completed"])
    confirmationPromise = nil
    dismissSdk()
  }

  public func didFailConfirmation(error: YooKassaPaymentsError?) {
    confirmationPromise?.reject(
      "E_CONFIRMATION",
      error.map { String(describing: $0) } ?? "ЮKassa не смогла подтвердить оплату через СБП"
    )
    confirmationPromise = nil
    dismissSdk()
  }

  public func didFinish(on module: TokenizationModuleInput, with error: YooKassaPaymentsError?) {
    if let promise = tokenizePromise {
      promise.resolve(["status": "cancelled"])
      tokenizePromise = nil
    }
    if let promise = confirmationPromise {
      promise.resolve(["status": "cancelled"])
      confirmationPromise = nil
    }
    dismissSdk()
  }

  private func dismissSdk() {
    let controller = tokenizationViewController
    tokenizationModule = nil
    tokenizationViewController = nil
    if controller?.presentingViewController != nil {
      controller?.dismiss(animated: true)
    }
  }
}
