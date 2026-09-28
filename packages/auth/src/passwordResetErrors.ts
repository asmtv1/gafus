export class InvalidPasswordResetTokenError extends Error {
  constructor() {
    super("Ссылка устарела или уже использована. Откройте последнее письмо или запросите новое.");
    this.name = "InvalidPasswordResetTokenError";
  }
}
