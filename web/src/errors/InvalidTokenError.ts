export class InvalidTokenError extends Error {
  constructor (message = 'Token did not validate') {
    super(message)
    this.name = 'InvalidToken'
  }
}
