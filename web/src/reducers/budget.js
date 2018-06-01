import { UPDATE_ACTIVITY } from '../actions/activities';
import { GET_APD_SUCCESS } from '../actions/apd';
import { YEAR_OPTIONS } from '../util';

const getFundingSourcesByYear = (years = YEAR_OPTIONS) => ({
  ...years.reduce(
    (o, year) => ({
      ...o,
      [year]: {
        total: 0,
        federal: 0,
        state: 0
      }
    }),
    {}
  ),
  total: {
    total: 0,
    federal: 0,
    state: 0
  }
});

const expenseTypes = () => ({
  statePersonnel: getFundingSourcesByYear(),
  contractors: getFundingSourcesByYear(),
  expenses: getFundingSourcesByYear(),
  combined: getFundingSourcesByYear()
});

const initialState = () => ({
  combined: getFundingSourcesByYear(),
  hie: expenseTypes(),
  hit: expenseTypes(),
  mmis: expenseTypes(),
  years: YEAR_OPTIONS
});

const activities = src => Object.values(src.activities.byId);

const addBudgetBlocks = (into, from) => {
  const out = into;
  out.total += from.total;
  out.federal += from.federal;
  out.state += from.state;
};

const getTotalsForActivity = activity => {
  const fundingSource = activity.fundingSource.toLowerCase();
  const ffp = activity.costFFP;

  return {
    collapse: (type, value = v => +v) => {
      const collapsed = {};
      activity[type].forEach(expense => {
        Object.keys(expense.years).forEach(year => {
          if (!collapsed[year]) {
            collapsed[year] = { total: 0, federal: 0, state: 0 };
          }
          const v = value(expense.years[year]);
          addBudgetBlocks(collapsed[year], {
            total: v,
            federal: v * ffp[year].fed / 100,
            state: v * ffp[year].state / 100
          });
        });
      });

      return {
        totals: () => {
          const total = { total: 0, federal: 0, state: 0 };
          Object.values(collapsed).forEach(year => {
            addBudgetBlocks(total, year);
          });

          return {
            merge: (bigState, target = type) => {
              const merged = bigState[fundingSource][target];

              Object.keys(merged).forEach(year => {
                if (year !== 'total') {
                  addBudgetBlocks(merged[year], collapsed[year]);
                }
              });

              addBudgetBlocks(merged.total, total);
              return merged;
            }
          };
        }
      };
    }
  };
};

const getTotalsForFundingSource = (bigState, fundingSource) => {
  const fsUpdate = bigState[fundingSource].combined;
  const grandTotals = bigState.combined;

  Object.entries(bigState[fundingSource]).forEach(([type, values]) => {
    if (type !== 'combined') {
      Object.entries(values).forEach(([year, value]) => {
        addBudgetBlocks(fsUpdate[year], value);
        addBudgetBlocks(grandTotals[year], value);
      });
    }
  });
};

const buildBudget = wholeState => {
  const newState = initialState();

  activities(wholeState).forEach(activity => {
    const totaller = getTotalsForActivity(activity);
    totaller
      .collapse('statePersonnel', year => +year.amt)
      .totals()
      .merge(newState);

    totaller
      .collapse('contractorResources')
      .totals()
      .merge(newState, 'contractors');

    totaller
      .collapse('expenses')
      .totals()
      .merge(newState);
  });

  getTotalsForFundingSource(newState, 'hie');
  getTotalsForFundingSource(newState, 'hit');
  getTotalsForFundingSource(newState, 'mmis');

  return newState;
};

const reducer = (state = initialState(), action, wholeState) => {
  switch (action.type) {
    case UPDATE_ACTIVITY:
      return action.isExpense ? buildBudget(wholeState, action) : state;
    case GET_APD_SUCCESS:
      return buildBudget(wholeState, action);
    default:
      return state;
  }
};

export default reducer;
