// The error the command line turns into exit status 1: the request cannot be served and the reason is for the person running it.

/** A refusal to read a source or write a bundle, with a message that says what to change. */
export class TesseraRefusal extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'TesseraRefusal';
  }
}
