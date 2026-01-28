import { SolapiMessageService } from "solapi";

export const solapi = new SolapiMessageService(
  process.env.SOLAPI_API_KEY!,
  process.env.SOLAPI_API_SECRET!
);

export const SOLAPI_FROM_PHONE = process.env.SOLAPI_FROM_PHONE!;
