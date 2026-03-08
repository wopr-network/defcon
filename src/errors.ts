export class DefconError extends Error {
  constructor(msg: string) {
    super(msg);
    this.name = new.target.name;
    Object.setPrototypeOf(this, new.target.prototype);
  }
}
export class NotFoundError extends DefconError {}
export class ConflictError extends DefconError {}
export class ValidationError extends DefconError {}
export class GateError extends DefconError {}
export class InternalError extends DefconError {}
