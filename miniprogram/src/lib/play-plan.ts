import { createMiniGuideClient } from "@ledger/travel-guide/mini";
import { requestJson } from "./api";
export const miniGuide = createMiniGuideClient(async (path, authenticated) => {
  const response = await requestJson(path, "GET", undefined, authenticated);
  return { status: response.statusCode, data: response.data };
});
