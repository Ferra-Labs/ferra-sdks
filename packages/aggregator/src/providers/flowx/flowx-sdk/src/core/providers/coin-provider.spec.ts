import { CoinProvider } from './CoinProvider';

describe('Coin Provider', () => {
  const coinProvider = new CoinProvider('mainnet');
  it('Get full coin', async () => {
    const coins = await coinProvider.getCoins();
    expect(coins?.length).toBeGreaterThanOrEqual(50);
  });

  it('Can get specific coin', async () => {
    const coins = await coinProvider.getCoins({
      coinTypes: ['0x2::sui::SUI'],
    });
    expect(coins?.[0]?.symbol).toBe('SUI');
    expect(coins?.[0]?.decimals).toBe(9);
  });
});
