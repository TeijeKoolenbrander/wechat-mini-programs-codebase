/**
 * Text input for the describe step and the custom prompt (spec 5.5, 8.5; VERIFY V4).
 * Primary: the mini game keyboard (wx.showKeyboard + onKeyboardInput / onKeyboardConfirm / onKeyboardComplete,
 * the canvas draws the text box). Fallback when the API is missing or fails to open: a native
 * wx.showModal({editable:true}) dialog.
 *
 *   const kb = createKeyboard(wx)
 *   kb.open({ value, maxLength, placeholder, onInput(value), onConfirm(value) })
 *   kb.close()
 *   kb.active  -> boolean
 *   kb.mode    -> 'keyboard' | 'modal' | null
 */

function createKeyboard(wx) {
  let handlers = null;
  const kb = { active: false, mode: null, height: 0 }; // height: px of the platform keyboard (wx.onKeyboardHeightChange), 0 when closed
  if (wx && wx.onKeyboardHeightChange) {
    wx.onKeyboardHeightChange((res) => {
      kb.height = kb.active && res && res.height > 0 ? res.height : 0;
    });
  }

  function detach() {
    if (!wx) return;
    if (handlers) {
      wx.offKeyboardInput && wx.offKeyboardInput(handlers.input);
      wx.offKeyboardConfirm && wx.offKeyboardConfirm(handlers.confirm);
      wx.offKeyboardComplete && wx.offKeyboardComplete(handlers.complete);
    }
    handlers = null;
  }

  function openModal(o) {
    kb.mode = 'modal';
    kb.active = true;
    wx.showModal({
      title: '',
      content: o.value || '',
      editable: true,
      placeholderText: o.placeholder || '',
      success: (res) => {
        kb.active = false;
        kb.mode = null;
        if (res && res.confirm) {
          const v = String(res.content || '');
          o.onInput && o.onInput(v);
          o.onConfirm && o.onConfirm(v);
        }
      },
      fail: () => {
        kb.active = false;
        kb.mode = null;
      },
    });
  }

  kb.open = function (o) {
    kb.close();
    if (wx && wx.showKeyboard && wx.onKeyboardInput) {
      handlers = {
        input: (res) => o.onInput && o.onInput(String((res && res.value) || '')),
        confirm: (res) => o.onConfirm && o.onConfirm(String((res && res.value) || '')),
        complete: () => {
          kb.active = false;
        },
      };
      wx.onKeyboardInput(handlers.input);
      wx.onKeyboardConfirm && wx.onKeyboardConfirm(handlers.confirm);
      wx.onKeyboardComplete && wx.onKeyboardComplete(handlers.complete);
      kb.active = true;
      kb.mode = 'keyboard';
      try {
        wx.showKeyboard({
          defaultValue: o.value || '',
          maxLength: o.maxLength || 16,
          multiple: false,
          confirmHold: false,
          confirmType: 'done',
          fail: () => {
            detach();
            if (wx.showModal) openModal(o);
            else kb.active = false;
          },
        });
      } catch (e) {
        detach();
        if (wx.showModal) openModal(o);
        else kb.active = false;
      }
      return;
    }
    if (wx && wx.showModal) openModal(o);
  };

  kb.close = function () {
    if (kb.mode === 'keyboard' && wx && wx.hideKeyboard) {
      try {
        wx.hideKeyboard({});
      } catch (e) {
        /* already closed */
      }
    }
    detach();
    kb.active = false;
    kb.mode = null;
    kb.height = 0;
  };

  return kb;
}

module.exports = { createKeyboard };
