import { SuiClient, getFullnodeUrl } from '@mysten/sui/client';
import { RemoveLiquidityV2 } from './RemoveLiquidityV2';

describe('RemoveLiquidityV2', () => {
  const network = 'testnet';
  const suiClient = new SuiClient({
    url: getFullnodeUrl(network),
  });

  const removeLiquidityV2 = new RemoveLiquidityV2(network, suiClient);
  const sender = `0xa52b3f2e8b3f0dac377f753eeade7f7c6b329a97c227425a59b91c1e2f8dff2c`;

  it('buildTransaction should work', async () => {
    const tx = await removeLiquidityV2.buildTransaction(
      '0xebebb67fc6fc6a74be5e57d90563c709631b4da86091c0926db81894add36ed3::pair::LP<0x2::sui::SUI, 0xea10912247c015ead590e481ae8545ff1518492dee41d6d03abdad828c1d2bde::usdc::USDC>',
      '100000000',
      {
        x: '0x2::sui::SUI',
        y: '0xea10912247c015ead590e481ae8545ff1518492dee41d6d03abdad828c1d2bde::usdc::USDC',
      },
      {
        x: '100000000',
        y: '100000000',
      },
      sender,
      1
    );

    const resp = await suiClient.devInspectTransactionBlock({
      transactionBlock: tx,
      sender,
    });

    expect(resp.effects.status.status === 'success').toBeTruthy();
  });
});
