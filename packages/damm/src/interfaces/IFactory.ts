import { Address, U256 } from "../types/basic-type";

// ===== Constants =====
export const LB_FACTORY_CONSTANTS = {
    MIN_BIN_STEP: "1", // 0.001%
    MAX_FLASH_LOAN_FEE: "100000000000000000" // 10%
} as const;

// ===== Utility Types =====
export interface CreateFactoryParams {
    owner: Address;
    flashLoanFee: U256;
    feeRecipient: Address;
}

// ===== Utility Types =====
export interface CreateLBPairParams {
    tokenXType: string;  // e.g., "0x2::sui::SUI"
    tokenYType: string;  // e.g., "0x...::usdc::USDC"
    activeId: number;    // u32
    binStep: number;     // u16
    baseFactor: number;
    activationTimestamp?: number;
    feeMode?: 0 | 1;
    isQuoteY?: boolean;
    enableFeeScheduler?: boolean;
    enableDynamicFee?: boolean;
}
