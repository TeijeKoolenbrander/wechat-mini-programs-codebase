#!/usr/bin/env node
// PreToolUse hook: forces a permission prompt for any `git push` that could
// update `main` (explicit refspec, --all/--mirror, or an implicit push while
// main is checked out). Pushes to other branches pass through to the normal
// permission rules, where settings.json allows them.
const { execFileSync } = require('child_process');

const PROTECTED = 'main';

let raw = '';
process.stdin.on('data', (c) => (raw += c));
process.stdin.on('end', () => {
  let input;
  try {
    input = JSON.parse(raw);
  } catch {
    return; // not our payload; let normal permissions decide
  }
  const command = (input.tool_input && input.tool_input.command) || '';
  const cwd = input.cwd || process.cwd();
  const reason = checkCommand(command, cwd);
  if (reason) {
    process.stdout.write(
      JSON.stringify({
        hookSpecificOutput: {
          hookEventName: 'PreToolUse',
          permissionDecision: 'ask',
          permissionDecisionReason: `Push to ${PROTECTED} needs founder approval: ${reason}`,
        },
      })
    );
  }
});

function checkCommand(command, cwd) {
  // Split compound commands into segments (&&, ||, ;, |, newlines).
  const segments = command.split(/&&|\|\||[;|\n]/);
  for (const seg of segments) {
    const tokens = seg.trim().match(/"[^"]*"|'[^']*'|\S+/g) || [];
    const words = tokens.map((t) => t.replace(/^["']|["']$/g, ''));
    const gitIdx = words.findIndex((w) => /(^|[\\/])git(\.exe)?$/i.test(w));
    if (gitIdx === -1) continue;

    // Skip git global options (-C <dir>, -c k=v, --git-dir=...), honouring -C.
    let dir = cwd;
    let i = gitIdx + 1;
    while (i < words.length && words[i].startsWith('-')) {
      if (words[i] === '-C') dir = resolveDir(dir, words[++i]);
      else if (words[i] === '-c') i++;
      i++;
    }
    if (words[i] !== 'push') continue;

    const reason = checkPushArgs(words.slice(i + 1), dir);
    if (reason) return reason;
  }
  return null;
}

function checkPushArgs(args, dir) {
  const positional = [];
  for (let j = 0; j < args.length; j++) {
    const a = args[j];
    if (a === '--all' || a === '--mirror') return `\`${a}\` pushes every branch`;
    if (a === '-o' || a === '--push-option' || a === '--repo' || a === '--receive-pack' || a === '--exec') {
      j++;
      continue;
    }
    if (a.startsWith('-')) continue;
    positional.push(a);
  }

  const refspecs = positional.slice(1); // first positional is the remote
  if (refspecs.length === 0) {
    const branch = currentBranch(dir);
    if (branch === PROTECTED) return `no refspec given while on ${PROTECTED}`;
    if (branch === null) return 'could not determine current branch';
    return null;
  }

  for (const spec of refspecs) {
    const s = spec.replace(/^\+/, '');
    const dst = s.includes(':') ? s.split(':').pop() : s;
    const name = dst.replace(/^refs\/heads\//, '');
    if (name === PROTECTED) return `refspec \`${spec}\` targets ${PROTECTED}`;
    if (name === 'HEAD' || name === '@') {
      const branch = currentBranch(dir);
      if (branch === PROTECTED || branch === null) return `\`${spec}\` resolves to ${branch || 'an unknown branch'}`;
    }
  }
  return null;
}

function currentBranch(dir) {
  try {
    return execFileSync('git', ['rev-parse', '--abbrev-ref', 'HEAD'], {
      cwd: dir,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
  } catch {
    return null;
  }
}

function resolveDir(base, p) {
  return require('path').resolve(base, p || '.');
}
