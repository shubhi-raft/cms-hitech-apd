const logger = require('../../logger')('apds route post');
const { raw } = require('../../db');
const { apd: defaultApdModel } = require('../../db').models;
const { can } = require('../../middleware');

const defaultGetNewApd = require('./post.data');

module.exports = (
  app,
  { db = raw, getNewApd = defaultGetNewApd, ApdModel = defaultApdModel } = {}
) => {
  logger.silly('setting up POST /apds/ route');
  app.post('/apds', can('edit-document'), async (req, res) => {
    logger.silly(req, 'handling POST /apds route');

    try {
      const newApd = ApdModel.forge({
        state_id: req.user.state,
        status: 'draft'
      });
      await newApd.save();

      const apdContent = await getNewApd(req.user.state);
      await newApd.synchronize(apdContent);

      const apd = await ApdModel.where({ id: newApd.get('id') }).fetch({
        withRelated: ApdModel.withRelated
      });

      const document = apd.toJSON();

      document.activities.forEach(activity => {
        if (!activity.costAllocationNarrative.otherSources) {
          activity.costAllocationNarrative.otherSources = '';
        }
        if (!activity.costAllocationNarrative.methodology) {
          activity.costAllocationNarrative.methodology = '';
        }
      });

      if (!document.federalCitations) {
        document.federalCitations = {};
      }
      if (!document.stateProfile.medicaidOffice.address2) {
        document.stateProfile.medicaidOffice.address2 = '';
      }

      await db('apds')
        .where({ id: newApd.get('id') })
        .update({ document });

      res.send(apd);
    } catch (e) {
      logger.error(req, e);
      res.status(500).end();
    }
  });
};
