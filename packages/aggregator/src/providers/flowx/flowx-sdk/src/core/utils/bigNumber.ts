import BigNumber from 'bignumber.js';

type TArg = string | number | BigNumber;

export const bn = (val: string | number): BigNumber => {
  return new BigNumber(val);
};

const mapArgs = (...args: TArg[]): BigNumber[] => {
  return args.map((arg) => {
    if (arg instanceof BigNumber) {
      return arg;
    }

    return bn(arg);
  });
};

export const sumBn = (...args: TArg[]): BigNumber => {
  if (args.length < 2) {
    throw new Error('sumBn: Must have at least 2 parameters');
  }

  const newArgs = mapArgs(...args);

  return newArgs.reduce((acc, val) => acc.plus(val), bn(0));
};

export const subBn = (...args: TArg[]): BigNumber => {
  if (args.length < 2) {
    throw new Error('subBn: Must have at least 2 parameters');
  }

  const newArgs = mapArgs(...args);

  const first = newArgs.shift() as BigNumber;
  return newArgs.reduce((acc, val) => acc.minus(val), first);
};

export const mulBn = (...args: TArg[]): BigNumber => {
  if (args.length < 2) {
    throw new Error('mulBn: Must have at least 2 parameters');
  }

  const newArgs = mapArgs(...args);

  return newArgs.reduce((acc, val) => acc.times(val), bn(1));
};

export const divBn = (...args: TArg[]): BigNumber => {
  if (args.length < 2) {
    throw new Error('divBn: Must have at least 2 parameters');
  }

  const newArgs = mapArgs(...args);

  const first = newArgs.shift() as BigNumber;

  return newArgs.reduce((acc, val) => acc.div(val), first);
};
