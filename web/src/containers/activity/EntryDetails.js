import { Button, Review } from '@cmsgov/design-system-core';
import PropTypes from 'prop-types';
import React, { useMemo, useRef, Fragment } from 'react';
import { connect } from 'react-redux';
import { useHistory } from 'react-router-dom';

import { selectActivityByIndex } from '../../reducers/activities.selectors';
import { jumpTo } from '../../actions/app';
import { removeActivity } from '../../actions/editActivity';

import { t } from '../../i18n';

const makeTitle = ({ name, fundingSource }, i) => {
  let title = `${t('activities.namePrefix')} ${i}`;
  if (name) {
    title += `: ${name}`;
  } else {
    title += `: Untitled`;
  }
  if (fundingSource) {
    title += ` (${fundingSource})`;
  }
  return title;
};

const EntryDetails = ({
  activityIndex,
  activityKey,
  fundingSource,
  jumpAction,
  name,
  remove
}) => {
  const container = useRef();

  const history = useHistory();

  const navigateToActivity = e => {
    e.stopPropagation();
    e.preventDefault();

    jumpAction(`activity-${activityKey}-overview`);
    history.push(`/apd/activity/${activityIndex}`);
    window.scrollTo(0, 0);
  };

  const onRemove = () => {
    remove(activityIndex);
  };

  const title = useMemo(
    () => makeTitle({ name, fundingSource }, activityIndex + 1),
    [fundingSource, name, activityIndex]
  );

  const editContent = (
    <div className="nowrap visibility--screen">
      <Button size="small" variation="transparent" onClick={navigateToActivity}>
        Edit
      </Button>
      {activityIndex > 0 && (
        <Fragment>
          <span>|</span>
          <Button size="small" variation="transparent" onClick={onRemove}>
            Remove
          </Button>
        </Fragment>
      )}
    </div>
  );

  return (
    <div
      id={`activity-${activityKey}`}
      className={`activity--body activity--body__${
        activityIndex === 0 ? 'first' : 'notfirst'
      }`}
      ref={container}
    >
      <Review heading={title} headingLevel={4} editContent={editContent}>
        {[
          /* children are required, so send an empty array to suppress errors */
        ]}
      </Review>
    </div>
  );
};

EntryDetails.propTypes = {
  activityIndex: PropTypes.number.isRequired,
  activityKey: PropTypes.string.isRequired,
  fundingSource: PropTypes.string.isRequired,
  jumpAction: PropTypes.func.isRequired,
  name: PropTypes.string,
  remove: PropTypes.func.isRequired
};

EntryDetails.defaultProps = {
  name: ''
};

const mapStateToProps = (state, { activityIndex }) => {
  const { fundingSource, key, name } = selectActivityByIndex(state, {
    activityIndex
  });
  return { activityKey: key, fundingSource, name };
};

const mapDispatchToProps = {
  jumpAction: jumpTo,
  remove: removeActivity
};

export default connect(mapStateToProps, mapDispatchToProps)(EntryDetails);

export { EntryDetails as plain, mapStateToProps, mapDispatchToProps };
