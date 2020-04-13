const crypto = require('crypto');
const tap = require('tap');

// override process.env
// https://stackoverflow.com/a/42304479/2675670
const env = Object.assign({}, process.env);

const payload = {
  sub: 'exampleSessionId'
};

tap.test('jwtUtils', async t => {
  t.beforeEach(async () => {
    process.env.SESSION_LIFETIME_MINUTES = 5;
    process.env.SESSION_SECRET = 'super-secret';
  })

  t.afterEach(async () => {
    process.env = env;
  })

  t.test('signWebToken()', async t => {
    const { signWebToken } = require('./jwtUtils');

    t.test('given a payload object', async t => {
      const jwt = signWebToken(payload);
      t.match(jwt, /^.+\..+\..+$/, 'returns a jwt in the format \'xxx.yyy.zzz\'');
    })
  })

  t.test('verifyWebToken()', async t => {
    const { signWebToken, verifyWebToken } = require('./jwtUtils');

    t.test('given a valid JWT', async t => {
      const jwt = signWebToken(payload);
      const result = verifyWebToken(jwt);

      t.isA(result, 'object', 'returns a payload object')
      t.equal(result.sub, 'exampleSessionId', '\'sub\' property is the session id')
      t.isA(result.iat, 'number', '\'iat\' (issued at) property is a number')
      t.isA(result.exp, 'number', '\'exp\' (expires) property is a number')
      t.equal(result.iss, 'CMS eAPD API', '\'iss\' (issued) property is CMS eAPD API')
    })

    t.test('given an invalid JWT', async t => {
      const jwt = 'garbage.garbage.garbage';
      const result = verifyWebToken(jwt);
      t.equal(result, false, 'returns false')
    })
  })

})
