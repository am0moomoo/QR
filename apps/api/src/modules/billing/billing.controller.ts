import { Controller, Get } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";

@ApiTags("billing")
@Controller("billing")
export class BillingController {
  @Get("plans")
  listPlans() {
    return {
      items: [
        { code: "free", adsEnabled: true, apiAccess: false },
        { code: "lite", adsEnabled: true, apiAccess: false },
        { code: "premium", adsEnabled: false, apiAccess: true }
      ]
    };
  }
}
