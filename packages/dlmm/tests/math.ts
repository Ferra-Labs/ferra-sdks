import Decimal from "decimal.js";
import { DistributionUtils } from "../src";


console.log(DistributionUtils.createParams("BID_ASK", {
  activeId: 8388608,
  binRange: [8388608 - 5, 8388608 + 5],
  parsedAmounts: [Decimal(1000), Decimal(2000)]
}));

console.log(DistributionUtils.createParams("CURVE", {
  activeId: 8388608,
  binRange: [8388608 - 5, 8388608 + 5],
  parsedAmounts: [Decimal(1000), Decimal(2000)],
  alpha: 0.5
}));

console.log(DistributionUtils.createParams("SPOT", {
  activeId: 8388608,
  binRange: [8388608 - 5, 8388608 + 5],
  parsedAmounts: [Decimal(1000), Decimal(0)],
}));
