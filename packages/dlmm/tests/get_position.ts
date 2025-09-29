import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519'
import { initFerraSDK } from '../src'
import { fromBase64 } from '@mysten/sui/utils'
import { decodeSuiPrivateKey } from '@mysten/sui/cryptography'

const SUI_COINTYPE = '0x2::sui::SUI'
const USDC_COINTYPE = '0xb4ae83dbcf37037c7759c76df7a330278b897c0c322121efb10067f325b1a6d1::fusdc::FUSDC'

export async function main() {
  const privateKey = process.env.SUI_WALLET_PRIVATEKEY || ''
  const secret = process.env.SUI_WALLET_SECRET || ''
  const mnemonic = process.env.SUI_WALLET_MNEMONICS || ''
  let keypair: Ed25519Keypair
  if (privateKey) {
    keypair = Ed25519Keypair.fromSecretKey(decodeSuiPrivateKey(privateKey).secretKey)
  } else if (secret && secret.length > 0) {
    keypair = Ed25519Keypair.fromSecretKey(fromBase64(secret).slice(1, 33))
  } else {
    keypair = Ed25519Keypair.deriveKeypair(mnemonic)
  }

  const wallet = keypair.getPublicKey().toSuiAddress()
  const sdk = initFerraSDK({ network: 'beta', wallet })
  const pair = await sdk.Pair.getPair('0x1873d1ee77db0d6f94eb1bda9abc394825f5613723760654dc7589b38ed3263f')
  const position = await sdk.Position.getPositionRewardsV2(
    pair!,
    '0xd78c5a37eaf0d579e91a4c3b78f8299a57b2c6a253353c77331f7dc87508b9b3',
    [
      {
        "amountX": 0,
        "amountY": 10405875,
        "liquidity": 1197,
        "id": 8400017
      },
      {
        "amountX": 0,
        "amountY": 10410020,
        "liquidity": 1197,
        "id": 8400018
      },
      {
        "amountX": 0,
        "amountY": 10406523,
        "liquidity": 1196,
        "id": 8400019
      },
      {
        "amountX": 0,
        "amountY": 10403021,
        "liquidity": 1195,
        "id": 8400020
      },
      {
        "amountX": 0,
        "amountY": 10408223,
        "liquidity": 1195,
        "id": 8400021
      },
      {
        "amountX": 0,
        "amountY": 10404713,
        "liquidity": 1194,
        "id": 8400022
      },
      {
        "amountX": 0,
        "amountY": 10409915,
        "liquidity": 1194,
        "id": 8400023
      },
      {
        "amountX": 0,
        "amountY": 10406397,
        "liquidity": 1193,
        "id": 8400024
      },
      {
        "amountX": 0,
        "amountY": 10402873,
        "liquidity": 1192,
        "id": 8400025
      },
      {
        "amountX": 0,
        "amountY": 10408074,
        "liquidity": 1192,
        "id": 8400026
      },
      {
        "amountX": 0,
        "amountY": 10404542,
        "liquidity": 1191,
        "id": 8400027
      },
      {
        "amountX": 0,
        "amountY": 10409745,
        "liquidity": 1191,
        "id": 8400028
      },
      {
        "amountX": 0,
        "amountY": 10406205,
        "liquidity": 1190,
        "id": 8400029
      },
      {
        "amountX": 0,
        "amountY": 10402659,
        "liquidity": 1189,
        "id": 8400030
      },
      {
        "amountX": 22364,
        "amountY": 3647446,
        "liquidity": 1188,
        "id": 8400031
      },
      {
        "amountX": 34475,
        "amountY": 0,
        "liquidity": 1189,
        "id": 8400032
      },
      {
        "amountX": 34475,
        "amountY": 0,
        "liquidity": 1189,
        "id": 8400033
      },
      {
        "amountX": 34475,
        "amountY": 0,
        "liquidity": 1189,
        "id": 8400034
      },
      {
        "amountX": 34475,
        "amountY": 0,
        "liquidity": 1189,
        "id": 8400035
      },
      {
        "amountX": 34475,
        "amountY": 0,
        "liquidity": 1189,
        "id": 8400036
      },
      {
        "amountX": 34475,
        "amountY": 0,
        "liquidity": 1189,
        "id": 8400037
      },
      {
        "amountX": 34475,
        "amountY": 0,
        "liquidity": 1189,
        "id": 8400038
      },
      {
        "amountX": 34475,
        "amountY": 0,
        "liquidity": 1189,
        "id": 8400039
      },
      {
        "amountX": 34475,
        "amountY": 0,
        "liquidity": 1189,
        "id": 8400040
      },
      {
        "amountX": 34475,
        "amountY": 0,
        "liquidity": 1189,
        "id": 8400041
      },
      {
        "amountX": 34475,
        "amountY": 0,
        "liquidity": 1189,
        "id": 8400042
      },
      {
        "amountX": 34475,
        "amountY": 0,
        "liquidity": 1189,
        "id": 8400043
      },
      {
        "amountX": 34475,
        "amountY": 0,
        "liquidity": 1189,
        "id": 8400044
      },
      {
        "amountX": 34475,
        "amountY": 0,
        "liquidity": 1189,
        "id": 8400045
      }
    ].map((v) => v.id)
  )

  console.log('res', position)
}

process.argv.at(-1) == __filename && main()
