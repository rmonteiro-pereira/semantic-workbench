// Text checks shared by the folders that validate names people type.

const FIRST_PRINTABLE_CHARACTER = 0x20;
const DELETE_CHARACTER = 0x7f;

/** True when the text holds a control character, which would break a path, title or markup. */
export function hasControlCharacter(text: string): boolean {
  return Array.from(text).some(character => {
    const code = character.charCodeAt(0);
    return code < FIRST_PRINTABLE_CHARACTER || code === DELETE_CHARACTER;
  });
}
