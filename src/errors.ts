export class TerminalTableKitError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'TerminalTableKitError';
  }
}

export class TableParseError extends TerminalTableKitError {
  constructor(message: string) {
    super(message);
    this.name = 'TableParseError';
  }
}
