const jwt = require('jsonwebtoken');
const tap = require('tap');
const sinon = require('sinon');
const lib = require('./authenticate.js');

const sandbox = sinon.createSandbox();

const db = sandbox.stub();
const knexStubs = {
  first: sandbox.stub(),
  select: sandbox.stub(),
  update: sandbox.stub(),
  where: sandbox.stub(),
  whereIn: sandbox.stub(),
  whereRaw: sandbox.stub()
};

const hash = {
  compare: sandbox.stub()
};

const auth = lib({ db, hash });

tap.test('local authentication', async authTest => {
  const doneCallback = sandbox.spy();
  authTest.beforeEach(done => {
    sandbox.resetBehavior();
    sandbox.resetHistory();

    db.returns(knexStubs);
    Object.values(knexStubs).forEach(stub => stub.returns(knexStubs));

    done();
  });

  authTest.test('gets a nonce', async test => {
    const nonce = lib.getNonce('Alf');

    test.ok(
      /[^.]+\.[^.]+\.[^.]+/i.test(nonce),
      'nonce has header, payload, and signature'
    );

    const decoded = jwt.decode(nonce, { complete: true });
    test.same(
      decoded.header,
      { alg: 'HS256', typ: 'JWT' },
      'decoded token header is correct'
    );

    test.equal(decoded.payload.username, 'Alf', 'payload is the username');
    test.equal(
      typeof decoded.payload.iat,
      'number',
      'creation time is a number'
    );
    // JWT times are in seconds, not milliseconds.  Because reasons. 🤷🏼‍♂️
    test.equal(
      decoded.payload.exp,
      decoded.payload.iat + 3,
      'expiration is 3 seconds after the creation time'
    );

    test.equal(typeof decoded.signature, 'string', 'signature is a string');
  });

  authTest.test('with an invalid nonce', async nonceTests => {
    nonceTests.test('invalid jwt', async test => {
      await auth('', '', doneCallback);

      test.ok(db.notCalled, 'database is never called');
      test.ok(doneCallback.calledWith(null, false), 'got a false user');
    });

    nonceTests.test('invalid algorithm', async test => {
      const nonce = lib.getNonce('username');
      const token = jwt.decode(nonce, { complete: true });

      const badNonce = jwt.sign(token.payload, 'secret', { algorithm: 'none' });

      await auth(badNonce, '', doneCallback);

      test.ok(db.notCalled, 'database is never called');
      test.ok(doneCallback.calledWith(null, false), 'got a false user');
    });

    nonceTests.test('invalid signature', async test => {
      const nonce = lib.getNonce('username');
      const last = nonce[nonce.length - 1];

      await auth(
        `${nonce.substr(0, nonce.length - 1)}${last === 'x' ? 'y' : 'x'}`,
        '',
        doneCallback
      );

      test.ok(db.notCalled, 'database is never called');
      test.ok(doneCallback.calledWith(null, false), 'got a false user');
    });

    nonceTests.test('expired nonce', async test => {
      const clock = sinon.useFakeTimers();
      const nonce = lib.getNonce('username');
      clock.tick(3001);

      await auth(nonce, '', doneCallback);

      test.ok(db.notCalled, 'database is never called');
      test.ok(doneCallback.calledWith(null, false), 'got a false user');

      clock.restore();
    });
  });

  authTest.test('with a database error', async errorTest => {
    knexStubs.first.rejects();

    await auth(lib.getNonce('user'), 'password', doneCallback);

    errorTest.equal(doneCallback.callCount, 1, 'called done callback once');
    errorTest.ok(
      doneCallback.calledWith(sinon.match.truthy),
      'got an error message'
    );
  });

  authTest.test('with no valid user', async noUserTest => {
    knexStubs.first.resolves();

    await auth(lib.getNonce('user'), 'password', doneCallback);

    noUserTest.ok(hash.compare.notCalled, 'does not compare password');

    noUserTest.equal(doneCallback.callCount, 1, 'called done callback once');
    noUserTest.ok(doneCallback.calledWith(null, false), 'got a false user');
  });

  authTest.test('with locked account', async invalidTest => {
    knexStubs.first.resolves({ locked_until: Date.now() + 5000 });

    await auth(lib.getNonce('user'), 'password', doneCallback);

    invalidTest.ok(hash.compare.notCalled, 'password is never checked');
    invalidTest.equal(doneCallback.callCount, 1, 'called done callback once');
    invalidTest.ok(doneCallback.calledWith(null, false), 'got a false user');
  });

  authTest.test(
    'with locked account, but lock is expired',
    async invalidTest => {
      knexStubs.first.resolves({
        email: 'hello@world',
        password: 'test-password',
        id: 57,
        locked_until: 500
      });
      knexStubs.update.resolves();

      await auth(lib.getNonce('user'), 'password', doneCallback);

      invalidTest.ok(
        knexStubs.update.calledWith({
          failed_logons: null,
          locked_until: null
        }),
        'lock is cleared'
      );

      invalidTest.equal(doneCallback.callCount, 1, 'called done callback once');
      invalidTest.ok(doneCallback.calledWith(null, false), 'got a false user');
    }
  );

  authTest.test('with invalid password', async invalidTest => {
    knexStubs.first.resolves({
      email: 'hello@world',
      password: 'test-password',
      id: 57,
      locked_until: 0
    });
    hash.compare.resolves(false);

    const clock = sinon.useFakeTimers();
    clock.tick(54321012345);

    await auth(lib.getNonce('user'), 'password', doneCallback);

    clock.restore();

    invalidTest.ok(hash.compare.calledOnce, 'password is compared one time');
    invalidTest.ok(
      hash.compare.calledWith('password', 'test-password'),
      'password is compared to database value'
    );

    invalidTest.ok(
      knexStubs.update.calledWith({ failed_logons: [54321012345] }),
      'saves the failed logon'
    );

    invalidTest.equal(doneCallback.callCount, 1, 'called done callback once');
    invalidTest.ok(doneCallback.calledWith(null, false), 'got a false user');
  });

  authTest.test(
    'with invalid password and several previous failed attempts',
    async invalidTest => {
      knexStubs.first.resolves({
        email: 'hello@world',
        password: 'test-password',
        id: 57,
        locked_until: 0,
        failed_logons: [54321012341, 54321012342, 54321012343, 54321012344]
      });
      hash.compare.resolves(false);

      process.env.AUTH_LOCK_FAILED_ATTEMPTS_COUNT = 5;
      process.env.AUTH_LOCK_FAILED_ATTEMPTS_DURATION_MINUTES = 30;
      process.env.AUTH_LOCK_FAILED_ATTEMPTS_WINDOW_TIME_MINUTES = 1;
      const clock = sinon.useFakeTimers();
      clock.tick(54321012345);

      await auth(lib.getNonce('user'), 'password', doneCallback);

      clock.restore();

      invalidTest.ok(
        knexStubs.update.calledWith({
          locked_until: 54321012345 + 1800000,
          failed_logons: [
            54321012341,
            54321012342,
            54321012343,
            54321012344,
            54321012345
          ]
        }),
        'account is marked as locked'
      );

      invalidTest.equal(doneCallback.callCount, 1, 'called done callback once');
      invalidTest.ok(doneCallback.calledWith(null, false), 'got a false user');
    }
  );

  authTest.test(
    'with invalid password and several outdated previous failed attempts',
    async invalidTest => {
      knexStubs.first.resolves({
        email: 'hello@world',
        password: 'test-password',
        id: 57,
        locked_until: 0,
        failed_logons: [44321012341, 44321012342, 44321012343, 44321012344]
      });
      hash.compare.resolves(false);

      process.env.AUTH_LOCK_FAILED_ATTEMPTS_COUNT = 5;
      process.env.AUTH_LOCK_FAILED_ATTEMPTS_DURATION_MINUTES = 30;
      process.env.AUTH_LOCK_FAILED_ATTEMPTS_WINDOW_TIME_MINUTES = 1;
      const clock = sinon.useFakeTimers();
      clock.tick(54321012345);

      await auth(lib.getNonce('user'), 'password', doneCallback);

      clock.restore();

      invalidTest.ok(
        knexStubs.update.calledWith({
          failed_logons: [54321012345]
        }),
        'account is not marked as locked'
      );

      invalidTest.equal(doneCallback.callCount, 1, 'called done callback once');
      invalidTest.ok(doneCallback.calledWith(null, false), 'got a false user');
    }
  );

  authTest.test('with a valid user', async validTest => {
    knexStubs.first.resolves({
      email: 'hello@world',
      password: 'test-password',
      id: 57,
      auth_role: 'do a barrel role',
      state_id: 'liquid'
    });
    knexStubs.select
      .withArgs('activity_id')
      .resolves([{ activity_id: 1 }, { activity_id: 2 }]);
    knexStubs.select
      .withArgs('name')
      .resolves([{ name: 'activity 1' }, { name: 'activity 2' }]);
    hash.compare.resolves(true);

    await auth(lib.getNonce('user'), 'password', doneCallback);

    validTest.equal(doneCallback.callCount, 1, 'called done callback once');
    validTest.ok(
      doneCallback.calledWith(null, {
        username: 'hello@world',
        id: 57,
        role: 'do a barrel role',
        state: 'liquid',
        activities: ['activity 1', 'activity 2']
      }),
      'did not get an error message, did get a user object'
    );
  });
});
