export class BackendOutageError extends Error {
  constructor (message = 'Backend is offline!') {
    super(message)
    this.name = 'BackendOutageError'
  }
}
