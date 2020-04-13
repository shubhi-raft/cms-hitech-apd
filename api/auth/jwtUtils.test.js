const tap = require('tap');
const crypto = require('crypto');
const { signWebToken, verifyWebToken, jwtOptions } = require('./jwtUtils');

const payload = {
  sub: "exampleSessionId"
};

tap.test('jwtUtils.signWebToken', t => {
  const jwt = signWebToken(payload);
  t.match(jwt, /^.+\..+\..+$/, 'returns a jwt')
})
