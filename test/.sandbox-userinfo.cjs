const os = require('node:os');
os.userInfo = () => ({ username: 'codex', uid: 0, gid: 0, shell: null, homedir: process.cwd() });
