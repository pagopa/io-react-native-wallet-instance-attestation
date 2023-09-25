import { generate } from "@pagopa/io-react-native-crypto";
import {
  WalletInstanceAttestation,
  createCryptoContextFor,
} from "@pagopa/io-react-native-wallet";
import { error, result } from "./types";

const walletProviderBaseUrl = "https://io-d-wallet-it.azurewebsites.net";

export default async (
  walletInstanceKeyTag = Math.random().toString(36).substr(2, 5)
) => {
  try {
    // generate Key for Wallet Instance Attestation
    // ensure the key esists befor starting the issuing process
    await generate(walletInstanceKeyTag);

    const wiaCryptoContext = createCryptoContextFor(walletInstanceKeyTag);
    const issuingAttestation = WalletInstanceAttestation.getAttestation({
      wiaCryptoContext,
    });

    // generate Wallet Instance Attestation
    const instanceAttestation = await issuingAttestation(walletProviderBaseUrl);

    return result(instanceAttestation);
  } catch (e) {
    console.error(e);
    return error(e);
  }
};
