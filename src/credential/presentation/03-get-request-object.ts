import { hasStatusOrThrow, type Out } from "../../utils/misc";
import type { StartFlow } from "./01-start-flow";

export type GetRequestObject = (
  requestUri: Out<StartFlow>["requestUri"],
  context?: {
    appFetch?: GlobalFetch["fetch"];
  }
) => Promise<{ requestObjectEncodedJwt: string }>;

/**
 * Obtain the Request Object for RP authentication
 * @see https://italia.github.io/eudi-wallet-it-docs/versione-corrente/en/relying-party-solution.html
 *
 * @param requestUri The request uri of the Relying Party
 * @param context.appFetch (optional) fetch api implementation. Default: built-in fetch
 * @returns The Request Object that describes the presentation
 */
export const getRequestObject: GetRequestObject = async (
  requestUri,
  context = {}
) => {
  const { appFetch = fetch } = context;
  const requestObjectEncodedJwt = await appFetch(requestUri, {
    method: "GET",
  })
    .then(hasStatusOrThrow(200))
    .then((res) => res.text());

  return {
    requestObjectEncodedJwt,
  };
};
