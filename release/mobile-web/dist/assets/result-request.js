import { ASK_SCHEMA_VERSION, validAskRequest, askAnswers, askRequest } from './ask-options.js?v=4.0.0';

const validRound = value => typeof value === 'string' && value.length > 0 && value.length <= 100;
const sameAnswers = (left, right) => left.budgetRange === right.budgetRange && left.deliveryTime === right.deliveryTime &&
  JSON.stringify([...left.categories].sort()) === JSON.stringify([...right.categories].sort());

export function prepareResultRequest(raw, profile, ownerId, draft = null, newRoundId = () => crypto.randomUUID()) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw) || !profile || typeof profile !== 'object' || !ownerId || (raw.accountId && raw.accountId !== ownerId)) return null;
  const legacy = raw.schemaVersion !== ASK_SCHEMA_VERSION && ['under15', '15to25', '25to40', 'unlimited'].includes(raw.budgetRange);
  if (!validAskRequest(raw) && !legacy) return null;
  const answers = askAnswers(raw, profile);
  const roundId = validRound(raw.roundId) ? raw.roundId : draft && validRound(draft.roundId) && sameAnswers(answers, draft.answers) ? draft.roundId : newRoundId();
  return askRequest(answers, { roundId, accountId: ownerId, createdAt: typeof raw.createdAt === 'string' ? raw.createdAt : '' });
}
