import { fromB64, fromHEX } from '@mysten/bcs'
import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519'
import { Secp256k1Keypair } from '@mysten/sui/keypairs/secp256k1'

import { NFT } from '../types/sui'
import { extractStructTagFromType } from './contracts'
import { d, decimalsMultiplier } from './numbers'
import {
  getObjectDisplay,
} from './objects'

/**
 * Converts an amount to a decimal value, based on the number of decimals specified.
 * @param  {number | string} amount - The amount to convert to decimal.
 * @param  {number | string} decimals - The number of decimals to use in the conversion.
 * @returns {number} - Returns the converted amount as a number.
 */
export function toDecimalsAmount(amount: number | string, decimals: number | string): number {
  const mul = decimalsMultiplier(d(decimals))

  return Number(d(amount).mul(mul))
}

/**
 * Converts a bigint to an unsigned integer of the specified number of bits.
 * @param {bigint} int - The bigint to convert.
 * @param {number} bits - The number of bits to use in the conversion. Defaults to 32 bits.
 * @returns {string} - Returns the converted unsigned integer as a string.
 */
export function asUintN(int: bigint, bits = 32) {
  return BigInt.asUintN(bits, BigInt(int)).toString()
}

/**
 * Converts a bigint to a signed integer of the specified number of bits.
 * @param {bigint} int - The bigint to convert.
 * @param {number} bits - The number of bits to use in the conversion. Defaults to 32 bits.
 * @returns {number} - Returns the converted signed integer as a number.
 */
export function asIntN(int: bigint, bits = 32) {
  return Number(BigInt.asIntN(bits, BigInt(int)))
}

/**
 * Converts an amount in decimals to its corresponding numerical value.
 * @param {number|string} amount - The amount to convert.
 * @param {number|string} decimals - The number of decimal places used in the amount.
 * @returns {number} - Returns the converted numerical value.
 */
export function fromDecimalsAmount(amount: number | string, decimals: number | string): number {
  const mul = decimalsMultiplier(d(decimals))

  return Number(d(amount).div(mul))
}

/**
 * Converts a secret key in string or Uint8Array format to an Ed25519 key pair.
 * @param {string|Uint8Array} secretKey - The secret key to convert.
 * @param {string} ecode - The encoding of the secret key ('hex' or 'base64'). Defaults to 'hex'.
 * @returns {Ed25519Keypair} - Returns the Ed25519 key pair.
 */
export function secretKeyToEd25519Keypair(secretKey: string | Uint8Array, ecode: 'hex' | 'base64' = 'hex'): Ed25519Keypair {
  if (secretKey instanceof Uint8Array) {
    const key = Buffer.from(secretKey)
    return Ed25519Keypair.fromSecretKey(new Uint8Array(key))
  }

  const hexKey = ecode === 'hex' ? fromHEX(secretKey) : fromB64(secretKey)
  return Ed25519Keypair.fromSecretKey(hexKey)
}

/**
 * Converts a secret key in string or Uint8Array format to a Secp256k1 key pair.
 * @param {string|Uint8Array} secretKey - The secret key to convert.
 * @param {string} ecode - The encoding of the secret key ('hex' or 'base64'). Defaults to 'hex'.
 * @returns {Ed25519Keypair} - Returns the Secp256k1 key pair.
 */
export function secretKeyToSecp256k1Keypair(secretKey: string | Uint8Array, ecode: 'hex' | 'base64' = 'hex'): Secp256k1Keypair {
  if (secretKey instanceof Uint8Array) {
    const key = Buffer.from(secretKey)
    return Secp256k1Keypair.fromSecretKey(new Uint8Array(key))
  }
  const hexKey = ecode === 'hex' ? fromHEX(secretKey) : fromB64(secretKey)
  return Secp256k1Keypair.fromSecretKey(hexKey)
}

/**
 * Builds a pool name based on two coin types and tick spacing.
 * @param {string} coin_type_a - The type of the first coin.
 * @param {string} coin_type_b - The type of the second coin.
 * @param {string} tick_spacing - The tick spacing of the pool.
 * @returns {string} - The name of the pool.
 */
function buildPoolName(coin_type_a: string, coin_type_b: string, tick_spacing: string) {
  const coinNameA = extractStructTagFromType(coin_type_a).name
  const coinNameB = extractStructTagFromType(coin_type_b).name
  return `${coinNameA}-${coinNameB}[${tick_spacing}]`
}

/**
 * Builds an NFT object based on a response containing information about the NFT.
 * @param {any} objects - The response containing information about the NFT.
 * @returns {NFT} - The built NFT object.
 */
export function buildNFT(objects: any): NFT {
  const fields = getObjectDisplay(objects).data
  const nft: NFT = {
    creator: '',
    description: '',
    image_url: '',
    link: '',
    name: '',
    project_url: '',
  }
  if (fields) {
    nft.creator = fields.creator
    nft.description = fields.description
    nft.image_url = fields.image_url
    nft.link = fields.link
    nft.name = fields.name
    nft.project_url = fields.project_url
  }
  return nft
}
