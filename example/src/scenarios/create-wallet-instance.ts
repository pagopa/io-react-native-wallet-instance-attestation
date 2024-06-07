import {
  WalletInstance,
  type IntegrityContext,
} from "@pagopa/io-react-native-wallet";
import { error, result } from "./types";

import { WALLET_PROVIDER_BASE_URL } from "@env";
import appFetch from "../utils/fetch";

const walletProviderBaseUrl = WALLET_PROVIDER_BASE_URL;

/**
 * Create a Wallet Instance by providing an integrity context.
 */
export default (integrityContext?: IntegrityContext) => async () => {
  try {
    if (!integrityContext)
      throw new Error("Call prepare integrity context first");

    const createdWalletInstance = await WalletInstance.createWalletInstance({
      integrityContext,
      walletProviderBaseUrl,
      appFetch,
    });
    return result(createdWalletInstance);
  } catch (e) {
    console.error(e);
    return error(e);
  }
};
