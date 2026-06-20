// @vitest-environment happy-dom
// Regression: typing in an editable field (the cipher inputs) must NOT register game input.
// Pressing Space/Enter inside a text input was launching the run (startEdge) + eating the space.
import { describe, it, expect } from 'vitest';
import { InputManager } from './input';

function newInput(): InputManager {
  const canvas = document.createElement('canvas');
  document.body.appendChild(canvas);
  return new InputManager(canvas);
}

describe('InputManager — editable-focus guard', () => {
  it('does NOT register start, and does NOT preventDefault, when Space is pressed inside an <input>', () => {
    const im = newInput();
    const field = document.createElement('input');
    field.type = 'text';
    document.body.appendChild(field);
    field.focus();
    const ev = new KeyboardEvent('keydown', { key: ' ', bubbles: true, cancelable: true });
    field.dispatchEvent(ev);
    expect(im.consumeStart()).toBe(false); // run not launched
    expect(ev.defaultPrevented).toBe(false); // space still types into the field
    field.remove();
  });

  it('does NOT register start when Enter is pressed inside a <textarea>', () => {
    const im = newInput();
    const area = document.createElement('textarea');
    document.body.appendChild(area);
    area.focus();
    area.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    expect(im.consumeStart()).toBe(false);
    area.remove();
  });

  it('STILL registers start when Space is pressed outside any editable field', () => {
    const im = newInput();
    window.dispatchEvent(new KeyboardEvent('keydown', { key: ' ', bubbles: true }));
    expect(im.consumeStart()).toBe(true);
  });
});
