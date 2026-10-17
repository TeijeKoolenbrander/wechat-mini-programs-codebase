/**
 * The client-callable cloud function names. Kept out of js/mock-server.js so a cloud build can resolve them without
 * loading the mock (the mock is dev-only and listed in packOptions.ignore for release, QA-6).
 */

const CLIENT_FUNCTIONS = [
  'getDaily', 'submitCard', 'getArchive', 'getArchiveDay', 'getBonusCard', 'unlockDistribution', 'joinGroup',
  'getGroupDay', 'getFriendBoard', 'createRound', 'setClue', 'getRound', 'submitGuess', 'revealRound',
  'subscribeRound', 'reportCard', 'agreeRules', 'reportClue', 'track',
];

module.exports = { CLIENT_FUNCTIONS };
