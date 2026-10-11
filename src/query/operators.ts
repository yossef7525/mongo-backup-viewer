/** Where an operator may appear: `logical` at the key position of a whole-document filter, `field` inside a field's object. */
export type OperatorScope = 'logical' | 'field';

export interface OperatorInfo {
  name: string;
  scope: OperatorScope;
  detail: string;
}

/** Query operators offered by autocomplete ($expr and $where are left out on purpose). */
export const OPERATORS: readonly OperatorInfo[] = [
  { name: '$eq', scope: 'field', detail: 'equal to' },
  { name: '$ne', scope: 'field', detail: 'not equal to' },
  { name: '$gt', scope: 'field', detail: 'greater than' },
  { name: '$gte', scope: 'field', detail: 'greater than or equal' },
  { name: '$lt', scope: 'field', detail: 'less than' },
  { name: '$lte', scope: 'field', detail: 'less than or equal' },
  { name: '$in', scope: 'field', detail: 'matches any value in an array' },
  { name: '$nin', scope: 'field', detail: 'matches no value in an array' },
  { name: '$exists', scope: 'field', detail: 'field is present (true) or missing (false)' },
  { name: '$type', scope: 'field', detail: 'value has a BSON type' },
  { name: '$regex', scope: 'field', detail: 'string matches a regular expression' },
  { name: '$options', scope: 'field', detail: 'flags for $regex (i, m, s, x)' },
  { name: '$elemMatch', scope: 'field', detail: 'an array element matches all conditions' },
  { name: '$size', scope: 'field', detail: 'array has this many elements' },
  { name: '$all', scope: 'field', detail: 'array contains all values' },
  { name: '$not', scope: 'field', detail: 'inverts an operator expression' },
  { name: '$and', scope: 'logical', detail: 'all conditions in an array match' },
  { name: '$or', scope: 'logical', detail: 'any condition in an array matches' },
  { name: '$nor', scope: 'logical', detail: 'no condition in an array matches' },
];
