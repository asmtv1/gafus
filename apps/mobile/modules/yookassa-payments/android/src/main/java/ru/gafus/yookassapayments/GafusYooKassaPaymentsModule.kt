package ru.gafus.yookassapayments

import android.app.Activity
import android.content.Intent
import expo.modules.kotlin.Promise
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import ru.yoomoney.sdk.kassa.payments.Checkout
import ru.yoomoney.sdk.kassa.payments.checkoutParameters.Amount
import ru.yoomoney.sdk.kassa.payments.checkoutParameters.PaymentMethodType
import ru.yoomoney.sdk.kassa.payments.checkoutParameters.PaymentParameters
import ru.yoomoney.sdk.kassa.payments.checkoutParameters.SavePaymentMethod
import java.math.BigDecimal
import java.util.Currency

private const val TOKENIZE_REQUEST_CODE = 64011
private const val CONFIRM_REQUEST_CODE = 64012

class GafusYooKassaPaymentsModule : Module() {
  private var tokenizePromise: Promise? = null
  private var confirmPromise: Promise? = null

  override fun definition() = ModuleDefinition {
    Name("GafusYooKassaPayments")

    AsyncFunction("tokenize") {
        amount: Double,
        currency: String,
        title: String,
        subtitle: String,
        clientApplicationKey: String,
        shopId: String,
        promise: Promise,
      ->
      if (tokenizePromise != null || confirmPromise != null) {
        promise.reject("E_YOOKASSA_BUSY", "Другой платёж ЮKassa уже выполняется", null)
        return@AsyncFunction
      }

      val activity = appContext.currentActivity
      if (activity == null) {
        promise.reject("E_NO_ACTIVITY", "Экран приложения сейчас недоступен", null)
        return@AsyncFunction
      }

      val paymentParameters = PaymentParameters(
        amount = Amount(BigDecimal.valueOf(amount), Currency.getInstance(currency)),
        title = title,
        subtitle = subtitle,
        clientApplicationKey = clientApplicationKey,
        shopId = shopId,
        savePaymentMethod = SavePaymentMethod.ON,
        paymentMethodTypes = setOf(PaymentMethodType.SBP),
      )
      val intent = Checkout.createTokenizeIntent(activity, paymentParameters)
      tokenizePromise = promise
      activity.runOnUiThread {
        activity.startActivityForResult(intent, TOKENIZE_REQUEST_CODE)
      }
    }

    AsyncFunction("confirm") {
        confirmationUrl: String,
        clientApplicationKey: String,
        shopId: String,
        promise: Promise,
      ->
      if (confirmPromise != null || tokenizePromise != null) {
        promise.reject("E_YOOKASSA_BUSY", "Другой платёж ЮKassa уже выполняется", null)
        return@AsyncFunction
      }

      val activity = appContext.currentActivity
      if (activity == null) {
        promise.reject("E_NO_ACTIVITY", "Экран приложения сейчас недоступен", null)
        return@AsyncFunction
      }

      val intent = Checkout.createConfirmationIntent(
        activity,
        confirmationUrl,
        PaymentMethodType.SBP,
        clientApplicationKey,
        shopId,
      )
      confirmPromise = promise
      activity.runOnUiThread {
        activity.startActivityForResult(intent, CONFIRM_REQUEST_CODE)
      }
    }

    AsyncFunction("close") {
      // Android SDK closes its tokenization Activity before the token reaches JS.
    }

    OnActivityResult { _, payload ->
      when (payload.requestCode) {
        TOKENIZE_REQUEST_CODE -> handleTokenizeResult(payload.resultCode, payload.data)
        CONFIRM_REQUEST_CODE -> handleConfirmResult(payload.resultCode, payload.data)
      }
    }

    OnActivityDestroys {
      tokenizePromise?.reject("E_ACTIVITY_DESTROYED", "Экран оплаты был закрыт", null)
      confirmPromise?.reject("E_ACTIVITY_DESTROYED", "Экран подтверждения был закрыт", null)
      tokenizePromise = null
      confirmPromise = null
    }
  }

  private fun handleTokenizeResult(resultCode: Int, data: Intent?) {
    val promise = tokenizePromise ?: return
    tokenizePromise = null
    when (resultCode) {
      Activity.RESULT_OK -> {
        if (data == null) {
          promise.reject("E_EMPTY_TOKEN_RESULT", "ЮKassa не вернула результат токенизации", null)
          return
        }
        try {
          val result = Checkout.createTokenizationResult(data)
          if (result.paymentMethodType != PaymentMethodType.SBP) {
            promise.reject("E_UNEXPECTED_PAYMENT_METHOD", "Разрешена только оплата через СБП", null)
            return
          }
          promise.resolve(
            mapOf(
              "status" to "success",
              "paymentToken" to result.paymentToken,
              "paymentMethodType" to "SBP",
            ),
          )
        } catch (error: Throwable) {
          promise.reject("E_TOKENIZATION_RESULT", "Не удалось прочитать токен ЮKassa", error)
        }
      }
      Activity.RESULT_CANCELED -> promise.resolve(mapOf("status" to "cancelled"))
      else -> promise.reject("E_TOKENIZATION", "ЮKassa не смогла подготовить оплату", null)
    }
  }

  private fun handleConfirmResult(resultCode: Int, data: Intent?) {
    val promise = confirmPromise ?: return
    confirmPromise = null
    when (resultCode) {
      Activity.RESULT_OK -> promise.resolve(mapOf("status" to "completed"))
      Activity.RESULT_CANCELED -> promise.resolve(mapOf("status" to "cancelled"))
      Checkout.RESULT_ERROR -> {
        val description = data?.getStringExtra(Checkout.EXTRA_ERROR_DESCRIPTION)
          ?: "ЮKassa не смогла открыть подтверждение СБП"
        promise.reject("E_CONFIRMATION", description, null)
      }
      else -> promise.reject("E_CONFIRMATION", "Неизвестный результат подтверждения СБП", null)
    }
  }
}
