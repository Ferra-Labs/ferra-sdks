import { checkValidSuiAddress } from '../src/utils'

describe('Utils functions test', () => {
    test('test check invalid sui address', async () => {
        const testAddress = [
            {
                'address': '',
                'result': false
            },
            {
                'address': '0x0',
                'result': false,
            },
            {
                'address': '0x0868b71c0cba55bf0faf6c40df8c179c67a4d0ba0e79965b68b3d72d7dfbf666',
                'result': true
            }
        ]

        for (const item of testAddress) {
            console.log(checkValidSuiAddress(item.address))
            expect(checkValidSuiAddress(item.address)).toBe(item.result)
        }
    })

})
