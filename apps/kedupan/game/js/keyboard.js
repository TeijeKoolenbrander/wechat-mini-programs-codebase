/**
 * Text entry for the typed clue (spec 6.5, AC 29, 86). The canvas draws the box, the caret and the counter; this module owns the
 * system keyboard: wx.showKeyboard / onKeyboardInput / onKeyboardConfirm / onKeyboardComplete / onKeyboardHeightChange /
 * hideKeyboard / updateKeyboard. Copied from 传画接龙's js/keyboard.js and adapted: maxLength is required (the clue input is the
 * ONLY text input in the game and `wx.showKeyboard` is called only from here, with maxLength 12), and updateKeyboard drops
 * characters the filter removed. Fallback when the keyboard API is missing or throws: a native wx.showModal({editable:true}).
 *
 *   kb.open({ value, maxLength, placeholder, onInput(text), onConfirm(text), onClose() }) -> 'keyboard' | 'modal' | 'unavailable'
 *   kb.update(value)   replace the text in the open keyboard (wx.updateKeyboard)
 *   kb.close()         wx.hideKeyboard; onClose is NOT called for a close the caller asked for
 *   kb.height          px of the open system keyboard; null = unknown; 0 = closed
 *
 * The caller filters what arrives: this module passes the raw string through.
 */

function createKeyboard(wx) {
  let active = null;
  let bound = false;
  let height = null; // px of the open system keyboard; null = unknown (no event yet or no API)
  const kb = {
    get isOpen() {
      return !!active;
    },
    get height() {
      return active ? height : 0;
    },
  };

  function bind() {
    if (bound || !wx) return;
    bound = true;
    if (wx.onKeyboardInput) wx.onKeyboardInput((e) => active && active.onInput && active.onInput(String((e && e.value) || '')));
    if (wx.onKeyboardConfirm) wx.onKeyboardConfirm((e) => active && active.onConfirm && active.onConfirm(String((e && e.value) || '')));
    if (wx.onKeyboardHeightChange) {
      wx.onKeyboardHeightChange((e) => {
        height = e && typeof e.height === 'number' && e.height > 0 ? e.height : null;
      });
    }
    if (wx.onKeyboardComplete) {
      wx.onKeyboardComplete(() => {
        const a = active;
        active = null;
        height = null;
        if (a && a.onClose) a.onClose();
      });
    }
  }

  function close(callHide) {
    const had = !!active;
    active = null;
    height = null;
    if (had && callHide !== false && wx && wx.hideKeyboard) {
      try {
        wx.hideKeyboard({});
      } catch (e) {
        /* nothing to hide */
      }
    }
  }

  kb.open = function open(o) {
    close(false);
    if (wx && wx.showKeyboard) {
      try {
        bind();
        active = o;
        height = null;
        wx.showKeyboard({ defaultValue: o.value || '', maxLength: o.maxLength, multiple: false, confirmHold: false, confirmType: 'done' });
        return 'keyboard';
      } catch (e) {
        active = null;
      }
    }
    if (wx && wx.showModal) {
      try {
        wx.showModal({
          title: o.placeholder || '请输入',
          editable: true,
          placeholderText: o.placeholder || '',
          confirmText: '确定',
          success: (r) => {
            if (r && r.confirm && typeof r.content === 'string') {
              if (o.onInput) o.onInput(r.content);
              if (o.onConfirm) o.onConfirm(r.content);
            }
            if (o.onClose) o.onClose();
          },
          fail: () => o.onClose && o.onClose(),
        });
        return 'modal';
      } catch (e) {
        /* fall through */
      }
    }
    return 'unavailable';
  };

  kb.update = function update(value) {
    if (active && wx && wx.updateKeyboard) {
      try {
        wx.updateKeyboard({ value: String(value || '') });
      } catch (e) {
        /* the box on screen is the canvas's own text; the keyboard's copy may lag */
      }
    }
  };

  kb.close = () => close(true);
  return kb;
}

module.exports = { createKeyboard };
