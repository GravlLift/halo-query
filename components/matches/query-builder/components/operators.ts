import { BasicConfig, Config } from '@react-awesome-query-builder/ui';
import { add_operation } from 'json-logic-js';
import { DateTime } from 'luxon';

function coallesceDate(maybeDate: unknown) {
  if (DateTime.isDateTime(maybeDate)) {
    return maybeDate;
  } else if (typeof maybeDate === 'string') {
    return DateTime.fromISO(maybeDate);
  } else if (maybeDate instanceof Date) {
    return DateTime.fromJSDate(maybeDate);
  }
  return maybeDate;
}

add_operation('==', (a, b) => {
  const dateA = coallesceDate(a);
  const dateB = coallesceDate(b);
  if (
    DateTime.isDateTime(dateA) &&
    dateA.isValid &&
    DateTime.isDateTime(dateB) &&
    dateB.isValid &&
    dateA.hasSame(dateB, 'year') &&
    dateA.hasSame(dateB, 'month') &&
    dateA.hasSame(dateB, 'day') &&
    dateA.hasSame(dateB, 'hour') &&
    dateA.hasSame(dateB, 'minute')
  ) {
    return true;
  } else if (
    typeof a === 'string' &&
    typeof b === 'string' &&
    a.toLowerCase() === b.toLowerCase()
  ) {
    return true;
  }
  return a == b;
});
add_operation('!=', (a, b) => {
  const dateA = coallesceDate(a);
  const dateB = coallesceDate(b);
  if (
    DateTime.isDateTime(dateA) &&
    dateA.isValid &&
    DateTime.isDateTime(dateB) &&
    dateB.isValid &&
    !(
      dateA.hasSame(dateB, 'year') &&
      dateA.hasSame(dateB, 'month') &&
      dateA.hasSame(dateB, 'day') &&
      dateA.hasSame(dateB, 'hour') &&
      dateA.hasSame(dateB, 'minute')
    )
  ) {
    return true;
  } else if (
    typeof a === 'string' &&
    typeof b === 'string' &&
    a.toLowerCase() !== b.toLowerCase()
  ) {
    return true;
  }
  return a != b;
});
add_operation('>', (a, b) => {
  const dateA = coallesceDate(a);
  const dateB = coallesceDate(b);
  if (
    DateTime.isDateTime(dateA) &&
    dateA.isValid &&
    DateTime.isDateTime(dateB) &&
    dateB.isValid &&
    +dateA > +dateB
  ) {
    return true;
  }
  return a > b;
});
add_operation('<', (a, b) => {
  const dateA = coallesceDate(a);
  const dateB = coallesceDate(b);
  if (
    DateTime.isDateTime(dateA) &&
    dateA.isValid &&
    DateTime.isDateTime(dateB) &&
    dateB.isValid &&
    +dateA < +dateB
  ) {
    return true;
  }
  return a < b;
});
add_operation('>=', (a, b) => {
  const dateA = coallesceDate(a);
  const dateB = coallesceDate(b);
  if (
    DateTime.isDateTime(dateA) &&
    dateA.isValid &&
    DateTime.isDateTime(dateB) &&
    dateB.isValid &&
    +dateA >= +dateB
  ) {
    return true;
  }
  return a >= b;
});
add_operation('<=', (a, b) => {
  const dateA = coallesceDate(a);
  const dateB = coallesceDate(b);
  if (
    DateTime.isDateTime(dateA) &&
    dateA.isValid &&
    DateTime.isDateTime(dateB) &&
    dateB.isValid &&
    +dateA <= +dateB
  ) {
    return true;
  }
  return a <= b;
});
add_operation(
  'starts_with',
  (a, b) => a?.toLowerCase().startsWith(b?.toLowerCase() ?? '') ?? false
);
add_operation(
  'ends_with',
  (a, b) => a?.toLowerCase().endsWith(b?.toLowerCase() ?? '') ?? false
);
const operators = {
  ...BasicConfig.operators,
  equal: {
    ...BasicConfig.operators['equal'],
    label: 'Equals',
  },
  not_equal: {
    ...BasicConfig.operators['not_equal'],
    label: 'Not equals',
  },
  select_equals: {
    ...BasicConfig.operators['select_equals'],
    label: 'Equals',
  },
  select_not_equals: {
    ...BasicConfig.operators['select_not_equals'],
    label: 'Not equals',
  },
  starts_with: {
    ...BasicConfig.operators['starts_with'],
    jsonLogic: 'starts_with',
  },
  ends_with: {
    ...BasicConfig.operators['ends_with'],
    jsonLogic: 'ends_with',
  },
  is_null: {
    ...BasicConfig.operators['is_null'],
    label: 'Is blank',
  },
  is_not_null: {
    ...BasicConfig.operators['is_not_null'],
    label: 'Is not blank',
  },
} satisfies Config['operators'];
export default operators;
