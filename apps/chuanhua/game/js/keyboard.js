/**
 * Text entry for the describe step and the custom prompt (spec 5.5, V4). The canvas draws the box and the counter; this
 * module owns the system keyboard: wx.showKeyboard / onKeyboardInput / onKeyboardConfirm / onKeyboardComplete /
 * hideKeyboard. Fallback when the keyboard API is missing or throws: a native wx.showModal({editable:true}) dialog.
 *
 *   kb.open({ value, maxLength, placeholder, onInput(text), onConfirm(text), onClose() }) -> 'keyboard' | 'modal' | 'unavailable'
 *   kb.close()
 *
 * The caller filters what arrives (core/text.inputFilter): this module passes the raw string through.
 */

function createKeyboard(wx) {
  let active = null;
  let bound = false;
  let height = null; // px of the open system keyboard; null = unknown (no event yet or no API)
  const kb = { get isOpen() { return !!active; }, get height() { return active ? height : 0; } };

  function bind() {
    if (bound || !wx) return;
    bound = true;
    if (wx.onKeyboardInput) wx.onKeyboardInput((e) => active && active.onInput && active.onInput(String((e && e.value) || '')));
    if (wx.onKeyboardConfirm) wx.onKeyboardConfirm((e) => active && active.onConfirm && active.onConfirm(String((e && e.value) || '')));
    if (wx.onKeyboardHeightChange) {
      wx.onKeyboardHeightChange((e) => {
        height = e && typeof e.height === 'number' ? e.height : null;
      });
    }
    if (wx.onKeyboardComplete) {
      wx.onKeyboardComplete(() => {
        const a = active;
        active = null;
        if (a && a.onClose) a.onClose();
      });
    }
  }

  kb.open = function (o) {
    close(false);
    if (wx && wx.showKeyboard) {
      try {
        bind();
        active = o;
        height = null;
        wx.showKeyboard({ defaultValue: o.value || '', maxLength: o.maxLength || 60, multiple: false, confirmHold: false, confirmType: 'done' });
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
  kb.close = () => close(true);
  return kb;
}

module.exports = { createKeyboard };
