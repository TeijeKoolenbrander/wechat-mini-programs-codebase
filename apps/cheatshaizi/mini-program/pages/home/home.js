const { sparkles } = require('../../utils/ui');

function open(mode) {
  wx.navigateTo({ url: '/pages/cup/cup?mode=' + mode });
}

Page({
  data: {
    sparkles: [],
  },

  onLoad() {
    this.setData({ sparkles: sparkles(26) });
  },

  goLucky() {
    open('lucky');
  },

  goInsane() {
    open('insane');
  },

  goCheat() {
    open('cheat');
  },
});
