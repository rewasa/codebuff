import { useState } from "react";
import { useInput, type Key } from "ink";
import { Cursor } from "../utils/Cursor.js";
import { getImageFromClipboard } from "../utils/imagePaste.js";

const IMAGE_PLACEHOLDER = "[pasted_image]";

type MaybeCursor = void | Cursor;
type InputHandler = (input: string) => MaybeCursor;
type InputMapper = (input: string) => MaybeCursor;

function mapInput(input_map: Array<[string, InputHandler]>): InputMapper {
  return function (input: string): MaybeCursor {
    const handler = new Map(input_map).get(input) ?? (() => {});
    return handler(input);
  };
}

type UseTextInputProps = {
  value: string;
  onChange: (value: string) => void;
  onSubmit?: (value: string) => void;
  onHistoryUp?: () => void;
  onHistoryDown?: () => void;
  onHistoryReset?: () => void;
  multiline?: boolean;
  disableCursorMovementForUpDownKeys?: boolean;
  columns?: number;
  onImagePaste?: (base64Image: string) => void;
};

type UseTextInputResult = {
  cursorPosition: number;
  renderedValue: {
    beforeCursor: string;
    atCursor: string;
    afterCursor: string;
  };
};

export function useTextInput({
  value,
  onChange,
  onSubmit,
  onHistoryUp,
  onHistoryDown,
  onHistoryReset,
  multiline = false,
  disableCursorMovementForUpDownKeys = false,
  columns = process.stdout.columns || 80,
  onImagePaste,
}: UseTextInputProps): UseTextInputResult {
  const [offset, setOffset] = useState(0);
  const [lastEscTime, setLastEscTime] = useState(0);

  const cursor = Cursor.fromText(value, columns, offset);

  function isWithinImagePlaceholder(pos: number): boolean {
    let start = pos;
    while (start > 0 && value[start - 1] !== "[") {
      start--;
    }
    if (start > 0 && value.slice(start - 1).startsWith(IMAGE_PLACEHOLDER)) {
      return true;
    }
    if (value.slice(pos).startsWith(IMAGE_PLACEHOLDER)) {
      return true;
    }
    return false;
  }

  function getImagePlaceholderStart(pos: number): number {
    let start = pos;
    while (start > 0 && value[start - 1] !== "[") {
      start--;
    }
    if (start > 0 && value.slice(start - 1).startsWith(IMAGE_PLACEHOLDER)) {
      return start - 1;
    }
    if (value.slice(pos).startsWith(IMAGE_PLACEHOLDER)) {
      return pos;
    }
    return pos;
  }

  function getImagePlaceholderEnd(pos: number): number {
    const start = getImagePlaceholderStart(pos);
    if (value.slice(start).startsWith(IMAGE_PLACEHOLDER)) {
      return start + IMAGE_PLACEHOLDER.length;
    }
    return pos;
  }

  function handleEscape(): MaybeCursor {
    const now = Date.now();
    if (now - lastEscTime < 500) {
      process.exit(0);
    }
    setLastEscTime(now);
    return cursor;
  }

  function handleCtrl(input: string): MaybeCursor {
    if (input === "c") {
      process.exit(0);
    }

    switch (input) {
      case "a":
        return cursor.startOfLine();
      case "e":
        return cursor.endOfLine();
      case "b":
        return cursor.left();
      case "f":
        return cursor.right();
      case "k":
        return cursor.deleteToLineEnd();
      case "u": {
        if (cursor.offset > 0 && value[cursor.offset - 1] === "\n") {
          return cursor.backspace();
        }
        return cursor.deleteToLineStart();
      }
      case "w":
        return cursor.deleteWordBefore();
      case "v": {
        const base64Image = getImageFromClipboard();
        if (base64Image !== null) {
          onImagePaste?.(base64Image);
          return cursor.insert(IMAGE_PLACEHOLDER);
        }
        return cursor;
      }
      default:
        return cursor;
    }
  }

  function handleMeta(input: string, key: Key): MaybeCursor {
    switch (input) {
      case "b":
        return cursor.prevWord();
      case "f":
        return cursor.nextWord();
      case "d":
        return cursor.deleteWordAfter();
    }
    if (key.delete || key.backspace) {
      return cursor.deleteWordBefore();
    }
    return cursor;
  }

  function handleEnter(): MaybeCursor {
    if (value.trim()) {
      if (multiline && cursor.offset > 0 && value[cursor.offset - 1] === "\\") {
        return cursor.backspace().insert("\n");
      }
      onSubmit?.(value);
      onChange("");
      setOffset(0);
      onHistoryReset?.();
    }
    return cursor;
  }

  function upOrHistoryUp(): MaybeCursor {
    if (disableCursorMovementForUpDownKeys || value === "") {
      onHistoryUp?.();
    }
    return cursor;
  }

  function downOrHistoryDown(): MaybeCursor {
    if (disableCursorMovementForUpDownKeys || value === "") {
      onHistoryDown?.();
    }
    return cursor;
  }

  function mapKey(key: Key): InputMapper {
    if (key.escape) {
      return () => handleEscape();
    }

    if (key.ctrl) {
      return (input) => handleCtrl(input);
    }

    if (key.meta) {
      return (input) => handleMeta(input, key);
    }

    if (key.return) {
      return () => handleEnter();
    }

    if (key.backspace || key.delete) {
      return () => {
        if (isWithinImagePlaceholder(cursor.offset)) {
          const start = getImagePlaceholderStart(cursor.offset);
          return Cursor.fromText(
            value.slice(0, start) +
              value.slice(start + IMAGE_PLACEHOLDER.length),
            columns,
            start,
          );
        }
        if (key.meta) {
          return cursor.deleteWordBefore();
        }
        return key.backspace ? cursor.backspace() : cursor.del();
      };
    }

    if (key.upArrow) {
      return () => upOrHistoryUp();
    }

    if (key.downArrow) {
      return () => downOrHistoryDown();
    }

    if (key.leftArrow) {
      return () => {
        if (key.ctrl) {
          if (cursor.offset > 0 && value[cursor.offset - 1] === "\n") {
            return cursor.left();
          }
          return cursor.startOfLine();
        }
        return cursor.left();
      };
    }

    if (key.rightArrow) {
      return () => {
        if (key.ctrl) {
          if (cursor.offset < value.length && value[cursor.offset] === "\n") {
            return cursor.right();
          }
          return cursor.endOfLine();
        }
        return cursor.right();
      };
    }

    return (input: string) => {
      const normalizedInput = input.replace(/\r/g, "\n");
      return cursor.insert(normalizedInput);
    };
  }

  useInput((input, key) => {
    const nextCursor = mapKey(key)(input);
    if (nextCursor && !cursor.equals(nextCursor)) {
      setOffset(nextCursor.offset);
      if (cursor.text !== nextCursor.text) {
        onChange(nextCursor.text);
      }
    }
  });

  return {
    cursorPosition: offset,
    renderedValue: {
      beforeCursor: value.slice(0, offset),
      atCursor: value.slice(offset, offset + 1) || " ",
      afterCursor: value.slice(offset + 1),
    },
  };
}
