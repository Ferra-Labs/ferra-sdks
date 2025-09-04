import FerraClmmSDK, { SdkOptions } from '../../src'

const SDKConfig = {
  clmmConfig: {
    pools_id: '0xf699e7f2276f5c9a75944b37a0c5b5d9ddfd2471bf6242483b03ab2887d198d0',
    global_config_id: '0xdaa46292632c3c4d8f31f23ea0f9b36a28ff3677e9684980e4438403a67a3d8f',
    global_rewarder_vault_id: '0xce7bceef26d3ad1f6d9b6f13a953f053e6ed3ca77907516481ce99ae8e588f2b',
  }
}

// test on mainnet
export const clmmTestnet: SdkOptions = {
  fullRpcUrl: 'https://sui-mainnet-endpoint.blockvision.org',
  simulationAccount: {
    address: '0x0000000000000000000000000000000000000000000000000000000000000000',
  },
  clmm_pool: {
    package_id: '0x1eabed72c53feb3805120a081dc15963c204dc8d091542592abaf7a35689b2fb',
    published_at: '0x157468379cfe5616c063ae39a889dd184ad48350d3e08f8d9b4ade22b8e3fb61',
    config: SDKConfig.clmmConfig,
  },
  integrate: {
    package_id: '0x996c4d9480708fb8b92aa7acf819fb0497b5ec8e65ba06601cae2fb6db3312c3',
    published_at: '0x15c0555d7601d98ca2659a8387d377a81b1e285ee0808484e101f96d05806187',
  },
  swapCountUrl: 'https://api-dev.ferra.xyz/clmm/swap/pools'
}


export const TestnetSDK = new FerraClmmSDK(clmmTestnet)
