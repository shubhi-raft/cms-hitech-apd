const Passport = require('passport');
const LocalStrategy = require('passport-local');
const JwtStrategy = require('passport-jwt').Strategy;

const logger = require('../logger')('auth index');
const authenticate = require('./authenticate');
const serialization = require('./serialization');
const { removeUserSession } = require('./sessionStore');
const { signWebToken, jwtOptions } = require('./jwtUtils');

const defaultStrategies = [
  new LocalStrategy(authenticate()),
  new JwtStrategy(jwtOptions, serialization.deserializeUser)
];

// This setup method configures passport and inserts it into the express
// middleware. After a successful authentication via 'POST /auth/login',
// the api responds with...
//   * a JWT containing the session id, to be stored by the front-end, and sent
//     in the Authentication header of each subsequent request
//   * a (serialized) JSON representation of the user
//
// In endpoint handlers, the req.user variable will be set
// to the deserialized user object if the user is
// authenticated. Otherwise it will be null.

module.exports.setup = function setup(
  app,
  {
    auth = authenticate,
    deserializeUser = serialization.deserializeUser,
    passport = Passport,
    removeSession = removeUserSession,
    serializeUser = serialization.serializeUser,
    strategies = defaultStrategies
  } = {}
) {
  // Handle all of the authentication strategies that we support
  logger.silly('setting up strategies with Passport');
  strategies.forEach(strategy => passport.use(strategy));

  // Register our user serialization methods with passport
  logger.silly('setting up our user serializer with Passport');
  // passport.serializeUser(serializeUser);  // user -> sessionID
  passport.deserializeUser(deserializeUser);  // JWT w/ sessionID -> user

  // Add our session function and passport to our app's
  // middleware
  logger.silly('adding session and Passport middleware');
  app.use(passport.initialize());
  app.use(passport.session());

  logger.silly('setting up local login nonce-fetcher');
  app.post('/auth/login/nonce', (req, res) => {
    if (req.body && req.body.username) {
      res.send({
        nonce: auth.getNonce(req.body.username)
      });
    }
    return res.status(400).end();
  });

  // Add a local authentication endpoint
  logger.silly('setting up a local login handler');
  app.post('/auth/login', passport.authenticate('local', { session: false }), (req, res) => {
    let user = req.user;
    console.log({ user })
    const sessionId = serializeUser(user);
    console.log({ sessionId })
    const token = signWebToken({ sub: sessionId });
    res.send({
      token: token,
      user: req.user
    });
  });

  // Pull JWT from HTTP headers and deserialize.
  app.use(passport.authenticate('jwt', { session: false }));

  logger.silly('setting up a logout handler');
  app.get('/auth/logout', (req, res) => {
    const jwt = req.get('Authorization').replace('Bearer ');
    const payload = verifyWebToken(jwt);
    removeSession(payload.sub);
    req.logout();
    res.status(200).end();
  });
};
