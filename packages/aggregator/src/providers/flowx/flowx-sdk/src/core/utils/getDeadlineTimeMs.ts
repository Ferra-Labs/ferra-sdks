import { DEADLINE_TIME_SECONDS } from '../constants';

export const getDeadlineAtTimestampMs = (): number => {
  const now = Date.now();

  return now + DEADLINE_TIME_SECONDS * 1000;
};
