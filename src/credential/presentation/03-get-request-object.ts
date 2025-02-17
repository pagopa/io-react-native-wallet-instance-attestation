import { hasStatusOrThrow, type Out } from "../../utils/misc";
import type { StartFlow } from "./01-start-flow";
import { RequestObjectWalletCapabilities } from "./types";

export type GetRequestObject = (
  requestUri: Out<StartFlow>["requestUri"],
  context: {
    appFetch?: GlobalFetch["fetch"];
    walletInstanceAttestation: string;
    walletCapabilities?: RequestObjectWalletCapabilities;
  }
) => Promise<{ requestObjectEncodedJwt: string }>;

/**
 * Obtain the Request Object for RP authentication. Both the GET and POST `request_uri_method` are supported.
 * @see https://italia.github.io/eudi-wallet-it-docs/versione-corrente/en/relying-party-solution.html
 *
 * @param requestUri The url for the Relying Party to connect with
 * @param rpConf The Relying Party's configuration * @param context.walletInstanceAttestation The Wallet Instance Attestation token
 * @param context.walletCapabilities (optional) An object containing the wallet technical capabilities that will be sent with a POST request
 * @param context.appFetch (optional) fetch api implementation. Default: built-in fetch
 * @returns The Request Object that describes the presentation
 */
export const getRequestObject: GetRequestObject = async (
  requestUri,
  { appFetch = fetch, walletCapabilities }
) => {
  if (walletCapabilities) {
    // Validate external input
    const { wallet_metadata, wallet_nonce } =
      RequestObjectWalletCapabilities.parse(walletCapabilities);

    const formUrlEncodedBody = new URLSearchParams({
      wallet_metadata: JSON.stringify(wallet_metadata),
      ...(wallet_nonce && { wallet_nonce }),
    });

    const requestObjectEncodedJwt = await appFetch(requestUri, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: formUrlEncodedBody.toString(),
    })
      .then(hasStatusOrThrow(200))
      .then((res) => res.text());

    return {
      requestObjectEncodedJwt,
    };
  }

  const requestObjectEncodedJwt = await appFetch(requestUri, {
    method: "GET",
  })
    .then(hasStatusOrThrow(200))
    .then((res) => res.text());

  return {
    requestObjectEncodedJwt,
  };
};
