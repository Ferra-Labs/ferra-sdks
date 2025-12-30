import { BinMath } from '../src/math'

async function main() {
  let price = 0.1
  let i = 0
  while (i < 10) {
    const id = BinMath.getIdFromPrice(price, 10, 9, 6)
    console.log('id', id)
    price = BinMath.getPriceFromId(8386013, 20, 9, 6)
    console.log('id', price)
    i++
  }
}

main()
