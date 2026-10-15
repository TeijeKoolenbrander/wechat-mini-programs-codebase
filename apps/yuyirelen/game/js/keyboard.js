/**
 * Native keyboard wrapper (spec 4.2, 17 item 1-2) [SPIKE: verify on device].
 *
 *   wx.showKeyboard({ defaultValue:'', maxLength: 8, multiple:false, confirmHold:true, confirmType:'done' })
 *   wx.onKeyboardInput({value})      the current text (the system IME handles pinyin)
 *   wx.onKeyboardConfirm({value})    完成 pressed (the keyboard stays open: confirmHold)
 *   wx.onKeyboardComplete({value})   the keyboard was dismissed
 *   wx.updateKeyboard({value:''})    clear the text after a submit
 *   wx.onKeyboardHeightChange({height})
 *
 * If the confirm event is unreliable on a device, typing still works: the exact match is
 * always suggestion #1 and tapping a suggestion submits it. If a call is missing the keyboard
 * reports `available: false` and the screen keeps the chips only.
 */

function createKeyboard(wx, handlers, maxLength) {
  const kb = { isOpen: false, available: typeof wx.showKeyboard === 'function' };

  if (wx.onKeyboardInput) wx.onKeyboardInput((e) => kb.isOpen && handlers.onInput(String((e && e.value) || '')));
  if (wx.onKeyboardConfirm) wx.onKeyboardConfirm((e) => kb.isOpen && handlers.onConfirm(String((e && e.value) || '')));
  if (wx.onKeyboardComplete) {
    wx.onKeyboardComplete(() => {
      if (!kb.isOpen) return;
      kb.isOpen = false;
      handlers.onComplete();
    });
  }
  if (wx.onKeyboardHeightChange) wx.onKeyboardHeightChange((e) => handlers.onHeight(e && typeof e.height === 'number' ? e.height : null));

  kb.open = function () {
    if (!kb.available) return false;
    kb.isOpen = true;
    try {
      wx.showKeyboard({ defaultValue: '', maxLength: maxLength || 8, multiple: false, confirmHold: true, confirmType: 'done' });
    } catch (e) {
      kb.isOpen = false;
      return false;
    }
    return true;
  };

  /** Clear the text but keep the keyboard open (rapid typing). */
  kb.clear = function () {
    if (kb.isOpen && wx.updateKeyboard) {
      try {
        wx.updateKeyboard({ value: '' });
      } catch (e) {
        /* optional */
      }
    }
  };

  kb.close = function () {
    kb.isOpen = false;
    if (wx.hideKeyboard) {
      try {
        wx.hideKeyboard({});
      } catch (e) {
        /* optional */
      }
    }
  };
  return kb;
}

module.exports = { createKeyboard };
