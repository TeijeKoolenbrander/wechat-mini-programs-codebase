'use strict';
// TEST DOUBLE for the game's core/content/prompts.v1.js (the real one is owned by minigame-dev);
// same export shape: {promptsVersion, categories, prompts:[{id,text,cat,retired?}]}.
const prompts = [];
for (let i = 1; i <= 60; i++) prompts.push({ id: `A${String(i).padStart(2, '0')}`, text: `题目${i}号`, cat: 'A' });
prompts.push({ id: 'Z01', text: '已下架', cat: 'A', retired: true });
module.exports = { promptsVersion: 1, categories: [{ key: 'A', name: '测试' }], prompts };
