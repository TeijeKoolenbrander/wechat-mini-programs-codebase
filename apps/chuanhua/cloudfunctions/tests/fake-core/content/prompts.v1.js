'use strict';
// TEST DOUBLE for the game's core/content/prompts.v1.js (the real one is owned by minigame-dev).
const PROMPTS = [];
for (let i = 1; i <= 60; i++) PROMPTS.push({ id: `A${String(i).padStart(2, '0')}`, text: `题目${i}号`, cat: 'test' });
PROMPTS.push({ id: 'Z01', text: '已下架', cat: 'test', retired: true });
module.exports = { PROMPTS };
